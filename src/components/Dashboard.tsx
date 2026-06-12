/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Filter, Search, AlertCircle, FileSpreadsheet, Eye, ExternalLink, Calendar, 
  Trash2, Plus, ArrowRightLeft, DollarSign, Activity, FileText, CheckCircle, 
  MapPin, User, Car, X, ShieldCheck, ArrowRight, RefreshCw,
  Clock, Sparkles, ShieldAlert, PhoneCall, Database
} from 'lucide-react';
import { CaseRow, FilterState, DashboardKpis, DashboardCharts, DateFilter } from '../types';
import { getDerivedFlags, buildKpis, buildCharts, splitTasks } from '../data/mockData';
import { AppUser } from '../lib/firebaseAuth';
import { parseDateString } from '../lib/dateUtils';
import { calculateOperationsMatrix, MatrixRow } from '../lib/matrixCalculator';

const DATE_OPTIONS = [
  {
    label: "Core Case Dates",
    options: [
      { value: "tokenDate", label: "Token Date" },
      { value: "tokenDateTime", label: "Token Date & Time" },
      { value: "bookingDate", label: "Booking Date" },
      { value: "expectedDeliveryDate", label: "Expected Delivery Date" },
      { value: "expectedDeliveryTime", label: "Expected Delivery Time" },
      { value: "actualDeliveryDate", label: "Actual Delivery Date" },
      { value: "mlEstimatedDeliveryDate", label: "ML Est Delivery Date" }
    ]
  },
  {
    label: "Payments & OD",
    options: [
      { value: "lastPaymentDate", label: "Last Payment Date" },
      { value: "expectedOdCompletionDate", label: "OD Completion Date" },
      { value: "eddReviewerDate", label: "EDD Date (Reviewer)" }
    ]
  },
  {
    label: "Cancellations & Updates",
    options: [
      { value: "cancelReqDate", label: "Cancellation Req Date" },
      { value: "cancellationDate", label: "Cancellation Date" },
      { value: "tokenAutoCancellationExtendedDate", label: "Auto Cancel Ext Date" },
      { value: "dealStatusUpdatedAt", label: "Deal Status Update Date" },
      { value: "latestRemarkDate", label: "Latest Remark Date" },
      { value: "updatedAt", label: "System Update Date" }
    ]
  },
  {
    label: "CRM & Outbound Calls",
    options: [
      { value: "lastCallAt", label: "Last Call Date" },
      { value: "followupAt", label: "Followup Date" },
      { value: "gmailPendencyDate", label: "Gmail Pendency Date" }
    ]
  },
  {
    label: "Milestones & Journey",
    options: [
      { value: "latestLeadCreationTimestamp", label: "Lead Creation Date" },
      { value: "latestLoginTime", label: "Login Time" },
      { value: "latestCreditAssessedTimestamp", label: "Credit Assessed Date" },
      { value: "latestDiligenceAssessedTimestamp", label: "Diligence Assessed Date" },
      { value: "latestFcuAssessedTimestamp", label: "FCU Assessed Date" },
      { value: "tncGeneratedDate", label: "TnC Generated Date" },
      { value: "tncAcceptedTimestamp", label: "TnC Accepted Date" },
      { value: "fcuSentDate", label: "FCU Sent Date" },
      { value: "sentToRcuTimestamp", label: "Sent to RCU Date" },
      { value: "sentToOpsTimestamp", label: "Sent to Ops Date" },
      { value: "submitToOpsTimestamp", label: "Submit to Ops Date" },
      { value: "opsDisbursalTimestamp", label: "Ops Disbursal Date" },
      { value: "financeDisbursedTimestamp", label: "Finance Disbursed Date" },
      { value: "sheetLoginTimestamp", label: "Sheet Login Date" }
    ]
  }
];

const MILESTONE_STAGES = [
  'Lead Created',
  'Case Logged In',
  'Credit Assessed',
  'Diligence Assessed',
  'T&C Accepted',
  'FCU Checked',
  'Submitted To Ops',
  'Finance Disbursed'
];

const getMilestoneStatus = (row: CaseRow, milestone: string): boolean => {
  switch (milestone) {
    case 'Lead Created':
      return !!row.latestLeadCreationTimestamp;
    case 'Case Logged In':
      return !!(row.latestLoginTime || row.sheetLoginTimestamp);
    case 'Credit Assessed':
      return !!row.latestCreditAssessedTimestamp;
    case 'Diligence Assessed':
      return !!row.latestDiligenceAssessedTimestamp;
    case 'T&C Accepted':
      return !!row.tncAcceptedTimestamp;
    case 'FCU Checked':
      return !!(row.latestFcuAssessedTimestamp || row.fcuSentDate);
    case 'Submitted To Ops':
      return !!(row.submitToOpsTimestamp || row.sentToOpsTimestamp);
    case 'Finance Disbursed':
      return !!(row.financeDisbursedTimestamp || row.opsDisbursalTimestamp);
    default:
      return false;
  }
};

interface DashboardProps {
  rows: CaseRow[];
  setRows: React.Dispatch<React.SetStateAction<CaseRow[]>>;
  filterOptions: Record<string, string[]>;
  sheetId: string;
  sheetName: string;
  accessToken: string | null;
  user: AppUser | null;
}

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedString: string;
  onChange: (val: string) => void;
  placeholder: string;
  showBlank?: boolean;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  optionLabels?: Record<string, string>;
}

function MultiSelectDropdown({
  label,
  options,
  selectedString,
  onChange,
  placeholder,
  showBlank = false,
  isActive,
  isOpen,
  onToggle,
  optionLabels
}: MultiSelectDropdownProps) {
  const totalOptionsTrimmed = useMemo(() => {
    const list = options.map(o => o.trim());
    if (showBlank) {
      list.push('Blank');
    }
    return list;
  }, [options, showBlank]);

  const effectiveSelectedList = useMemo(() => {
    if (selectedString === 'All') return totalOptionsTrimmed;
    if (!selectedString) return [];
    return selectedString.split('|||').map(s => s.trim()).filter(Boolean);
  }, [selectedString, totalOptionsTrimmed]);

  const handleToggleOption = (val: string) => {
    const trimmedVal = val.trim();
    let newList: string[];
    if (effectiveSelectedList.includes(trimmedVal)) {
      newList = effectiveSelectedList.filter(v => v !== trimmedVal);
    } else {
      newList = [...effectiveSelectedList, trimmedVal];
    }
    
    if (newList.length === totalOptionsTrimmed.length) {
      onChange('All');
    } else if (newList.length === 0) {
      onChange('');
    } else {
      onChange(newList.join('|||'));
    }
  };

  const handleSelectAll = () => {
    onChange('All');
  };

  const handleClear = () => {
    onChange('');
  };

  // Label display logic
  const displayText = useMemo(() => {
    if (selectedString === 'All') return placeholder;
    if (!selectedString) return 'None Selected';
    const parts = selectedString.split('|||').map(s => s.trim()).filter(Boolean);
    const getLabel = (val: string) => {
      if (val === 'Blank') return 'Blank / Empty';
      if (optionLabels && optionLabels[val]) return optionLabels[val];
      return val;
    };
    if (parts.length === 1) {
      return getLabel(parts[0]);
    }
    return `${getLabel(parts[0])} (+${parts.length - 1})`;
  }, [selectedString, placeholder, optionLabels]);

  return (
    <div className="relative">
      <label className={`block text-[10px] uppercase font-bold tracking-wider mb-1 transition-all duration-200 ${
        isActive ? 'text-amber-700 font-extrabold' : 'text-slate-400'
      }`}>
        {label}
      </label>
      
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-xs p-2 px-3 border rounded-xl cursor-pointer transition-all duration-200 flex items-center justify-between gap-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 ${
          isActive 
            ? 'border-amber-400 bg-amber-50/50 text-amber-900 font-semibold ring-1 ring-amber-400/30 shadow-sm' 
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'
        }`}
      >
        <span className="truncate max-w-[120px]">{displayText}</span>
        <span className="text-[10px] text-slate-400">▼</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close dropdown on click outside */}
          <div className="fixed inset-0 z-20 cursor-default" onClick={onToggle} />
          
          <div className="absolute left-0 mt-1.5 w-56 max-h-60 bg-white border border-slate-150 rounded-xl shadow-lg z-30 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Header controls */}
            <div className="p-2 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500 bg-slate-50/50">
              <button 
                type="button" 
                onClick={handleSelectAll} 
                className="hover:text-slate-800 cursor-pointer"
              >
                Select All
              </button>
              <button 
                type="button" 
                onClick={handleClear} 
                className="hover:text-slate-800 cursor-pointer"
              >
                Clear
              </button>
            </div>
            
            {/* Options List */}
            <div className="overflow-y-auto p-1.5 space-y-0.5 max-h-48 text-slate-700 text-xs">
              {showBlank && (
                <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer font-sans select-none">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedList.includes('Blank')}
                    onChange={() => handleToggleOption('Blank')}
                    className="rounded text-amber-500 focus:ring-amber-500/20 w-3.5 h-3.5"
                  />
                  <span>Blank / Empty</span>
                </label>
              )}
              {options.map(opt => (
                <label key={opt} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer font-sans select-none">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedList.includes(opt.trim())}
                    onChange={() => handleToggleOption(opt)}
                    className="rounded text-amber-500 focus:ring-amber-500/20 w-3.5 h-3.5"
                  />
                  <span className="truncate">{optionLabels?.[opt] || opt}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard({ 
  rows, 
  setRows, 
  filterOptions,
  sheetId,
  sheetName,
  accessToken,
  user
}: DashboardProps) {
  const [filters, setFilters] = useState<FilterState>({
    city: 'All',
    hubName: 'All',
    tokenType: 'All',
    tokenTypeWithNrt: 'All',
    rmName: 'All',
    dcName: 'All',
    paymentType: 'All',
    leadStage: 'All',
    dealStatus: 'All',
    funnelStage: 'All',
    sheetFinalStatus: 'All',
    formFinalStatus: 'All',
    gmailPendencyStatus: 'All',
    taskBucket: 'All',
    derivedStatus: 'All',
    dateField: 'All',
    startDate: '',
    endDate: '',
    searchQuery: '',
    eddStatus: 'All',
    cancelReason: 'All',
    leadDsChannel: 'All',
    readyToDeliver: 'All',
    dateFilters: [],
    minPaymentPercentage: 'All'
  });

  // Cancelled-to-Delivered (C2D) conversions detection
  const c2dStats = useMemo(() => {
    const userBookings: Record<string, CaseRow[]> = {};
    rows.forEach(row => {
      const id = row.userId || row.uid || row.leadId;
      if (id) {
        if (!userBookings[id]) userBookings[id] = [];
        userBookings[id].push(row);
      }
    });

    const c2dUserIds = new Set<string>();
    const c2dBookingIds = new Set<string>();

    Object.entries(userBookings).forEach(([userId, uRows]) => {
      const hasCancelled = uRows.some(r => r.leadStage === 'CANCELLED' || r.dealStatus === 'CANCEL' || r.cancelReason);
      const hasDelivered = uRows.some(r => r.leadStage === 'DELIVERED');
      if (hasCancelled && hasDelivered) {
        c2dUserIds.add(userId);
        uRows.forEach(r => {
          if (r.leadStage === 'CANCELLED' || r.dealStatus === 'CANCEL' || r.cancelReason) {
            c2dBookingIds.add(r.bookingId);
          }
        });
      }
    });

    return {
      c2dUsersCount: c2dUserIds.size,
      c2dBookingIds,
      c2dBookingsCount: c2dBookingIds.size
    };
  }, [rows]);

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'actions' | 'journey' | 'pmax' | 'copilot' | 'raw_data'>('actions');
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [tempRowData, setTempRowData] = useState<Partial<CaseRow>>({});
  const [savingRow, setSavingRow] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fetchingLatestRow, setFetchingLatestRow] = useState(false);

  // Dynamically extract all unique task values from current set of rows
  const allUniqueTasks = useMemo(() => {
    const tasksSet = new Set<string>();
    rows.forEach(row => {
      if (row.taskBucket) {
        splitTasks(row.taskBucket).forEach(t => {
          if (t && t.trim()) {
            tasksSet.add(t.trim());
          }
        });
      }
    });
    return Array.from(tasksSet).sort();
  }, [rows]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [activeTab, setActiveTab] = useState<'ops' | 'performance' | 'loss' | 'ledger'>('ops');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Sorting states
  const [sortField, setSortField] = useState<keyof CaseRow | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: keyof CaseRow) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleExportImage = () => {
    // Target table wrapper specifically
    const tableEl = document.getElementById('interactive-dataset-table-wrapper');
    if (!tableEl) return;

    const exportBtn = document.getElementById('btn-export-image');
    if (exportBtn) {
      exportBtn.innerHTML = 'Exporting...';
      exportBtn.setAttribute('disabled', 'true');
    }

    const loadAndRenderHtmlToImage = () => {
      // @ts-ignore
      window.htmlToImage.toPng(tableEl, {
        backgroundColor: '#ffffff',
        style: {
          margin: '0',
          padding: '12px',
        }
      }).then((dataUrl: string) => {
        const link = document.createElement('a');
        link.download = 'cars24_ops_ledger.png';
        link.href = dataUrl;
        link.click();
        if (exportBtn) {
          exportBtn.innerHTML = 'Export PNG';
          exportBtn.removeAttribute('disabled');
        }
      }).catch((err: any) => {
        console.warn('html-to-image failed, falling back to html2canvas...', err);
        loadAndRenderHtml2Canvas();
      });
    };

    const loadAndRenderHtml2Canvas = () => {
      const renderCanvas = () => {
        // @ts-ignore
        window.html2canvas(tableEl, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
        }).then((canvas: HTMLCanvasElement) => {
          const link = document.createElement('a');
          link.download = 'cars24_ops_ledger.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          if (exportBtn) {
            exportBtn.innerHTML = 'Export PNG';
            exportBtn.removeAttribute('disabled');
          }
        }).catch((err2: any) => {
          console.error('html2canvas also failed', err2);
          alert('Failed to generate image export. Please try again.');
          if (exportBtn) {
            exportBtn.innerHTML = 'Export PNG';
            exportBtn.removeAttribute('disabled');
          }
        });
      };

      // @ts-ignore
      if (window.html2canvas) {
        renderCanvas();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = renderCanvas;
        script.onerror = () => {
          alert('Failed to load image export fallback library. Please check your internet connection.');
          if (exportBtn) {
            exportBtn.innerHTML = 'Export PNG';
            exportBtn.removeAttribute('disabled');
          }
        };
        document.body.appendChild(script);
      }
    };

    // Try html-to-image first (better Tailwind v4 CSS support)
    // @ts-ignore
    if (window.htmlToImage) {
      loadAndRenderHtmlToImage();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js';
      script.onload = loadAndRenderHtmlToImage;
      script.onerror = () => {
        console.warn('html-to-image CDN failed to load, trying html2canvas fallback...');
        loadAndRenderHtml2Canvas();
      };
      document.body.appendChild(script);
    }
  };

  const matchMulti = (filterVal: string, rowVal: any) => {
    if (filterVal === 'All') return true;
    if (filterVal === '') return false;
    if (!filterVal) return true;
    const selected = filterVal.split('|||').map(s => s.trim().toLowerCase());
    const rowStr = String(rowVal || '').trim().toLowerCase();
    
    if (selected.includes('blank')) {
      if (rowStr === '') return true;
    }
    return selected.includes(rowStr);
  };

  // Debounced search text state
  const [localSearch, setLocalSearch] = useState(filters.searchQuery);

  // Sync back local search state if filters.searchQuery is cleared externally
  useEffect(() => {
    setLocalSearch(filters.searchQuery);
  }, [filters.searchQuery]);

  // Debounce keypresses to prevent massive chart animations during active typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setFilters(p => {
        if (p.searchQuery === localSearch) return p;
        return { ...p, searchQuery: localSearch };
      });
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [localSearch]);

  // Reset page number back to 1 when filters are changed
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Pre-calculate all EDD labels once per mount / day
  const eddLabels = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getOrdinalSuffix = (day: number) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };

    const formatDateWithSuffix = (date: Date) => {
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const day = date.getDate();
      const month = months[date.getMonth()];
      return `${day}${getOrdinalSuffix(day)} ${month}`;
    };

    const addDays = (d: Date, n: number) => {
      const newD = new Date(d.getTime());
      newD.setDate(newD.getDate() + n);
      return newD;
    };

    const formatRange = (start: Date, end: Date) => {
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const startDay = start.getDate();
      const endDay = end.getDate();
      const startMonth = months[start.getMonth()];
      const endMonth = months[end.getMonth()];
      
      if (startMonth === endMonth) {
        return `${startDay}${getOrdinalSuffix(startDay)} to ${endDay}${getOrdinalSuffix(endDay)} ${startMonth}`;
      }
      return `${startDay}${getOrdinalSuffix(startDay)} ${startMonth} to ${endDay}${getOrdinalSuffix(endDay)} ${endMonth}`;
    };

    return {
      today,
      labelToday: formatDateWithSuffix(today),
      labelD1: formatDateWithSuffix(addDays(today, 1)),
      labelD2: formatDateWithSuffix(addDays(today, 2)),
      labelD3_6: formatRange(addDays(today, 3), addDays(today, 6)),
      labelD7Plus: `${formatDateWithSuffix(addDays(today, 7))} +`
    };
  }, []);

  // Helper to evaluate if a row matches the current filters, optionally ignoring one specific filter
  const isRowMatching = useCallback((row: CaseRow, ignoreKey?: string) => {
    // If fuzzy search query is active, ignore all other filters and only do fuzzy text search
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      return (
        String(row.bookingId || '').toLowerCase().includes(query) ||
        String(row.carRegNo || '').toLowerCase().includes(query) ||
        String(row.userId || '').toLowerCase().includes(query) ||
        String(row.make || '').toLowerCase().includes(query) ||
        String(row.model || '').toLowerCase().includes(query)
      );
    }

    if (ignoreKey !== 'city' && ignoreKey !== 'city_and_hub' && !matchMulti(filters.city, row.city)) return false;
    if (ignoreKey !== 'hubName' && ignoreKey !== 'city_and_hub' && !matchMulti(filters.hubName, row.hubName)) return false;
    if (ignoreKey !== 'tokenType' && !matchMulti(filters.tokenType, row.tokenType)) return false;
    if (ignoreKey !== 'tokenTypeWithNrt' && !matchMulti(filters.tokenTypeWithNrt, row.tokenTypeWithNrt)) return false;
    if (ignoreKey !== 'rmName' && !matchMulti(filters.rmName, row.allocatedRm)) return false;
    if (ignoreKey !== 'dcName' && !matchMulti(filters.dcName, row.assignedDc)) return false;
    if (ignoreKey !== 'paymentType' && !matchMulti(filters.paymentType, row.paymentType)) return false;
    if (ignoreKey !== 'leadStage' && !matchMulti(filters.leadStage, row.leadStage)) return false;
    if (ignoreKey !== 'dealStatus' && !matchMulti(filters.dealStatus, row.dealStatus)) return false;
    if (ignoreKey !== 'funnelStage' && filters.funnelStage !== 'All') {
      const selectedStages = filters.funnelStage.split('|||').map(s => s.trim());
      const rowMatchesFunnel = selectedStages.some(stage => {
        if (MILESTONE_STAGES.includes(stage)) {
          return getMilestoneStatus(row, stage);
        }
        return String(row.funnelStage || '').toLowerCase() === stage.toLowerCase();
      });
      if (!rowMatchesFunnel) return false;
    }

    if (filters.minPaymentPercentage && filters.minPaymentPercentage !== 'All') {
      const thresholdPct = parseFloat(filters.minPaymentPercentage);
      if (!isNaN(thresholdPct)) {
        const rowPct = Number(row.paymentPercentage || 0);
        const normalizedRowPct = rowPct > 1 ? rowPct / 100 : rowPct;
        if (normalizedRowPct < (thresholdPct / 100)) return false;
      }
    }
    if (ignoreKey !== 'sheetFinalStatus' && !matchMulti(filters.sheetFinalStatus, row.sheetFinalStatus)) return false;
    if (ignoreKey !== 'formFinalStatus' && !matchMulti(filters.formFinalStatus, row.formFinalStatus)) return false;
    if (ignoreKey !== 'gmailPendencyStatus' && !matchMulti(filters.gmailPendencyStatus, row.gmailPendencyStatus)) return false;

    if (ignoreKey !== 'taskBucket' && filters.taskBucket !== 'All') {
      const selectedTasks = filters.taskBucket.split('|||').map(s => s.trim().toLowerCase());
      const rowTasks = splitTasks(row.taskBucket || '').map(s => s.trim().toLowerCase());
      
      const matchesBlank = selectedTasks.includes('blank') && rowTasks.length === 0;
      const matchesAnyTask = selectedTasks.some(t => rowTasks.includes(t));
      
      if (!matchesBlank && !matchesAnyTask) return false;
    }

    if (ignoreKey !== 'derivedStatus' && filters.derivedStatus !== 'All') {
      const selectedIssues = filters.derivedStatus.split('|||');
      const flags = getDerivedFlags(row);
      
      const matchesAny = selectedIssues.some(issue => {
        if (issue === 'Alert Cases' && flags.isAlertCase) return true;
        if (issue === 'EDD Missing' && flags.isEddMissing) return true;
        if (issue === 'EDD Breached' && flags.isEddBreached) return true;
        if (issue === 'PMax Stuck' && flags.isPmaxStuck) return true;
        if (issue === 'Customer Connect Pending' && flags.isCustomerConnectPending) return true;
        if (issue === 'High Payment Pending Delivery' && flags.isHighPaymentPendingDelivery) return true;
        if (issue === 'Cancelled After Payment' && flags.isCancelledAfterPayment) return true;
        if (issue === 'OD Pending' && flags.isOdPending) return true;
        if (issue === 'Blank Payment Type' && flags.isBlankPaymentType) return true;
        if (issue === 'Payment Pending' && flags.isPaymentPending) return true;
        if (issue === 'Any Active Task' && Boolean(row.taskBucket)) return true;
        
        if (row.taskBucket && String(row.taskBucket).toLowerCase().includes(issue.toLowerCase())) return true;
        return false;
      });
      
      if (!matchesAny) return false;
    }

    // Evaluate legacy date filter if active
    if (ignoreKey !== 'dateRange' && filters.dateField !== 'All') {
      const dateMap: Record<string, keyof CaseRow> = {
        tokenDate: 'tokenDate',
        bookingDate: 'bookingDate',
        expectedDeliveryDate: 'expectedDeliveryDate',
        actualDeliveryDate: 'actualDeliveryDate',
        lastPaymentDate: 'lastPaymentDate',
        latestRemarkDate: 'latestRemarkDate',
        cancellationDate: 'cancellationDate',
        updatedAt: 'updatedAt',
        expectedOdCompletionDate: 'expectedOdCompletionDate',
        eddReviewerDate: 'eddReviewerDate',
        tokenDateTime: 'tokenDateTime',
        expectedDeliveryTime: 'expectedDeliveryTime',
        cancelReqDate: 'cancelReqDate',
        latestLeadCreationTimestamp: 'latestLeadCreationTimestamp',
        latestLoginTime: 'latestLoginTime',
        latestCreditAssessedTimestamp: 'latestCreditAssessedTimestamp',
        latestDiligenceAssessedTimestamp: 'latestDiligenceAssessedTimestamp',
        latestFcuAssessedTimestamp: 'latestFcuAssessedTimestamp',
        tncGeneratedDate: 'tncGeneratedDate',
        tncAcceptedTimestamp: 'tncAcceptedTimestamp',
        fcuSentDate: 'fcuSentDate',
        sentToRcuTimestamp: 'sentToRcuTimestamp',
        sentToOpsTimestamp: 'sentToOpsTimestamp',
        submitToOpsTimestamp: 'submitToOpsTimestamp',
        opsDisbursalTimestamp: 'opsDisbursalTimestamp',
        financeDisbursedTimestamp: 'financeDisbursedTimestamp',
        lastCallAt: 'lastCallAt',
        followupAt: 'followupAt',
        sheetLoginTimestamp: 'sheetLoginTimestamp',
        gmailPendencyDate: 'gmailPendencyDate',
        mlEstimatedDeliveryDate: 'mlEstimatedDeliveryDate',
        dealStatusUpdatedAt: 'dealStatusUpdatedAt',
        tokenAutoCancellationExtendedDate: 'tokenAutoCancellationExtendedDate'
      };
      const dateKey = dateMap[filters.dateField];
      if (dateKey) {
        const rawVal = row[dateKey];
        if (filters.filterBlankDates) {
          if (rawVal && parseDateString(String(rawVal)) !== null) return false;
        } else {
          if (!rawVal) return false;
          const rowDate = parseDateString(String(rawVal));
          if (!rowDate) return false;

          if (filters.startDate) {
            const start = parseDateString(filters.startDate);
            if (start) {
              start.setHours(0, 0, 0, 0);
              if (rowDate < start) return false;
            }
          }
          if (filters.endDate) {
            const end = parseDateString(filters.endDate);
            if (end) {
              end.setHours(23, 59, 59, 999);
              if (rowDate > end) return false;
            }
          }
        }
      }
    }

    // Evaluate dynamic date filters
    if (ignoreKey !== 'dateRange' && filters.dateFilters && filters.dateFilters.length > 0) {
      const dateMap: Record<string, keyof CaseRow> = {
        tokenDate: 'tokenDate',
        bookingDate: 'bookingDate',
        expectedDeliveryDate: 'expectedDeliveryDate',
        actualDeliveryDate: 'actualDeliveryDate',
        lastPaymentDate: 'lastPaymentDate',
        latestRemarkDate: 'latestRemarkDate',
        cancellationDate: 'cancellationDate',
        updatedAt: 'updatedAt',
        expectedOdCompletionDate: 'expectedOdCompletionDate',
        eddReviewerDate: 'eddReviewerDate',
        tokenDateTime: 'tokenDateTime',
        expectedDeliveryTime: 'expectedDeliveryTime',
        cancelReqDate: 'cancelReqDate',
        latestLeadCreationTimestamp: 'latestLeadCreationTimestamp',
        latestLoginTime: 'latestLoginTime',
        latestCreditAssessedTimestamp: 'latestCreditAssessedTimestamp',
        latestDiligenceAssessedTimestamp: 'latestDiligenceAssessedTimestamp',
        latestFcuAssessedTimestamp: 'latestFcuAssessedTimestamp',
        tncGeneratedDate: 'tncGeneratedDate',
        tncAcceptedTimestamp: 'tncAcceptedTimestamp',
        fcuSentDate: 'fcuSentDate',
        sentToRcuTimestamp: 'sentToRcuTimestamp',
        sentToOpsTimestamp: 'sentToOpsTimestamp',
        submitToOpsTimestamp: 'submitToOpsTimestamp',
        opsDisbursalTimestamp: 'opsDisbursalTimestamp',
        financeDisbursedTimestamp: 'financeDisbursedTimestamp',
        lastCallAt: 'lastCallAt',
        followupAt: 'followupAt',
        sheetLoginTimestamp: 'sheetLoginTimestamp',
        gmailPendencyDate: 'gmailPendencyDate',
        mlEstimatedDeliveryDate: 'mlEstimatedDeliveryDate',
        dealStatusUpdatedAt: 'dealStatusUpdatedAt',
        tokenAutoCancellationExtendedDate: 'tokenAutoCancellationExtendedDate'
      };

      for (const df of filters.dateFilters) {
        if (df.dateField === 'All') continue;
        const dateKey = dateMap[df.dateField];
        if (!dateKey) continue;
        const rawVal = row[dateKey];

        if (df.filterBlankDates) {
          // If we want blank dates, row is only valid if rawVal is blank
          if (rawVal && parseDateString(String(rawVal)) !== null) return false;
        } else {
          // Otherwise, we require a valid date
          if (!rawVal) return false;
          const rowDate = parseDateString(String(rawVal));
          if (!rowDate) return false;

          if (df.startDate) {
            const start = parseDateString(df.startDate);
            if (start) {
              start.setHours(0, 0, 0, 0);
              if (rowDate < start) return false;
            }
          }
          if (df.endDate) {
            const end = parseDateString(df.endDate);
            if (end) {
              end.setHours(23, 59, 59, 999);
              if (rowDate > end) return false;
            }
          }
        }
      }
    }

    if (ignoreKey !== 'eddStatus' && filters.eddStatus && filters.eddStatus !== 'All') {
      let rowBucket = 'Blank / Empty';

      if (row.expectedDeliveryDate) {
        const edd = parseDateString(row.expectedDeliveryDate);
        if (edd) {
          const eddDate = new Date(edd.getFullYear(), edd.getMonth(), edd.getDate(), 0, 0, 0, 0);
          const diffTime = eddDate.getTime() - eddLabels.today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
            rowBucket = 'Overdue / Breached';
          } else if (diffDays === 0) {
            rowBucket = eddLabels.labelToday;
          } else if (diffDays === 1) {
            rowBucket = eddLabels.labelD1;
          } else if (diffDays === 2) {
            rowBucket = eddLabels.labelD2;
          } else if (diffDays >= 3 && diffDays <= 6) {
            rowBucket = eddLabels.labelD3_6;
          } else {
            rowBucket = eddLabels.labelD7Plus;
          }
        }
      }

      if (rowBucket !== filters.eddStatus) {
        return false;
      }
    }

    if (ignoreKey !== 'cancelReason' && !matchMulti(filters.cancelReason, row.cancelReason)) return false;
    if (ignoreKey !== 'leadDsChannel' && !matchMulti(filters.leadDsChannel, row.leadDsChannel)) return false;

    if (ignoreKey !== 'readyToDeliver' && filters.readyToDeliver && filters.readyToDeliver !== 'All') {
      const rtdVal = (row.readyToDeliver || '').trim();
      if (filters.readyToDeliver === 'Blank') {
        if (rtdVal !== '') return false;
      } else {
        if (rtdVal.toLowerCase() !== filters.readyToDeliver.toLowerCase()) return false;
      }
    }

    return true;
  }, [filters, eddLabels]);

  // Filtered rows memoized (sorted if sortField is selected)
  const filteredRows = useMemo(() => {
    const matched = rows.filter(row => isRowMatching(row));
    if (!sortField) return matched;

    return [...matched].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle numeric fields
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      // Handle string comparisons (including ISO dates)
      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();

      if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, isRowMatching, sortField, sortDirection]);

  // Static filter options built from all rows — no cross-filtering to avoid render loops
  const dynamicFilterOptions = useMemo(() => {
    const citiesSet = new Set<string>();
    const tokenTypeSet = new Set<string>();
    const rmSet = new Set<string>();
    const dcSet = new Set<string>();
    const paymentSet = new Set<string>();
    const stagesSet = new Set<string>();
    const funnelSet = new Set<string>();
    const sheetFinalSet = new Set<string>();
    const formFinalSet = new Set<string>();
    const gmailPendencySet = new Set<string>();
    const tasksSet = new Set<string>();
    const derivedSet = new Set<string>();
    const cancelReasonsSet = new Set<string>();
    const leadDsChannelsSet = new Set<string>();

    rows.forEach(row => {
      if (row.city)                citiesSet.add(row.city.trim());
      // hubs computed separately (city-aware) — see cityFilteredHubs below
      if (row.tokenType)           tokenTypeSet.add(row.tokenType);
      if (row.allocatedRm)          rmSet.add(row.allocatedRm);
      if (row.assignedDc)          dcSet.add(row.assignedDc);
      if (row.paymentType)         paymentSet.add(row.paymentType);
      if (row.leadStage)           stagesSet.add(row.leadStage);
      if (row.funnelStage)         funnelSet.add(row.funnelStage);
      if (row.sheetFinalStatus)    sheetFinalSet.add(row.sheetFinalStatus);
      if (row.formFinalStatus)     formFinalSet.add(row.formFinalStatus);
      if (row.gmailPendencyStatus) gmailPendencySet.add(row.gmailPendencyStatus);
      if (row.cancelReason)        cancelReasonsSet.add(row.cancelReason);
      if (row.leadDsChannel)       leadDsChannelsSet.add(row.leadDsChannel);
      if (row.taskBucket) {
        splitTasks(row.taskBucket).forEach(t => { if (t.trim()) tasksSet.add(t.trim()); });
      }
      const flags = getDerivedFlags(row);
      if (flags.isAlertCase)                 derivedSet.add('Alert Cases');
      if (flags.isEddMissing)                derivedSet.add('EDD Missing');
      if (flags.isEddBreached)               derivedSet.add('EDD Breached');
      if (flags.isPmaxStuck)                 derivedSet.add('PMax Stuck');
      if (flags.isCustomerConnectPending)    derivedSet.add('Customer Connect Pending');
      if (flags.isHighPaymentPendingDelivery)derivedSet.add('High Payment Pending Delivery');
      if (flags.isCancelledAfterPayment)     derivedSet.add('Cancelled After Payment');
      if (flags.isOdPending)                 derivedSet.add('OD Pending');
      if (flags.isBlankPaymentType)          derivedSet.add('Blank Payment Type');
      if (flags.isPaymentPending)            derivedSet.add('Payment Pending');
      if (row.taskBucket) {
        derivedSet.add('Any Active Task');
        splitTasks(row.taskBucket).forEach(t => { if (t.trim()) derivedSet.add(t.trim()); });
      }
    });

    const coreOrder = [
      'Alert Cases', 'EDD Missing', 'EDD Breached', 'PMax Stuck',
      'Customer Connect Pending', 'High Payment Pending Delivery',
      'Cancelled After Payment', 'OD Pending', 'Blank Payment Type',
      'Payment Pending', 'Any Active Task'
    ];
    const sortedDerived = Array.from(derivedSet).sort((a, b) => {
      const idxA = coreOrder.indexOf(a);
      const idxB = coreOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return {
      cities:               Array.from(citiesSet).sort(),
      tokenTypes:           Array.from(tokenTypeSet).sort(),
      rms:                  Array.from(rmSet).sort(),
      dcs:                  Array.from(dcSet).sort(),
      paymentTypes:         Array.from(paymentSet).sort(),
      leadStages:           Array.from(stagesSet).sort(),
      funnelStages:         [
        ...MILESTONE_STAGES,
        ...Array.from(funnelSet).filter(f => !MILESTONE_STAGES.includes(f)).sort()
      ],
      sheetFinalStatuses:   Array.from(sheetFinalSet).sort(),
      formFinalStatuses:    Array.from(formFinalSet).sort(),
      gmailPendencyStatuses:Array.from(gmailPendencySet).sort(),
      tasks:                Array.from(tasksSet).sort(),
      derivedOptions:       sortedDerived,
      cancelReasons:        Array.from(cancelReasonsSet).sort(),
      leadDsChannels:       Array.from(leadDsChannelsSet).sort()
    };
  }, [rows]); // ← only rows, never filters — prevents render loops

  // City-aware hub options: only show hubs belonging to rows in the selected city.
  // Safe: pure derivation from [rows, filters.city] — never calls setFilters.
  const cityFilteredHubs = useMemo(() => {
    const selectedCities = filters.city === 'All'
      ? null
      : filters.city.split('|||').map(s => s.trim().toLowerCase());
    const hubsSet = new Set<string>();
    rows.forEach(row => {
      if (!row.hubName) return;
      if (selectedCities === null) {
        hubsSet.add(row.hubName.trim());
      } else {
        const rowCity = String(row.city || '').trim().toLowerCase();
        if (selectedCities.includes(rowCity)) {
          hubsSet.add(row.hubName.trim());
        }
      }
    });
    return Array.from(hubsSet).sort();
  }, [rows, filters.city]);

  // When city filter changes, clear hub selection (hub from old city is irrelevant)
  const prevCityRef = React.useRef(filters.city);
  useEffect(() => {
    if (prevCityRef.current !== filters.city) {
      prevCityRef.current = filters.city;
      setFilters(prev => ({ ...prev, hubName: 'All' }));
    }
  }, [filters.city]);

  // KPIs
  const kpis: DashboardKpis = useMemo(() => buildKpis(filteredRows), [filteredRows]);
  
  // Charts
  const charts: DashboardCharts = useMemo(() => buildCharts(filteredRows), [filteredRows]);

  // Filtered C2D bookings count in the current filtered set
  const filteredCancelledC2dCount = useMemo(() => {
    return filteredRows.filter(r => {
      const flags = getDerivedFlags(r);
      return flags.isCancelled && c2dStats.c2dBookingIds.has(r.bookingId);
    }).length;
  }, [filteredRows, c2dStats.c2dBookingIds]);

  // Executive Operations Matrix Ledger
  const matrix = useMemo(() => calculateOperationsMatrix(filteredRows), [filteredRows]);


  const derivedLabels = useMemo(() => {
    const labels: Record<string, string> = {
      'Any Active Task': 'Any Active Task / Pending Item'
    };
    allUniqueTasks.forEach(task => {
      labels[task] = `Task: ${task}`;
    });
    return labels;
  }, [allUniqueTasks]);

  const resetFilters = () => {
    setFilters({
      city: 'All',
      hubName: 'All',
      tokenType: 'All',
      tokenTypeWithNrt: 'All',
      rmName: 'All',
      dcName: 'All',
      paymentType: 'All',
      leadStage: 'All',
      dealStatus: 'All',
      funnelStage: 'All',
      sheetFinalStatus: 'All',
      formFinalStatus: 'All',
      gmailPendencyStatus: 'All',
      taskBucket: 'All',
      derivedStatus: 'All',
      dateField: 'All',
      startDate: '',
      endDate: '',
      searchQuery: '',
      eddStatus: 'All',
      cancelReason: 'All',
      leadDsChannel: 'All',
      readyToDeliver: 'All',
      dateFilters: [],
      minPaymentPercentage: 'All'
    });
  };

  const syncDateFilters = (dfList: DateFilter[], legacyField: string): DateFilter[] => {
    if (legacyField === 'All') return [];
    
    // Filter out inactive filters (where dateField is 'All')
    const active = dfList.filter(df => df.dateField !== 'All');
    
    // Append exactly one inactive filter at the end
    return [
      ...active,
      {
        id: Math.random().toString(36).substring(2, 9),
        dateField: 'All',
        startDate: '',
        endDate: '',
        filterBlankDates: false
      }
    ];
  };

  const removeDateFilter = (id: string) => {
    setFilters(p => {
      const updatedList = (p.dateFilters || []).filter(df => df.id !== id);
      const syncedList = syncDateFilters(updatedList, p.dateField);
      return {
        ...p,
        dateFilters: syncedList
      };
    });
  };

  const updateDateFilter = (id: string, updates: Partial<Omit<DateFilter, 'id'>>) => {
    setFilters(p => {
      const updatedList = (p.dateFilters || []).map(df => 
        df.id === id ? { ...df, ...updates } : df
      );
      const syncedList = syncDateFilters(updatedList, p.dateField);
      return {
        ...p,
        dateFilters: syncedList
      };
    });
  };

  const handleEditRowClick = async (index: number) => {
    setSelectedRowIndex(index);
    setSidebarTab('actions');
    setRawSearchQuery('');
    const originalRow = filteredRows[index];
    setTempRowData({
      readyToDeliver: originalRow.readyToDeliver || '',
      expectedOdCompletionDate: originalRow.expectedOdCompletionDate || '',
      eddReviewerDate: originalRow.eddReviewerDate || '',
      reviewerRemarks: originalRow.reviewerRemarks || '',
      latestRemark: originalRow.latestRemark || '',
      latestRemarkBy: originalRow.latestRemarkBy || '',
      latestRemarkDate: originalRow.latestRemarkDate || '',
      newRemarkAddition: ''
    });

    if (accessToken) {
      setFetchingLatestRow(true);
      try {
        const { fetchSingleRowLatest } = await import('../lib/sheetsService');
        const latestFields = await fetchSingleRowLatest(sheetId, sheetName, accessToken, originalRow._rowNumber);
        
        setTempRowData(prev => ({
          ...prev,
          readyToDeliver: latestFields.readyToDeliver !== undefined ? (latestFields.readyToDeliver || '') : prev.readyToDeliver,
          expectedOdCompletionDate: latestFields.expectedOdCompletionDate !== undefined ? (latestFields.expectedOdCompletionDate || '') : prev.expectedOdCompletionDate,
          eddReviewerDate: latestFields.eddReviewerDate !== undefined ? (latestFields.eddReviewerDate || '') : prev.eddReviewerDate,
          reviewerRemarks: latestFields.reviewerRemarks !== undefined ? (latestFields.reviewerRemarks || '') : prev.reviewerRemarks,
          latestRemark: latestFields.latestRemark !== undefined ? (latestFields.latestRemark || '') : prev.latestRemark,
          latestRemarkBy: latestFields.latestRemarkBy !== undefined ? (latestFields.latestRemarkBy || '') : prev.latestRemarkBy,
          latestRemarkDate: latestFields.latestRemarkDate !== undefined ? (latestFields.latestRemarkDate || '') : prev.latestRemarkDate,
        }));

        // Merge latest properties directly into the local dashboard state row
        setRows(prevRows => {
          return prevRows.map(row => {
            if (row.bookingId === originalRow.bookingId) {
              return {
                ...row,
                ...latestFields
              };
            }
            return row;
          });
        });
      } catch (err) {
        console.warn("Failed to retrieve latest single-row data:", err);
      } finally {
        setFetchingLatestRow(false);
      }
    }
  };

  const handleSaveActionables = () => {
    if (selectedRowIndex === null) return;

    setSavingRow(true);
    try {
      const targetRow = filteredRows[selectedRowIndex];
      const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      // Concatenate extra comment/remark addition if filled
      const originalRemarks = tempRowData.reviewerRemarks || '';
      const newAddition = (tempRowData as any).newRemarkAddition || '';
      
      let combinedRemarks = originalRemarks;
      if (newAddition.trim()) {
        const emailSuffix = user?.email ? ` (${user.email.split('@')[0]})` : '';
        const dateStr = new Date().toISOString().slice(0, 10);
        const appendStr = originalRemarks 
          ? `${originalRemarks}\n\n[${dateStr}${emailSuffix}]: ${newAddition.trim()}` 
          : `[${dateStr}${emailSuffix}]: ${newAddition.trim()}`;
        combinedRemarks = appendStr;
      }

      const updatedRow = {
        ...targetRow,
        ...tempRowData,
        reviewerRemarks: combinedRemarks,
        updatedAt: timestampStr
      };
      // Ensure transient state helper is removed from final row model
      delete (updatedRow as any).newRemarkAddition;

      // Auto-save inline edits directly back to Google Sheet if we have authority
      if (accessToken) {
        import('../lib/sheetsService')
          .then(({ writeActionablesToSheet }) => {
            return writeActionablesToSheet(sheetId, sheetName, accessToken, targetRow._rowNumber, {
              readyToDeliver: updatedRow.readyToDeliver,
              expectedOdCompletionDate: updatedRow.expectedOdCompletionDate,
              eddReviewerDate: updatedRow.eddReviewerDate,
              reviewerRemarks: updatedRow.reviewerRemarks,
              updatedAt: updatedRow.updatedAt
            });
          })
          .then(() => {
            setRows(prevRows => {
              return prevRows.map(row => {
                if (row.bookingId === targetRow.bookingId) {
                  return updatedRow;
                }
                return row;
              });
            });
            setSavingRow(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
          })
          .catch(err => {
            console.error("Direct sync to Google Sheets failed:", err);
            alert(`Failed to save directly to Google Sheet:\n${err.message || err}\n\nYour changes are saved locally in this session.`);
            // Save locally as a fallback
            setRows(prevRows => {
              return prevRows.map(row => {
                if (row.bookingId === targetRow.bookingId) {
                  return updatedRow;
                }
                return row;
              });
            });
            setSavingRow(false);
            setSelectedRowIndex(null);
          });
      } else {
        // Save locally (anonymous / demo mode)
        setRows(prevRows => {
          return prevRows.map(row => {
            if (row.bookingId === targetRow.bookingId) {
              return updatedRow;
            }
            return row;
          });
        });
        setSavingRow(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err: any) {
      console.error("Failed to prepare or trigger save:", err);
      alert(`An error occurred while preparing your changes to save:\n${err.message || err}`);
      setSavingRow(false);
    }
  };

  // Utility to format INR currencies
  const formatCurrency = (val: number) => {
    if (val >= 10000000) {
      return '₹' + (val / 10000000).toFixed(1) + ' Cr';
    }
    if (val >= 100000) {
      return '₹' + (val / 100000).toFixed(1) + ' L';
    }
    return '₹' + val.toLocaleString('en-IN');
  };

  // Bespoke responsive SVG bar-chart renderer with click-to-filter support
  const renderSvgBarChart = (
    title: string, 
    dataObj: Record<string, number>, 
    colorClass: string = "bg-amber-500",
    filterKey?: keyof FilterState,
    colorOverrides?: Record<string, string>
  ) => {
    // When colorOverrides provided, include Blank; otherwise exclude it (legacy behaviour)
    const includeBlank = !!colorOverrides;
    const entries = Object.entries(dataObj).filter(([k]) => (includeBlank || (k !== 'Blank')) && k !== 'All' && k !== '');
    if (!entries.length) {
      return (
        <div className="flex h-36 items-center justify-center text-xs text-slate-400 font-medium">
          No data available for {title}
        </div>
      );
    }
    
    const maxVal = Math.max(...entries.map(([, v]) => v)) || 1;
    
    return (
      <div className="space-y-1.5 mt-2 select-none">
        {entries.slice(0, 8).map(([label, val]) => {
          const pct = Math.min(100, Math.max(4, (val / maxVal) * 100));
          const isCurrentFilter = filterKey && filters[filterKey] === label;
          const barColor = colorOverrides?.[label] ?? colorClass;
          
          return (
            <div 
              key={label} 
              className={`text-xs p-1.5 px-2 rounded-xl transition-all ${
                filterKey ? 'cursor-pointer hover:bg-slate-50 active:scale-[0.99]' : ''
              } ${isCurrentFilter ? 'bg-amber-50 border border-amber-200 shadow-2xs' : 'border border-transparent'}`}
              onClick={() => {
                if (filterKey) {
                  setFilters(prev => {
                    const currentVal = prev[filterKey];
                    const newVal = currentVal === label ? 'All' : label;
                    return { ...prev, [filterKey]: newVal };
                  });
                  setCurrentPage(1);
                }
              }}
            >
              <div className="flex justify-between text-[11px] font-semibold text-slate-650 mb-1">
                <span className="truncate max-w-[140px] flex items-center gap-1.5">
                  {label}
                  {isCurrentFilter && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
                  )}
                </span>
                <span className={isCurrentFilter ? 'text-amber-700 font-bold' : ''}>{val} cases</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full rounded-full ${isCurrentFilter ? 'bg-amber-500' : barColor}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  
  const currentRows = useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, activePage, pageSize]);

  // Helper styling functions
  const getFilterSelectClass = (isActive: boolean) => 
    `w-full text-xs p-2 border rounded-xl cursor-pointer transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-amber-500/20 ${
      isActive 
        ? 'border-amber-400 bg-amber-50/50 text-amber-900 font-semibold ring-1 ring-amber-400/30 shadow-sm' 
        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'
    }`;

  const getFilterLabelClass = (isActive: boolean) =>
    `block text-[10px] uppercase font-bold tracking-wider mb-1 transition-all duration-200 ${
      isActive ? 'text-amber-700 font-extrabold' : 'text-slate-400'
    }`;

  const isCityActive = filters.city !== 'All';
  const isHubActive = filters.hubName !== 'All';
  const isTokenTypeActive = filters.tokenType !== 'All';
  const isRmActive = filters.rmName !== 'All';
  const isDcActive = filters.dcName !== 'All';
  const isPaymentActive = filters.paymentType !== 'All';
  const isLeadStageActive = filters.leadStage !== 'All';
  const isFunnelStageActive = filters.funnelStage !== 'All';
  const isSheetStatusActive = filters.sheetFinalStatus !== 'All';
  const isFormStatusActive = filters.formFinalStatus !== 'All';
  const isGmailActive = filters.gmailPendencyStatus !== 'All';
  const isTaskActive = filters.taskBucket !== 'All';
  const isDerivedActive = filters.derivedStatus !== 'All';
  const isCancelReasonActive = filters.cancelReason !== 'All';
  const isLeadDsChannelActive = filters.leadDsChannel !== 'All';
  const isDateFieldActive = filters.dateField !== 'All';
  const isPaymentPercentageActive = filters.minPaymentPercentage !== undefined && filters.minPaymentPercentage !== 'All';
  const activeDynamicDateFilters = filters.dateFilters?.filter(df => 
    df.dateField !== 'All' && (df.startDate !== '' || df.endDate !== '' || df.filterBlankDates)
  ) || [];
  const hasActiveDynamicFilters = activeDynamicDateFilters.length > 0;
  const isDateRangeActive = (isDateFieldActive && (filters.startDate !== '' || filters.endDate !== '' || filters.filterBlankDates)) || hasActiveDynamicFilters;

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (isCityActive) count++;
    if (isHubActive) count++;
    if (isTokenTypeActive) count++;
    if (isRmActive) count++;
    if (isDcActive) count++;
    if (isPaymentActive) count++;
    if (isLeadStageActive) count++;
    if (isFunnelStageActive) count++;
    if (isSheetStatusActive) count++;
    if (isFormStatusActive) count++;
    if (isGmailActive) count++;
    if (isTaskActive) count++;
    if (isDerivedActive) count++;
    if (isCancelReasonActive) count++;
    if (isLeadDsChannelActive) count++;
    if (isPaymentPercentageActive) count++;
    if (isDateFieldActive && (filters.startDate !== '' || filters.endDate !== '' || filters.filterBlankDates)) count++;
    if (hasActiveDynamicFilters) count += activeDynamicDateFilters.length;
    return count;
  }, [
    isCityActive, isHubActive, isTokenTypeActive, isRmActive, isDcActive,
    isPaymentActive, isLeadStageActive, isFunnelStageActive, isSheetStatusActive,
    isFormStatusActive, isGmailActive, isTaskActive, isDerivedActive,
    isCancelReasonActive, isLeadDsChannelActive, isDateFieldActive, filters.startDate,
    filters.endDate, filters.filterBlankDates, hasActiveDynamicFilters, activeDynamicDateFilters,
    isPaymentPercentageActive, filters.minPaymentPercentage
  ]);

  // Extracted reusable table component to render at the bottom of multiple tabs
  const renderInteractiveTable = () => {
    const renderSortableHeader = (label: string, field: keyof CaseRow, extraClass: string = "") => {
      const isSorted = sortField === field;
      return (
        <th 
          className={`p-3.5 font-semibold cursor-pointer hover:bg-slate-100 transition-colors select-none ${extraClass}`}
          onClick={() => handleSort(field)}
        >
          <div className="flex items-center gap-1">
            <span>{label}</span>
            <span className="text-[10px] text-slate-400 font-normal">
              {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
            </span>
          </div>
        </th>
      );
    };

    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-6" id="interactive-dataset-panel">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-sans font-semibold text-slate-800 text-sm">
              Filtered Booking Cases List
            </h3>
            <p className="text-[11px] text-slate-400">
              Showing {filteredRows.length} matches out of total {rows.length} operations.
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => {
                const csvContent = [
                  ["Booking ID", "Loan ID", "Token Date", "Hub", "RM", "TokenType", "PaymentType", "LeadStage", "Tasks", "ExpectedDelivery", "Ready", "ODCompletion", "Remarks"].join(","),
                  ...filteredRows.map(row => [
                    row.bookingId, row.loanId, row.tokenDate, row.hubName, row.allocatedRm, row.tokenType, row.paymentType, row.leadStage, row.taskBucket, row.expectedDeliveryDate, row.readyToDeliver, row.expectedOdCompletionDate, row.reviewerRemarks
                  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))
                ].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'cars24_ops_filtered_dataset.csv';
                link.click();
              }}
              className="p-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
            >
              Export CSV Ledger
            </button>
            <button
              id="btn-export-image"
              onClick={handleExportImage}
              className="p-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all border border-slate-200 shadow-xs"
            >
              Export PNG
            </button>
          </div>
        </div>

        <div className="overflow-x-auto" id="interactive-dataset-table-wrapper">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 font-sans border-b border-slate-100/80 text-slate-500 select-none">
                {renderSortableHeader("Booking ID", "bookingId", "pl-5")}
                {renderSortableHeader("Loan ID", "loanId")}
                {renderSortableHeader("Token Date", "tokenDate")}
                {renderSortableHeader("Hub", "hubName")}
                {renderSortableHeader("RM Name", "allocatedRm")}
                {renderSortableHeader("Payment Type", "paymentType")}
                {renderSortableHeader("Lead Stage", "leadStage")}
                <th className="p-3.5 font-semibold">Task List</th>
                {renderSortableHeader("Expected EDD", "expectedDeliveryDate")}
                {renderSortableHeader("Ready?", "readyToDeliver")}
                {renderSortableHeader("OD Completion", "expectedOdCompletionDate")}
                <th className="p-3.5 text-right pr-5 font-semibold">Control Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-slate-400 font-medium">
                    No matching CARS24 rows fit the specified operational handshake filters.
                  </td>
                </tr>
              ) : (
                currentRows.map((row, subIndex) => {
                  const index = (activePage - 1) * pageSize + subIndex;
                  const flags = getDerivedFlags(row);
                  return (
                    <tr key={row.bookingId} className="hover:bg-slate-50/50 transition-all">
                      <td className="p-3.5 pl-5">
                        <div className="flex items-center gap-1.5">
                          {row.userId || row.uid ? (
                            <a 
                              href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(row.userId || row.uid || '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-indigo-600 hover:text-indigo-850 hover:underline flex items-center gap-0.5 transition-colors"
                              title="View Customer WMF/LMS Profile"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.bookingId}
                              <ExternalLink className="w-3 h-3 text-indigo-400" />
                            </a>
                          ) : (
                            <span className="font-semibold text-slate-800">{row.bookingId}</span>
                          )}
                          {c2dStats.c2dBookingIds.has(row.bookingId) && (
                            <span 
                              className="p-0.5 px-1.5 text-[8px] bg-rose-50 text-rose-600 border border-rose-100 rounded font-extrabold uppercase tracking-wider select-none shrink-0"
                              title="C2D: Cancelled booking but user converted to delivered on another Booking ID"
                            >
                              C2D
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-500">
                        {row.loanId || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-3.5 font-mono">
                        {row.tokenDate || <span className="text-slate-400 italic">-</span>}
                      </td>
                      <td className="p-3.5 whitespace-normal break-words max-w-[150px]" title={row.hubName}>
                        {row.hubName}
                      </td>
                      <td className="p-3.5 whitespace-nowrap" title={row.allocatedRm}>
                        {row.allocatedRm ? row.allocatedRm.split('@')[0] : <span className="text-slate-400 italic">-</span>}
                      </td>
                      <td className="p-3.5">
                        <span className="p-1 px-2 text-[10px] font-mono font-medium rounded-md bg-slate-100 text-slate-800">
                          {row.paymentType || 'CASH'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`p-1 px-2.5 rounded-full text-[10px] font-bold ${
                          row.leadStage === 'DELIVERED' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : row.leadStage === 'CANCELLED' 
                            ? 'bg-rose-50 text-rose-700' 
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {row.leadStage}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {row.taskBucket ? (
                          <div className="flex gap-1.5 flex-wrap max-w-[200px]">
                            {splitTasks(row.taskBucket).map(t => (
                              <span key={t} className="p-1 px-2 rounded-md bg-indigo-50 text-indigo-700 text-[9px] font-semibold leading-relaxed">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No Task</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono">
                        {row.expectedDeliveryDate ? (
                          <span className={flags.isEddBreached ? 'text-rose-500 font-bold' : ''}>
                            {row.expectedDeliveryDate}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Missing</span>
                        )}
                      </td>
                      <td className="p-3.5 font-bold">
                        {row.readyToDeliver || <span className="text-slate-400 font-normal">-</span>}
                      </td>
                      <td className="p-3.5 font-mono">
                        {row.expectedOdCompletionDate || <span className="text-slate-400 italic">-</span>}
                      </td>
                      <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditRowClick(index)}
                            className="p-1.5 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-all flex items-center gap-1 active:scale-95"
                          >
                            <Eye className="w-3.5 h-3.5" /> View & Sync
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {filteredRows.length > 0 && (
          <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/35">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="p-1 px-2 border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value={10}>10 rows</option>
                <option value={15}>15 rows</option>
                <option value={20}>20 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
              <span>per page</span>
            </div>
            
            <div className="font-medium text-slate-600">
              Showing <span className="font-bold text-slate-800">{Math.min(filteredRows.length, (activePage - 1) * pageSize + 1)}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(filteredRows.length, activePage * pageSize)}</span> of{' '}
              <span className="font-bold text-slate-800">{filteredRows.length}</span> records
            </div>

            <div className="flex items-center gap-1.5 font-sans">
              <button
                type="button"
                disabled={activePage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 px-3 rounded-lg border border-slate-200 font-semibold bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all cursor-pointer select-none"
              >
                Previous
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = activePage;
                  if (activePage <= 3) {
                    pageNum = i + 1;
                  } else if (activePage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = activePage - 2 + i;
                  }
                  
                  if (pageNum < 1 || pageNum > totalPages) return null;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer select-none transition-all ${
                        activePage === pageNum
                          ? 'bg-slate-950 text-white shadow-xs'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={activePage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 px-3 rounded-lg border border-slate-200 font-semibold bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all cursor-pointer select-none"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" id="cars24-ops-dashboard-wrapper">
      {/* 1. Filtering System (Dense bento control area) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-amber-500" />
          <h3 className="font-sans font-semibold text-slate-800 text-sm">
            Operational Handshake Filters
          </h3>
          <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">
            {activeFiltersCount} Active Mappings
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* City */}
          <MultiSelectDropdown
            label="City"
            options={dynamicFilterOptions.cities}
            selectedString={filters.city}
            onChange={val => setFilters(p => ({ ...p, city: val, hubName: 'All' }))}
            placeholder="All Cities"
            isActive={isCityActive}
            isOpen={openDropdown === 'city'}
            onToggle={() => setOpenDropdown(p => p === 'city' ? null : 'city')}
          />

          {/* Hub */}
          <MultiSelectDropdown
            label="Hub Name"
            options={cityFilteredHubs}
            selectedString={filters.hubName}
            onChange={val => setFilters(p => ({ ...p, hubName: val }))}
            placeholder="All Hubs"
            isActive={isHubActive}
            isOpen={openDropdown === 'hubName'}
            onToggle={() => setOpenDropdown(p => p === 'hubName' ? null : 'hubName')}
          />

          {/* TokenType */}
          <MultiSelectDropdown
            label="Token Type"
            options={dynamicFilterOptions.tokenTypes}
            selectedString={filters.tokenType}
            onChange={val => setFilters(p => ({ ...p, tokenType: val }))}
            placeholder="All Tokens"
            isActive={isTokenTypeActive}
            isOpen={openDropdown === 'tokenType'}
            onToggle={() => setOpenDropdown(p => p === 'tokenType' ? null : 'tokenType')}
          />

          {/* RM Name */}
          <MultiSelectDropdown
            label="Allocated RM"
            options={dynamicFilterOptions.rms}
            selectedString={filters.rmName}
            onChange={val => setFilters(p => ({ ...p, rmName: val }))}
            placeholder="All Allocated RMs"
            showBlank={true}
            isActive={isRmActive}
            isOpen={openDropdown === 'rmName'}
            onToggle={() => setOpenDropdown(p => p === 'rmName' ? null : 'rmName')}
          />

          {/* DC Name */}
          <MultiSelectDropdown
            label="Assigned DC"
            options={dynamicFilterOptions.dcs}
            selectedString={filters.dcName}
            onChange={val => setFilters(p => ({ ...p, dcName: val }))}
            placeholder="All DCs"
            showBlank={true}
            isActive={isDcActive}
            isOpen={openDropdown === 'dcName'}
            onToggle={() => setOpenDropdown(p => p === 'dcName' ? null : 'dcName')}
          />

          {/* Payment Type */}
          <MultiSelectDropdown
            label="Payment Type"
            options={dynamicFilterOptions.paymentTypes}
            selectedString={filters.paymentType}
            onChange={val => setFilters(p => ({ ...p, paymentType: val }))}
            placeholder="All Payments"
            showBlank={true}
            isActive={isPaymentActive}
            isOpen={openDropdown === 'paymentType'}
            onToggle={() => setOpenDropdown(p => p === 'paymentType' ? null : 'paymentType')}
          />

          {/* Lead Stage */}
          <MultiSelectDropdown
            label="Lead Stage"
            options={dynamicFilterOptions.leadStages}
            selectedString={filters.leadStage}
            onChange={val => setFilters(p => ({ ...p, leadStage: val }))}
            placeholder="All Stages"
            isActive={isLeadStageActive}
            isOpen={openDropdown === 'leadStage'}
            onToggle={() => setOpenDropdown(p => p === 'leadStage' ? null : 'leadStage')}
          />

          {/* Funnel Stage */}
          <MultiSelectDropdown
            label="Funnel / Milestone Stage"
            options={dynamicFilterOptions.funnelStages}
            selectedString={filters.funnelStage}
            onChange={val => setFilters(p => ({ ...p, funnelStage: val }))}
            placeholder="All Stages/Milestones"
            isActive={isFunnelStageActive}
            isOpen={openDropdown === 'funnelStage'}
            onToggle={() => setOpenDropdown(p => p === 'funnelStage' ? null : 'funnelStage')}
          />

          {/* Sheet Final Status */}
          <MultiSelectDropdown
            label="Sheet Status"
            options={dynamicFilterOptions.sheetFinalStatuses}
            selectedString={filters.sheetFinalStatus}
            onChange={val => setFilters(p => ({ ...p, sheetFinalStatus: val }))}
            placeholder="All Sheet Statuses"
            showBlank={true}
            isActive={isSheetStatusActive}
            isOpen={openDropdown === 'sheetFinalStatus'}
            onToggle={() => setOpenDropdown(p => p === 'sheetFinalStatus' ? null : 'sheetFinalStatus')}
          />

          {/* Form Final Status */}
          <MultiSelectDropdown
            label="Form Status"
            options={dynamicFilterOptions.formFinalStatuses}
            selectedString={filters.formFinalStatus}
            onChange={val => setFilters(p => ({ ...p, formFinalStatus: val }))}
            placeholder="All Form Statuses"
            showBlank={true}
            isActive={isFormStatusActive}
            isOpen={openDropdown === 'formFinalStatus'}
            onToggle={() => setOpenDropdown(p => p === 'formFinalStatus' ? null : 'formFinalStatus')}
          />

          {/* Gmail Pendency Status */}
          <MultiSelectDropdown
            label="Gmail Pendency"
            options={dynamicFilterOptions.gmailPendencyStatuses}
            selectedString={filters.gmailPendencyStatus}
            onChange={val => setFilters(p => ({ ...p, gmailPendencyStatus: val }))}
            placeholder="All Pendency Statuses"
            isActive={isGmailActive}
            isOpen={openDropdown === 'gmailPendencyStatus'}
            onToggle={() => setOpenDropdown(p => p === 'gmailPendencyStatus' ? null : 'gmailPendencyStatus')}
          />

          {/* Task Bucket */}
          <MultiSelectDropdown
            label="Task Bucket"
            options={dynamicFilterOptions.tasks}
            selectedString={filters.taskBucket}
            onChange={val => setFilters(p => ({ ...p, taskBucket: val }))}
            placeholder="All Task Buckets"
            showBlank={true}
            isActive={isTaskActive}
            isOpen={openDropdown === 'taskBucket'}
            onToggle={() => setOpenDropdown(p => p === 'taskBucket' ? null : 'taskBucket')}
          />

          {/* Derived Status */}
          <MultiSelectDropdown
            label="Derived Issue"
            options={dynamicFilterOptions.derivedOptions}
            selectedString={filters.derivedStatus}
            onChange={val => setFilters(p => ({ ...p, derivedStatus: val }))}
            placeholder="Clear Case / No Issue"
            isActive={isDerivedActive}
            isOpen={openDropdown === 'derivedStatus'}
            onToggle={() => setOpenDropdown(p => p === 'derivedStatus' ? null : 'derivedStatus')}
            optionLabels={derivedLabels}
          />

          {/* Cancellation Reason */}
          <MultiSelectDropdown
            label="Cancellation Reason"
            options={dynamicFilterOptions.cancelReasons}
            selectedString={filters.cancelReason}
            onChange={val => setFilters(p => ({ ...p, cancelReason: val }))}
            placeholder="All Reasons"
            showBlank={true}
            isActive={isCancelReasonActive}
            isOpen={openDropdown === 'cancelReason'}
            onToggle={() => setOpenDropdown(p => p === 'cancelReason' ? null : 'cancelReason')}
          />

          {/* DS Channel */}
          <MultiSelectDropdown
            label="DS Channel"
            options={dynamicFilterOptions.leadDsChannels}
            selectedString={filters.leadDsChannel}
            onChange={val => setFilters(p => ({ ...p, leadDsChannel: val }))}
            placeholder="All Channels"
            showBlank={true}
            isActive={isLeadDsChannelActive}
            isOpen={openDropdown === 'leadDsChannel'}
            onToggle={() => setOpenDropdown(p => p === 'leadDsChannel' ? null : 'leadDsChannel')}
          />

          {/* Min Payment Percentage */}
          <div>
            <label className={getFilterLabelClass(isPaymentPercentageActive)}>Min Payment %</label>
            <select
              value={filters.minPaymentPercentage || 'All'}
              onChange={e => setFilters(p => ({ ...p, minPaymentPercentage: e.target.value }))}
              className={getFilterSelectClass(isPaymentPercentageActive)}
            >
              <option value="All">Any Payment %</option>
              <option value="0">&gt; 0% Paid</option>
              <option value="10">&gt; 10% Paid</option>
              <option value="25">&gt; 25% Paid</option>
              <option value="50">&gt; 50% Paid</option>
              <option value="75">&gt; 75% Paid</option>
              <option value="90">&gt; 90% Paid</option>
              <option value="100">100% Fully Paid</option>
            </select>
          </div>

          {/* Date Selector Field */}
          <div>
            <label className={getFilterLabelClass(isDateFieldActive)}>Date Parameter</label>
            <select
              value={filters.dateField}
              onChange={e => {
                const nextField = e.target.value;
                setFilters(p => {
                  const synced = syncDateFilters(p.dateFilters || [], nextField);
                  return {
                    ...p,
                    dateField: nextField,
                    filterBlankDates: false,
                    dateFilters: synced
                  };
                });
              }}
              className={getFilterSelectClass(isDateFieldActive)}
            >
              <option value="All">No Date Filter</option>
              <optgroup label="Core Case Dates">
                <option value="tokenDate">Token Date</option>
                <option value="tokenDateTime">Token Date & Time</option>
                <option value="bookingDate">Booking Date</option>
                <option value="expectedDeliveryDate">Expected Delivery Date</option>
                <option value="expectedDeliveryTime">Expected Delivery Time</option>
                <option value="actualDeliveryDate">Actual Delivery Date</option>
                <option value="mlEstimatedDeliveryDate">ML Est Delivery Date</option>
              </optgroup>
              <optgroup label="Payments & OD">
                <option value="lastPaymentDate">Last Payment Date</option>
                <option value="expectedOdCompletionDate">OD Completion Date</option>
                <option value="eddReviewerDate">EDD Date (Reviewer)</option>
              </optgroup>
              <optgroup label="Cancellations & Updates">
                <option value="cancelReqDate">Cancellation Req Date</option>
                <option value="cancellationDate">Cancellation Date</option>
                <option value="tokenAutoCancellationExtendedDate">Auto Cancel Ext Date</option>
                <option value="dealStatusUpdatedAt">Deal Status Update Date</option>
                <option value="latestRemarkDate">Latest Remark Date</option>
                <option value="updatedAt">System Update Date</option>
              </optgroup>
              <optgroup label="CRM & Outbound Calls">
                <option value="lastCallAt">Last Call Date</option>
                <option value="followupAt">Followup Date</option>
                <option value="gmailPendencyDate">Gmail Pendency Date</option>
              </optgroup>
              <optgroup label="Milestones & Journey">
                <option value="latestLeadCreationTimestamp">Lead Creation Date</option>
                <option value="latestLoginTime">Login Time</option>
                <option value="latestCreditAssessedTimestamp">Credit Assessed Date</option>
                <option value="latestDiligenceAssessedTimestamp">Diligence Assessed Date</option>
                <option value="latestFcuAssessedTimestamp">FCU Assessed Date</option>
                <option value="tncGeneratedDate">TnC Generated Date</option>
                <option value="tncAcceptedTimestamp">TnC Accepted Date</option>
                <option value="fcuSentDate">FCU Sent Date</option>
                <option value="sentToRcuTimestamp">Sent to RCU Date</option>
                <option value="sentToOpsTimestamp">Sent to Ops Date</option>
                <option value="submitToOpsTimestamp">Submit to Ops Date</option>
                <option value="opsDisbursalTimestamp">Ops Disbursal Date</option>
                <option value="financeDisbursedTimestamp">Finance Disbursed Date</option>
                <option value="sheetLoginTimestamp">Sheet Login Date</option>
              </optgroup>
            </select>
          </div>

          {/* Date Bounds */}
          <div className="col-span-2">
            <div className="flex justify-between items-center mb-1">
              <label className={getFilterLabelClass(isDateRangeActive)}>Date Range</label>
              {isDateFieldActive && (
                <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 cursor-pointer select-none animate-fade-in">
                  <input
                    type="checkbox"
                    checked={filters.filterBlankDates || false}
                    onChange={e => setFilters(p => ({ ...p, filterBlankDates: e.target.checked }))}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 w-3 h-3 cursor-pointer"
                  />
                  <span>Blank Dates Only</span>
                </label>
              )}
            </div>
            <div className="flex gap-1.5 items-center">
              <input
                type="date"
                disabled={!isDateFieldActive || filters.filterBlankDates}
                value={filters.startDate}
                onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))}
                className={`w-full text-xs p-1.5 border rounded-xl transition-all duration-200 ${
                  !isDateFieldActive || filters.filterBlankDates
                    ? 'border-slate-100 bg-slate-100/50 text-slate-300 cursor-not-allowed'
                    : filters.startDate
                      ? 'border-amber-300 bg-amber-50/40 text-amber-900 font-semibold shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'
                }`}
              />
              <span className="text-[10px] text-slate-400">to</span>
              <input
                type="date"
                disabled={!isDateFieldActive || filters.filterBlankDates}
                value={filters.endDate}
                onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))}
                className={`w-full text-xs p-1.5 border rounded-xl transition-all duration-200 ${
                  !isDateFieldActive || filters.filterBlankDates
                    ? 'border-slate-100 bg-slate-100/50 text-slate-300 cursor-not-allowed'
                    : filters.endDate
                      ? 'border-amber-300 bg-amber-50/40 text-amber-900 font-semibold shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'
                }`}
              />
            </div>
          </div>

          {/* Query Search */}
          <div className="col-span-2">
            <label className={getFilterLabelClass(Boolean(localSearch))}>Fuzzy Text Query</label>
            <div className="relative">
              <input
                type="text"
                value={localSearch}
                onChange={e => setLocalSearch(e.target.value)}
                placeholder="Search Booking, car, user..."
                className={`w-full text-xs p-2 pl-8 border rounded-xl focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all duration-200 ${
                  localSearch
                    ? 'border-amber-300 bg-amber-50/40 text-amber-900 font-semibold shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'
                }`}
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              {localSearch && (
                <button 
                  onClick={() => {
                    setLocalSearch('');
                    setFilters(p => ({ ...p, searchQuery: '' }));
                  }}
                  className="absolute right-2.5 top-3 text-[10px] text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {/* Dynamic Date Filters (Any number of filters can be added) */}
          {filters.dateField !== 'All' && filters.dateFilters && filters.dateFilters.length > 0 && (
            <div className="col-span-full border-t border-slate-100 pt-4 mt-2">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Additional Date Filters</span>
                  {activeDynamicDateFilters.length > 0 && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {activeDynamicDateFilters.length} active
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {filters.dateFilters.map((df) => {
                  const isDfActive = df.dateField !== 'All';
                  const isDfRangeActive = isDfActive && (df.startDate !== '' || df.endDate !== '' || df.filterBlankDates);
                  return (
                    <div
                      key={df.id}
                      className={`grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-xl border transition-all duration-200 ${
                        isDfRangeActive
                          ? 'border-amber-200 bg-amber-50/10 shadow-sm'
                          : 'border-slate-150 bg-slate-50/40'
                      }`}
                    >
                      {/* Date Parameter Select */}
                      <div className="sm:col-span-4">
                        <select
                          value={df.dateField}
                          onChange={(e) => updateDateFilter(df.id, { dateField: e.target.value })}
                          className={`w-full text-xs p-1.5 border rounded-lg transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 cursor-pointer ${
                            isDfActive
                              ? 'border-amber-300 font-semibold text-amber-900 bg-amber-50/10'
                              : 'border-slate-200 text-slate-650 bg-white'
                          }`}
                        >
                          <option value="All">Select Additional Date Parameter...</option>
                          {DATE_OPTIONS.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.options.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  disabled={
                                    opt.value === filters.dateField ||
                                    filters.dateFilters?.some(x => x.id !== df.id && x.dateField === opt.value)
                                  }
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      {/* Blank Dates Checkbox */}
                      <div className="sm:col-span-2 flex items-center justify-start sm:justify-center">
                        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={df.filterBlankDates || false}
                            onChange={(e) => updateDateFilter(df.id, { filterBlankDates: e.target.checked })}
                            disabled={!isDfActive}
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span>Blank Only</span>
                        </label>
                      </div>

                      {/* Date Bounds Inputs */}
                      <div className="sm:col-span-5 flex items-center gap-1.5">
                        <input
                          type="date"
                          disabled={!isDfActive || df.filterBlankDates}
                          value={df.startDate}
                          onChange={(e) => updateDateFilter(df.id, { startDate: e.target.value })}
                          className={`w-full text-xs p-1.5 border rounded-lg transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 ${
                            !isDfActive || df.filterBlankDates
                              ? 'border-slate-100 bg-slate-100/50 text-slate-300 cursor-not-allowed'
                              : df.startDate
                                ? 'border-amber-300 bg-amber-50/40 text-amber-950 font-semibold shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        />
                        <span className="text-[10px] text-slate-400">to</span>
                        <input
                          type="date"
                          disabled={!isDfActive || df.filterBlankDates}
                          value={df.endDate}
                          onChange={(e) => updateDateFilter(df.id, { endDate: e.target.value })}
                          className={`w-full text-xs p-1.5 border rounded-lg transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 ${
                            !isDfActive || df.filterBlankDates
                              ? 'border-slate-100 bg-slate-100/50 text-slate-300 cursor-not-allowed'
                              : df.endDate
                                ? 'border-amber-300 bg-amber-50/40 text-amber-950 font-semibold shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        />
                      </div>

                      {/* Remove Button */}
                      <div className="sm:col-span-1 flex justify-end">
                        {isDfActive && (
                          <button
                            type="button"
                            onClick={() => removeDateFilter(df.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all duration-150 cursor-pointer"
                            title="Remove Filter"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={resetFilters}
            className="p-1.5 px-4 text-xs font-semibold text-slate-500 rounded-xl hover:bg-slate-100 transition-all border border-slate-200 active:scale-95"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* 2. Bento Ticker Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5" id="bento-kpis">
        {/* Total Cases */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total cases</span>
          <h4 className="text-2xl font-sans font-bold text-slate-800 leading-none my-1">
            {kpis.totalCases}
          </h4>
          <span className="text-[10px] text-slate-400">filtered operations</span>
        </div>

        {/* Active Tokens */}
        <div className="bg-white p-4 rounded-2xl border border-slate-105 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Active Tokens</span>
          <h4 className="text-2xl font-sans font-bold text-amber-500 leading-none my-1">
            {kpis.activeTokens}
          </h4>
          <span className="text-[10px] text-slate-400">awaiting deliveries</span>
        </div>

        {/* Delivered cases */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Delivered</span>
          <h4 className="text-2xl font-sans font-bold text-emerald-600 leading-none my-1">
            {kpis.delivered}
          </h4>
          <span className="text-[10px] text-slate-400">completed handovers</span>
        </div>

        {/* Cancelled cases */}
        <div className="bg-white p-4 rounded-2xl border border-slate-105 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex justify-between items-center">
            <span>Cancelled</span>
            {filteredCancelledC2dCount > 0 && (
              <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider select-none shrink-0" title="C2D: Cancelled booking but user converted to delivered on another Booking ID">
                C2D: {filteredCancelledC2dCount}
              </span>
            )}
          </span>
          <h4 className="text-2xl font-sans font-bold text-rose-600 leading-none my-1">
            {kpis.cancelled}
          </h4>
          <span className="text-[10px] text-slate-400">
            cancellation records {filteredCancelledC2dCount > 0 && `(C2D: ${filteredCancelledC2dCount} recovered)`}
          </span>
        </div>
      </div>

      {/* Tab Navigation Bar */}
      <div className="flex border-b border-slate-200 mt-6 mb-5 gap-2 select-none overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab('ops')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'ops'
              ? 'text-slate-900 font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          📁 Operations Console
          {activeTab === 'ops' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'performance'
              ? 'text-slate-900 font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          📊 Performance & Hubs
          {activeTab === 'performance' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('loss')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'loss'
              ? 'text-slate-900 font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          ⚠️ Loss & Cancellations
          {activeTab === 'loss' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'ledger'
              ? 'text-slate-900 font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          📈 Executive Ledger
          {activeTab === 'ledger' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900"
            />
          )}
        </button>
      </div>

      {activeTab === 'ops' && (
        <>
          {/* 3. Visual Charts Grid (Bento columns) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="bento-charts">
            {/* Lead Stage Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Lead Stage Split
              </h4>
              {renderSvgBarChart('Lead Stage', charts.leadStage, "bg-amber-500", "leadStage")}
            </div>

            {/* Task Bucket Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Task Bucket Distribution
              </h4>
              {renderSvgBarChart('Task Bucket', charts.taskBucket, "bg-indigo-500", "taskBucket")}
            </div>

            {/* EDD Distribution */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                EDD Distribution
              </h4>
              {renderSvgBarChart('EDD Distribution', charts.eddDistribution, "bg-rose-500", "eddStatus")}
            </div>
          </div>

          {renderInteractiveTable()}
        </>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* City Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                City Distribution
              </h4>
              {renderSvgBarChart('City', charts.city, "bg-sky-500", "city")}
            </div>

            {/* Hub Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Top Hubs (Volume)
              </h4>
              {renderSvgBarChart('Hub', charts.hub, "bg-violet-500", "hubName")}
            </div>

            {/* RM Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Relationship Managers (RM)
              </h4>
              {renderSvgBarChart('RM', charts.rm, "bg-emerald-500", "rmName")}
            </div>

            {/* Ready to Deliver Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Ready to Deliver?
              </h4>
              {renderSvgBarChart('Ready to Deliver', charts.readyToDeliver, "bg-teal-500", "readyToDeliver", {
                'Blank': 'bg-slate-400',
                'Yes': 'bg-emerald-500',
                'No': 'bg-rose-500',
              })}
            </div>
          </div>
          
          <div className="bg-indigo-50/40 border border-indigo-150 p-4 rounded-2xl flex items-start gap-3">
            <Activity className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="text-xs font-bold text-indigo-950">Performance Insights</h5>
              <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                Click on any City, Hub, or RM bar above to immediately filter the entire dashboard view. The Ready to Deliver chart shows Blank / Yes / No counts for the current selection. If a filter is currently active, a pulsing indicator will appear next to the label and the bar will turn orange.
              </p>
            </div>
          </div>
          {renderInteractiveTable()}
        </div>
      )}

      {activeTab === 'loss' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Cancellation Reason Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Cancellation Reasons
              </h4>
              {renderSvgBarChart('Cancellation Reason', charts.cancellationReason, "bg-rose-500", "cancelReason")}
            </div>

            {/* Payment Type Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Payment Type Split
              </h4>
              {renderSvgBarChart('Payment Type', charts.paymentType, "bg-amber-500", "paymentType")}
            </div>

            {/* Token Type Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Token Type Split
              </h4>
              {renderSvgBarChart('Token Type', charts.tokenType, "bg-indigo-500", "tokenType")}
            </div>

            {/* DS Channel Distribution */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                DS Channel Distribution
              </h4>
              {renderSvgBarChart('DS Channel', charts.leadDsChannel || {}, "bg-sky-500", "leadDsChannel")}
            </div>
          </div>

          <div className="bg-rose-50/50 border border-rose-150 p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="text-xs font-bold text-rose-950">Loss Analytics Insights</h5>
              <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                This panel highlights cancelled deal profiles. High concentration in specific payment types or token types can point to pipeline vulnerabilities. Use the date filters above to analyze cancellation trends over time.
              </p>
            </div>
          </div>
          {renderInteractiveTable()}
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="executive-summary-panel">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-slate-50/50">
            <div>
              <h3 className="font-sans font-semibold text-slate-800 text-sm">
                📈 Executive Operations Ledger
              </h3>
              <p className="text-[11px] text-slate-400">
                Dynamic cohort comparison of targets vs actuals, inflow volumes, and turnaround times (TAT).
              </p>
            </div>
            <div className="text-[10px] bg-slate-100 text-slate-650 px-3 py-1 rounded-md font-mono">
              Auto-Calculated relative to base date
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs select-none">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-sans text-slate-500 font-semibold">
                  <th className="p-3 pl-5 border-r border-slate-200 font-bold sticky left-0 bg-slate-50 z-10">Metric Name</th>
                  {matrix.columns.map(col => (
                    <th key={col.key} className="p-3 text-center border-r border-slate-100 font-bold min-w-[95px]">
                      <div>{col.label}</div>
                      <div className="text-[9px] font-normal text-slate-450 mt-0.5">{col.subLabel}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {/* Group rows by category */}
                {Object.entries(
                  matrix.rows.reduce<Record<string, MatrixRow[]>>((acc, row) => {
                    if (!acc[row.category]) acc[row.category] = [];
                    acc[row.category].push(row);
                    return acc;
                  }, {})
                ).map(([category, catRows]) => {
                  const rowsList = catRows as MatrixRow[];
                  return (
                    <React.Fragment key={category}>
                      {/* Category Header Row */}
                      <tr className="bg-slate-50/75 font-sans font-bold text-slate-700">
                        <td 
                          className="p-2.5 pl-5 border-r border-slate-200 sticky left-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500" 
                          colSpan={matrix.columns.length + 1}
                        >
                          📁 {category}
                        </td>
                      </tr>
                      {rowsList.map(row => (
                      <tr key={row.name} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-2.5 pl-8 border-r border-slate-200 sticky left-0 bg-white font-sans font-semibold text-slate-650 min-w-[200px]">
                          {row.name}
                        </td>
                        {matrix.columns.map(col => {
                          const val = row.values[col.key];
                          const displayVal = val === undefined || val === null ? '-' :
                            row.isPercent ? `${(Number(val) * 100).toFixed(2)}%` : val;
                          
                          // Style target columns
                          const isTarget = col.key.startsWith('target');
                          
                          return (
                            <td 
                              key={col.key} 
                              className={`p-2.5 text-center border-r border-slate-100 text-[11px] ${
                                isTarget ? 'text-slate-400 bg-slate-50/20' : 'text-slate-800'
                              }`}
                            >
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Detail Control Sidebar Slider Drawer */}
      <AnimatePresence>
        {selectedRowIndex !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRowIndex(null)}
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs"
            />

            {/* Sidebar Slider Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 h-screen w-full sm:max-w-xl bg-white shadow-2xl border-l border-slate-100 z-50 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="p-1 px-2 bg-amber-500 text-white text-[9px] uppercase tracking-wider font-extrabold rounded-md leading-none">
                      Active Booking Case Record
                    </span>
                    <span className="text-[10px] text-slate-300 font-mono">
                      Row Number: {filteredRows[selectedRowIndex]._rowNumber}
                    </span>
                  </div>
                  <h3 className="text-lg font-sans font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
                    <span>{filteredRows[selectedRowIndex].bookingId}</span>
                    {(filteredRows[selectedRowIndex].userId || filteredRows[selectedRowIndex].uid) && (
                      <a 
                        href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(filteredRows[selectedRowIndex].userId || filteredRows[selectedRowIndex].uid || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-mono font-bold uppercase transition-all"
                        title="Open WMFACT LMS customer detail page"
                      >
                        WMFACT <ExternalLink className="w-2.5 h-2.5 text-white/90" />
                      </a>
                    )}
                    {fetchingLatestRow && (
                      <span className="text-xs text-amber-400 font-mono animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching latest...
                      </span>
                    )}
                  </h3>
                </div>

                <button
                  onClick={() => setSelectedRowIndex(null)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sticky Tab Selector */}
              <div className="flex border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500 font-sans shrink-0 select-none overflow-x-auto no-scrollbar scroll-smooth">
                <button
                  type="button"
                  onClick={() => setSidebarTab('actions')}
                  className={`flex-1 min-w-[90px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                    sidebarTab === 'actions'
                      ? 'border-amber-500 text-amber-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>ACTIONS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('journey')}
                  className={`flex-1 min-w-[100px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                    sidebarTab === 'journey'
                      ? 'border-amber-500 text-amber-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>JOURNEY / CRM</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('pmax')}
                  className={`flex-1 min-w-[95px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                    sidebarTab === 'pmax'
                      ? 'border-amber-500 text-amber-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>PMAX STATUS</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('copilot')}
                  className={`flex-1 min-w-[95px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                    sidebarTab === 'copilot'
                      ? 'border-amber-500 text-amber-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>AI CO-PILOT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('raw_data')}
                  className={`flex-1 min-w-[90px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                    sidebarTab === 'raw_data'
                      ? 'border-amber-500 text-amber-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>RAW DATA</span>
                </button>
              </div>

              {/* Slider Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {sidebarTab === 'actions' && (
                  <div className="space-y-5">
                    {/* Micro Actions Block */}
                    <div className="p-4 bg-amber-50/70 border border-amber-200/50 rounded-2xl space-y-4">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1 uppercase tracking-wide border-b border-amber-200/30 pb-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" /> Actionable Inputs Layer
                      </h4>

                      <div className="space-y-3.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                            Ready to Deliver?
                          </label>
                          <select
                            value={tempRowData.readyToDeliver || ''}
                            onChange={e => setTempRowData(p => ({ ...p, readyToDeliver: e.target.value }))}
                            className="w-full text-xs p-2 border border-amber-200 rounded-lg bg-white"
                          >
                            <option value="">Blank</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                            Expected OD Completion Date
                          </label>
                          <input
                            type="date"
                            value={tempRowData.expectedOdCompletionDate || ''}
                            onChange={e => setTempRowData(p => ({ ...p, expectedOdCompletionDate: e.target.value }))}
                            className="w-full text-xs p-2 border border-amber-200 rounded-lg bg-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                            EDD Date Reviewer
                          </label>
                          <input
                            type="date"
                            value={tempRowData.eddReviewerDate || ''}
                            onChange={e => setTempRowData(p => ({ ...p, eddReviewerDate: e.target.value }))}
                            className="w-full text-xs p-2 border border-amber-200 rounded-lg bg-white font-mono"
                          />
                        </div>

                        {/* Remarks Everyone (TL/RM/FS/HH) Read-Only Block */}
                        <div>
                          <label className="block text-[11px] font-semibold text-amber-800 mb-1">
                            Remarks Everyone (TL/RM/FS/HH) in Sheet
                          </label>
                          {fetchingLatestRow ? (
                            <div className="w-full h-16 bg-amber-50/10 border border-dashed border-amber-200 rounded-lg animate-pulse flex items-center justify-center text-[10px] text-amber-600/70 font-mono">
                              Refreshing live remarks from GSheets...
                            </div>
                          ) : (
                            <div className="w-full text-xs p-3 border border-amber-200/60 rounded-xl bg-amber-50/30 text-slate-800 font-sans leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto shadow-inner">
                              {tempRowData.reviewerRemarks ? (
                                tempRowData.reviewerRemarks
                              ) : (
                                <span className="text-slate-400 italic">No existing remarks found in sheet.</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Extra Remark Addition Textarea */}
                        <div>
                          <label className="block text-[11px] font-semibold text-amber-800 mb-1 flex items-center justify-between">
                            <span>Extra Remark Addition</span>
                            <span className="text-[9px] text-amber-600/80 font-normal">Additions will append dynamically</span>
                          </label>
                          <textarea
                            rows={3}
                            value={(tempRowData as any).newRemarkAddition || ''}
                            onChange={e => setTempRowData(p => ({ ...p, newRemarkAddition: e.target.value }))}
                            placeholder="Type additional feedback here to append..."
                            className="w-full text-xs p-2.5 border border-amber-200 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-sm"
                          />
                        </div>

                        {/* Save & Sync button — directly below Extra Remark */}
                        {saveSuccess && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            Updated successfully
                          </motion.div>
                        )}
                        <button
                          type="button"
                          onClick={handleSaveActionables}
                          disabled={savingRow}
                          className="w-full p-2.5 rounded-xl text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all active:scale-97 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {savingRow ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Synchronizing to GSheets Layer...
                            </>
                          ) : (
                            "Save & Sync back to Spreadsheet"
                          )}
                        </button>

                        {/* Latest Remark from GSheet Section */}
                        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2 shadow-inner">
                          <div className="flex items-center justify-between">
                            <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                              Latest Remark (From Sheet Column)
                            </span>
                            {(tempRowData.latestRemarkBy || tempRowData.latestRemarkDate) && (
                              <span className="text-[9px] font-mono text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                {tempRowData.latestRemarkBy || 'System'} &bull; {tempRowData.latestRemarkDate || '-'}
                              </span>
                            )}
                          </div>
                          
                          {fetchingLatestRow ? (
                            <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
                          ) : (
                            <p className="text-xs text-slate-700 italic bg-white p-3 rounded-lg border border-slate-200/50 leading-relaxed font-sans whitespace-pre-wrap">
                              {tempRowData.latestRemark ? (
                                tempRowData.latestRemark
                              ) : (
                                <span className="text-slate-400 italic">No live latest_remark recorded in this sheet row.</span>
                              )}
                            </p>
                          )}
                        </div>


                      </div>
                    </div>

                    {/* Actionable Task & Context Detail */}
                    <div className="p-4 bg-indigo-50/50 border border-indigo-150/40 rounded-2xl space-y-3">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 uppercase tracking-wider pb-1.5 border-b border-indigo-100/50">
                        <Activity className="w-4 h-4 text-indigo-500" /> Active Operational Target
                      </h4>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold">Active Task Bucket</span>
                        {filteredRows[selectedRowIndex].taskBucket ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {splitTasks(filteredRows[selectedRowIndex].taskBucket).map((t, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200/50 uppercase font-sans">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic">No immediate task assigned.</span>
                        )}
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold">Reason &amp; Data Pointer</span>
                        <p className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/60 leading-relaxed font-sans mt-1 whitespace-pre-wrap">
                          {filteredRows[selectedRowIndex].reasonPointer || (
                            <span className="text-slate-400 italic">No diagnostic reason pointer provided in datasheet.</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Quick Core Details in Actions tab */}
                    <div className="p-4 bg-slate-50 border border-slate-200/40 rounded-2xl grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">Booking ID</span>
                        <span className="font-bold text-slate-800">{filteredRows[selectedRowIndex].bookingId}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">Car Reg No</span>
                        <span className="font-mono font-bold text-slate-800">{filteredRows[selectedRowIndex].carRegNo || '-'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">City</span>
                        <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].city || '-'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">Hub Name</span>
                        <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].hubName || '-'}</span>
                      </div>

                      {(filteredRows[selectedRowIndex].userId || filteredRows[selectedRowIndex].uid) && (
                        <div className="col-span-2 border-t border-slate-200/30 pt-3.5 flex flex-col gap-1">
                          <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">WMFACT (LMS Customer Link)</span>
                          <a 
                            href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(filteredRows[selectedRowIndex].userId || filteredRows[selectedRowIndex].uid || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 font-bold underline font-mono text-[11.5px] inline-flex items-center gap-1"
                          >
                            {filteredRows[selectedRowIndex].userId || filteredRows[selectedRowIndex].uid}
                            <ExternalLink className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {sidebarTab === 'journey' && (
                  <div className="space-y-6">
                    {/* Underwriting Credit Risk Profile - Critical Warning Banner at top */}
                    {(() => {
                      const row = filteredRows[selectedRowIndex];
                      const isHighRisk = row.redChannelFlag === 'Yes' || row.hardDerogFlag === 'Yes' || !!row.creditRejectionReason;
                      const isMedRisk = row.softDerogFlag === 'Yes';
                      
                      return (
                        <div className={`p-4 rounded-2xl border transition-all ${
                          isHighRisk 
                            ? 'bg-rose-50/80 border-rose-200/60 text-rose-800 shadow-xs' 
                            : isMedRisk 
                              ? 'bg-amber-50/80 border-amber-200/60 text-amber-800 shadow-xs' 
                              : 'bg-emerald-50/40 border-emerald-100/80 text-slate-800'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 font-sans">
                              <ShieldAlert className={`w-3.5 h-3.5 ${isHighRisk ? 'text-rose-500 animate-pulse' : isMedRisk ? 'text-amber-500' : 'text-emerald-500'}`} /> 
                              Underwriting Credit Risk Profile
                            </h5>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wide ${
                              isHighRisk 
                                ? 'bg-rose-100 text-rose-700 border border-rose-200/40' 
                                : isMedRisk 
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200/40' 
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200/40'
                            }`}>
                              {isHighRisk ? 'High Risk' : isMedRisk ? 'Medium Risk' : 'Clear / Low Risk'}
                            </span>
                          </div>
                          
                          <div className="text-xs space-y-1">
                            {row.redChannelReason ? (
                              <p className="font-medium text-[11px] leading-relaxed">
                                <span className="font-bold">Red Channel Trigger:</span> {row.redChannelReason}
                              </p>
                            ) : null}
                            {row.creditRejectionReason ? (
                              <p className="font-medium text-[11px] leading-relaxed text-rose-700">
                                <span className="font-bold">Credit Rejection Reason:</span> {row.creditRejectionReason} {row.creditRejectionSubReason ? `(${row.creditRejectionSubReason})` : ''}
                              </p>
                            ) : null}
                            {row.diligenceRejectionReason ? (
                              <p className="font-medium text-[11px] leading-relaxed text-rose-700">
                                <span className="font-bold">Diligence Rejection Reason:</span> {row.diligenceRejectionReason} {row.diligenceRejectionSubReason ? `(${row.diligenceRejectionSubReason})` : ''}
                              </p>
                            ) : null}
                            {!row.redChannelReason && !row.creditRejectionReason && !row.diligenceRejectionReason ? (
                              <p className="text-slate-500 text-[11px] leading-relaxed">
                                Eligible for streamlined processing. No immediate deviations or rejection warnings listed in database checks.
                              </p>
                            ) : null}
                            
                            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono pt-2 border-t border-dashed border-slate-200/60 mt-2">
                              <div>
                                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-sans font-medium">Hard Derog</span>
                                <span className={`font-bold ${row.hardDerogFlag === 'Yes' ? 'text-rose-600' : 'text-slate-700'}`}>
                                  {row.hardDerogFlag || 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-sans font-medium">Soft Derog</span>
                                <span className={`font-bold ${row.softDerogFlag === 'Yes' ? 'text-amber-600' : 'text-slate-700'}`}>
                                  {row.softDerogFlag || 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-sans font-medium">LTV Ratio</span>
                                <span className="font-extrabold text-slate-700">{row.creditLtv || '-'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Integrated Credit CRM Standard Indicators */}
                    <div className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-4 shadow-2xs">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" /> Underwriting &amp; Credit Indicators
                      </h4>

                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="p-2.5 bg-slate-50 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Hard Derog Flag</span>
                          <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                            filteredRows[selectedRowIndex].hardDerogFlag === 'Yes' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {filteredRows[selectedRowIndex].hardDerogFlag || 'No'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Soft Derog Flag</span>
                          <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                            filteredRows[selectedRowIndex].softDerogFlag === 'Yes' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {filteredRows[selectedRowIndex].softDerogFlag || 'No'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">OGL Pincode Check</span>
                          <span className="font-bold text-slate-800 mt-0.5 block">{filteredRows[selectedRowIndex].oglPincodeFlag || '-'}</span>
                        </div>

                        <div className="p-2.5 bg-slate-50 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Income Source</span>
                          <span className="font-bold text-slate-800 mt-0.5 block truncate" title={filteredRows[selectedRowIndex].incomeSource}>{filteredRows[selectedRowIndex].incomeSource || '-'}</span>
                        </div>
                      </div>

                      {/* LTV check and progress meter */}
                      <div className="bg-slate-50 p-3 rounded-xl">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 mb-1.5 font-mono">
                          <span>CREDIT LTV PROGRESS RATIO</span>
                          <span className="text-slate-800 font-extrabold">{filteredRows[selectedRowIndex].creditLtv || '0%'}</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ 
                              width: `${Math.min(100, parseFloat(filteredRows[selectedRowIndex].creditLtv || '0'))}%` 
                            }}
                          />
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                        <div className="flex justify-between py-1 border-b border-slate-100/50">
                          <strong>Case Type (RC):</strong>
                          <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].rcCaseType || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100/50">
                          <strong>Bajaj Segment Category:</strong>
                          <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].bajajSegment || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100/50">
                          <strong>Employer / Company:</strong>
                          <span className="font-bold text-slate-800 truncate max-w-[200px]" title={filteredRows[selectedRowIndex].companyName}>{filteredRows[selectedRowIndex].companyName || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <strong>FOIR % Index:</strong>
                          <span className="font-bold text-slate-800">{filteredRows[selectedRowIndex].foir || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* CRM Assessment & Form Status Card */}
                    <div className="p-4 bg-amber-50/20 border border-amber-200/40 rounded-2xl space-y-4 shadow-2xs">
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-amber-200/30">
                        <FileSpreadsheet className="w-4 h-4 text-amber-600" /> CRM Assessment &amp; Form Status
                      </h4>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 bg-white border border-slate-200/60 rounded-xl shadow-2xs">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Funnel Stage</span>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wide">
                            {filteredRows[selectedRowIndex].funnelStage || '-'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white border border-slate-200/60 rounded-xl shadow-2xs">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Final ROI %</span>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 tracking-wide font-mono">
                            {filteredRows[selectedRowIndex].finalRoi ? `${filteredRows[selectedRowIndex].finalRoi}%` : '-'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white border border-slate-200/60 rounded-xl shadow-2xs">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Form Risk Bucket</span>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                            filteredRows[selectedRowIndex].formRiskBucket?.toLowerCase() === 'high' 
                              ? 'bg-rose-50 text-rose-700 border-rose-100' 
                              : filteredRows[selectedRowIndex].formRiskBucket?.toLowerCase() === 'medium' 
                                ? 'bg-amber-50 text-amber-700 border-amber-100'
                                : 'bg-slate-50 text-slate-700 border-slate-100'
                          }`}>
                            {filteredRows[selectedRowIndex].formRiskBucket || '-'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white border border-slate-200/60 rounded-xl shadow-2xs">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Form Case Stage</span>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                            {filteredRows[selectedRowIndex].formCaseStage || '-'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white border border-slate-200/60 rounded-xl shadow-2xs">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Form Final Status</span>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                            {filteredRows[selectedRowIndex].formFinalStatus || '-'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white border border-slate-200/60 rounded-xl shadow-2xs">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Deviation Required?</span>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold border uppercase ${
                            filteredRows[selectedRowIndex].formDeviationRequired === 'Yes' 
                              ? 'bg-amber-50 text-amber-700 border-amber-100' 
                              : 'bg-slate-50 text-slate-505 border-slate-100'
                          }`}>
                            {filteredRows[selectedRowIndex].formDeviationRequired || 'No'}
                          </span>
                        </div>
                      </div>

                      {/* Form text columns: Detailed Ask & Remarks */}
                      <div className="space-y-3 pt-2">
                        {filteredRows[selectedRowIndex].formDetailedAsk && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Form Detailed Ask</span>
                            <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/60 shadow-inner">
                              {filteredRows[selectedRowIndex].formDetailedAsk}
                            </div>
                          </div>
                        )}

                        {filteredRows[selectedRowIndex].formFinalRemarks && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-550 uppercase tracking-wider block font-mono">Form Final Remarks</span>
                            <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/60 shadow-inner leading-relaxed">
                              {filteredRows[selectedRowIndex].formFinalRemarks}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vertical Milestone Progress Tracker */}
                    <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                        <Activity className="w-4 h-4 text-emerald-500" /> Lead Milestones Tracker
                      </h4>
                      
                      <div className="relative pl-5 border-l-2 border-slate-100 space-y-5 py-1">
                        {[
                          { label: 'Lead Created', date: filteredRows[selectedRowIndex].latestLeadCreationTimestamp },
                          { label: 'Case Logged In', date: filteredRows[selectedRowIndex].latestLoginTime || filteredRows[selectedRowIndex].sheetLoginTimestamp },
                          { label: 'Credit Assessed', date: filteredRows[selectedRowIndex].latestCreditAssessedTimestamp },
                          { label: 'Diligence Assessed', date: filteredRows[selectedRowIndex].latestDiligenceAssessedTimestamp },
                          { label: 'T&C Accepted', date: filteredRows[selectedRowIndex].tncAcceptedTimestamp },
                          { label: 'FCU Checked', date: filteredRows[selectedRowIndex].latestFcuAssessedTimestamp || filteredRows[selectedRowIndex].fcuSentDate },
                          { label: 'Submitted To Ops', date: filteredRows[selectedRowIndex].submitToOpsTimestamp || filteredRows[selectedRowIndex].sentToOpsTimestamp },
                          { label: 'Finance Disbursed', date: filteredRows[selectedRowIndex].financeDisbursedTimestamp || filteredRows[selectedRowIndex].opsDisbursalTimestamp }
                        ].map((m, idx) => {
                          const isDone = !!m.date;
                          return (
                            <div key={idx} className="relative">
                              {/* Bullets */}
                              <div className={`absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center ${
                                isDone ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-405'
                              }`}>
                                {isDone && <CheckCircle className="w-2.5 h-2.5 fill-emerald-500 text-white" />}
                              </div>
                              
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className={`text-[11px] font-bold block ${isDone ? 'text-slate-800' : 'text-slate-400 font-medium'}`}>
                                    {m.label}
                                  </span>
                                  {m.date ? (
                                    <span className="text-[10px] font-mono text-slate-500 leading-none">
                                      {m.date}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-medium text-slate-400/80 uppercase font-mono leading-none tracking-wider">
                                      Pending
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${
                                  isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                                }}`}>
                                  {isDone ? 'Completed' : 'Queue'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* CRM Outbound Calling metrics */}
                    <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200/30">
                        <PhoneCall className="w-4 h-4 text-indigo-500" /> CRM Outbound Calling Metrics
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-3 border border-slate-200/50 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Attempts vs Connections</span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-base font-extrabold text-slate-800">{filteredRows[selectedRowIndex].totalConnectedCalls || 0}</span>
                            <span className="text-xs text-slate-400 font-bold">/ {filteredRows[selectedRowIndex].totalCallAttempts || 0}</span>
                          </div>
                          
                          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-indigo-500 h-1.5 rounded-full animate-pulse" 
                              style={{ 
                                width: `${Math.min(100, Math.max(0, 
                                  ((filteredRows[selectedRowIndex].totalConnectedCalls || 0) / 
                                  (filteredRows[selectedRowIndex].totalCallAttempts || 1)) * 100
                                ))}%` 
                              }}
                            />
                          </div>
                        </div>

                        <div className="bg-white p-3 border border-slate-200/50 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Last Talk Duration</span>
                          <span className="text-sm font-bold text-slate-800 mt-1 block">
                            {filteredRows[selectedRowIndex].callDuration ? `${filteredRows[selectedRowIndex].callDuration}` : 'No talk time'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2.5 text-xs text-slate-600">
                        <div className="flex justify-between py-1 border-b border-slate-200/40">
                          <strong>Last Call At:</strong>
                          <span className="font-mono text-slate-800">{filteredRows[selectedRowIndex].lastCallAt || 'Never'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/40">
                          <strong>Dialed Operator (SP):</strong>
                          <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].lastCallConnectedSp || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/40">
                          <strong>Latest Outcome:</strong>
                          <span className="font-bold text-slate-800">{filteredRows[selectedRowIndex].latestCallOutcome || '-'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/40">
                          <strong>Last Disposition:</strong>
                          <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].lastDisposition || '-'}</span>
                        </div>
                        {filteredRows[selectedRowIndex].followupAt && (
                          <div className="flex justify-between py-1.5 bg-amber-50 px-2 rounded border border-amber-200/40">
                            <strong className="text-amber-850 flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled Follow-up:</strong>
                            <span className="font-bold text-amber-700 font-mono">{filteredRows[selectedRowIndex].followupAt}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {sidebarTab === 'pmax' && (
                  <div className="space-y-6">
                    {/* Header Card */}
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden shadow-md text-white">
                      <div className="absolute right-[-14px] bottom-[-14px] opacity-10">
                        <Database className="w-24 h-24 text-blue-400" />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-800 text-blue-400 font-mono">
                        <Database className="w-4 h-4 text-blue-400" /> Pmax status tracker
                      </h4>
                      <div className="mt-3 text-xs text-slate-300 space-y-2">
                        <div className="flex justify-between">
                          <strong>Login Timestamp:</strong>
                          <span className="font-mono text-white font-semibold">{filteredRows[selectedRowIndex].sheetLoginTimestamp || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <strong>Yard City:</strong>
                          <strong className="text-white">{filteredRows[selectedRowIndex].sheetYardCity || '-'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Partner & Yard Operations Details */}
                    <div className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-4 shadow-2xs">
                      <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                        Operations &amp; Yard Details
                      </h5>

                      <div className="space-y-3 text-xs text-slate-600">
                        <div className="flex justify-between py-1.5 border-b border-slate-100/60 font-medium">
                          <strong>Login Partner:</strong>
                          <span className="font-bold text-slate-800">{filteredRows[selectedRowIndex].sheetLoginPartner || '-'}</span>
                        </div>
                        
                        <div className="flex justify-between py-1.5 border-b border-slate-100/60 font-medium">
                          <strong>Yard Name:</strong>
                          <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].sheetYardName || '-'}</span>
                        </div>

                        <div className="flex justify-between py-1.5 border-b border-slate-100/60 font-medium">
                          <strong>Yard City:</strong>
                          <span className="font-semibold text-slate-800">{filteredRows[selectedRowIndex].sheetYardCity || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Activity Tracker */}
                    <div className="p-4 bg-blue-50/20 border border-blue-200/40 rounded-2xl space-y-4 shadow-2xs">
                      <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                        Pmax Case Lifecycle Status
                      </h5>

                      <div className="grid grid-cols-1 gap-3 text-xs">
                        <div className="p-3 bg-white border border-slate-200/60 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-bold font-mono">Sheet Final Status</span>
                          <span className={`inline-block mt-1 px-2.5 py-1 rounded text-[11px] font-extrabold uppercase border ${
                            filteredRows[selectedRowIndex].sheetFinalStatus?.toLowerCase().includes('disburs') 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              : filteredRows[selectedRowIndex].sheetFinalStatus?.toLowerCase().includes('reject')
                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                : 'bg-amber-50 text-amber-700 border-amber-100'
                          }`}>
                            {filteredRows[selectedRowIndex].sheetFinalStatus || 'Pending Status'}
                          </span>
                        </div>

                        <div className="p-3 bg-white border border-slate-200/60 rounded-xl">
                          <span className="block text-[10px] text-slate-400 uppercase font-bold font-mono">Last Disbursal Activity</span>
                          <span className="text-xs text-slate-800 font-bold block mt-1 leading-relaxed">
                            {filteredRows[selectedRowIndex].sheetLastDisbursalActivity || 'No active activity logs found.'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Remarks Card */}
                    <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 pb-5">
                      <strong className="text-[10px] text-slate-500 uppercase tracking-widest block font-mono">Sheet Detailed Remarks</strong>
                      <p className="text-xs text-slate-800 bg-white p-3.5 rounded-xl border border-slate-200/60 leading-relaxed font-sans whitespace-pre-wrap">
                        {filteredRows[selectedRowIndex].sheetDetailedRemarks || (
                          <span className="text-slate-400 italic">No detailed remarks found in Google Sheet layer.</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {sidebarTab === 'copilot' && (
                  <div className="space-y-5">
                    {/* Futuristic Predictor cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3.5 bg-slate-900 text-white rounded-2xl relative overflow-hidden border border-slate-800 shadow-lg">
                        <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
                          <Sparkles className="w-24 h-24 text-amber-400 animate-pulse" />
                        </div>
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-400 font-sans">ML Delivery Date</span>
                        <p className="text-base font-extrabold text-white mt-1.5 font-mono">
                          {filteredRows[selectedRowIndex].mlEstimatedDeliveryDate || 'N/A'}
                        </p>
                        <span className="text-[9px] text-slate-400 block mt-1">Estimated delivery by ML parser</span>
                      </div>

                      <div className="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50/55 border border-amber-200/60 text-slate-800 rounded-2xl shadow-inner">
                        <span className="text-[9px] uppercase tracking-wider font-bold text-amber-700">Confidence Match</span>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <p className="text-xl font-black text-amber-600 font-mono">
                            {filteredRows[selectedRowIndex].confidenceScore ? `${(parseFloat(filteredRows[selectedRowIndex].confidenceScore) * 100).toFixed(0)}%` : '78%'}
                          </p>
                        </div>
                        <span className="text-[9px] text-amber-800/70 block mt-1">Accuracy parsing precision</span>
                      </div>
                    </div>

                    {/* Gmail Summary Section styled as Chat bubble */}
                    <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-3.5">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                        <Sparkles className="w-4 h-4 text-amber-500" /> Parsed Gmail Case Summary
                      </h4>

                      <div className="p-3.5 rounded-2xl bg-amber-50/20 border border-amber-100 text-xs leading-relaxed text-slate-700 relative">
                        <span className="absolute top-2 right-3.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[8px] uppercase tracking-wider font-mono">Mail Engine V2</span>
                        {filteredRows[selectedRowIndex].gmailSummary ? (
                          <div className="space-y-2 whitespace-pre-line text-slate-800 font-sans">
                            {filteredRows[selectedRowIndex].gmailSummary}
                          </div>
                        ) : (
                          <p className="text-slate-400 italic">No incoming diagnostic email summary is linked to this case row.</p>
                        )}
                      </div>
                    </div>

                    {/* Operations pendency analysis */}
                    <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-200/30">
                        <AlertCircle className="w-4 h-4 text-orange-500" /> Operational Pendency Analysis
                      </h4>

                      <div className="space-y-4 text-xs text-slate-600">
                        <div>
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Pendency Status</span>
                          <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-1 ${
                            filteredRows[selectedRowIndex].gmailPendencyStatus === 'Pending' ? 'bg-amber-100 text-amber-700 font-semibold' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {filteredRows[selectedRowIndex].gmailPendencyStatus || 'No Pending status'}
                          </span>
                        </div>

                        <div>
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Reported Pendency Reason</span>
                          <p className="text-slate-700 mt-1 font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200/50">
                            {filteredRows[selectedRowIndex].gmailPendencyReason || 'No registered pendencies extracted.'}
                          </p>
                        </div>

                        <div>
                          <span className="block text-[10px] text-slate-400 uppercase font-semibold">Recommended AI Next Action</span>
                          <p className="text-amber-850 font-semibold mt-1 leading-relaxed bg-amber-50 px-2.5 py-2 rounded-lg border border-amber-200/40">
                            {filteredRows[selectedRowIndex].gmailNextAction || 'Proceed standard processing flow.'}
                          </p>
                        </div>

                        <div className="flex justify-between pt-1 text-[11px] border-t border-slate-200/30 text-slate-500">
                          <span>Source: {filteredRows[selectedRowIndex].gmailPendencySource || 'Gmail Crawler'}</span>
                          <span>Synced: {filteredRows[selectedRowIndex].gmailPendencyDate || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {sidebarTab === 'raw_data' && (
                  <div className="space-y-4">
                    {/* Column Search box */}
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={rawSearchQuery}
                        onChange={e => setRawSearchQuery(e.target.value)}
                        placeholder="Search column names or values..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </div>

                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white text-xs max-h-[60vh] overflow-y-auto shadow-inner">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-550 uppercase font-bold text-[9px] tracking-wider text-left">
                            <th className="p-2.5 pl-4">Spreadsheet Column</th>
                            <th className="p-2.5 pr-4">Active Database Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans text-slate-600">
                          {Object.entries(filteredRows[selectedRowIndex])
                            .filter(([key, val]) => {
                              if (key.startsWith('_')) return false; // Hide system row indices
                              if (val === undefined || val === null) return false;
                              
                              const prettyKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                              const strVal = String(val);
                              
                              if (rawSearchQuery.trim()) {
                                const lQuery = rawSearchQuery.toLowerCase();
                                return prettyKey.toLowerCase().includes(lQuery) || strVal.toLowerCase().includes(lQuery);
                              }
                              return true;
                            })
                            .map(([key, val]) => {
                              const prettyKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                              return (
                                <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-2.5 pl-4 font-semibold text-slate-700 align-top max-w-[150px] truncate" title={prettyKey}>
                                    {prettyKey}
                                  </td>
                                  <td className="p-2.5 pr-4 text-slate-600 font-mono text-[11px] break-all whitespace-pre-wrap leading-relaxed">
                                    {(key === 'userId' || key === 'uid' || key === 'leadId') ? (
                                      <a 
                                        href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(String(val))}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 hover:text-indigo-850 hover:underline font-bold inline-flex items-center gap-1 leading-none"
                                      >
                                        {String(val)}
                                        <ExternalLink className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      </a>
                                    ) : (
                                      String(val)
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          }
                          {Object.entries(filteredRows[selectedRowIndex]).filter(([key, val]) => {
                            if (key.startsWith('_')) return false;
                            if (val === undefined || val === null) return false;
                            const prettyKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                            const strVal = String(val);
                            if (rawSearchQuery.trim()) {
                              const lQuery = rawSearchQuery.toLowerCase();
                              return prettyKey.toLowerCase().includes(lQuery) || strVal.toLowerCase().includes(lQuery);
                            }
                            return true;
                          }).length === 0 && (
                            <tr>
                              <td colSpan={2} className="p-8 text-center text-slate-400 italic">
                                No matching columns found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

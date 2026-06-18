/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Filter, Search, AlertCircle, FileSpreadsheet, Eye, ExternalLink, Calendar, 
  Trash2, Plus, ArrowRightLeft, DollarSign, Activity, FileText, CheckCircle, 
  MapPin, User, Car, X, ShieldCheck, ArrowRight, RefreshCw,
  Clock, Sparkles, ShieldAlert, PhoneCall, Database
} from 'lucide-react';
import { CaseRow, DateFilter, FilterState, MatrixRow } from '../types';
import { CaseDetailsSidebar } from './CaseDetailsSidebar';
import MultiSelectDropdown from './MultiSelectDropdown';
import DashboardKpiCards from './DashboardKpiCards';
import DashboardCharts from './DashboardCharts';
import { getDerivedFlags, splitTasks } from '../data/mockData';
import { AppUser } from '../lib/firebaseAuth';
import { useCaseEditor } from '../hooks/useCaseEditor';
import { useDashboardDataSource } from '../hooks/useDashboardDataSource';
import {
  createDerivedLabels,
  DEFAULT_FILTERS,
} from '../lib/dashboardFilters';

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

const CORE_DERIVED_OPTIONS = [
  'Alert Cases',
  'EDD Missing',
  'EDD Breached',
  'PMax Stuck',
  'Customer Connect Pending',
  'High Payment Pending Delivery',
  'Cancelled After Payment',
  'OD Pending',
  'Blank Payment Type',
  'Payment Pending',
  'Any Active Task',
];

const CONFIDENCE_TREND_OPTIONS = ['Decline', 'Stable', 'Improving'];

interface DashboardProps {
  rows: CaseRow[];
  setRows: React.Dispatch<React.SetStateAction<CaseRow[]>>;
  demoMode?: boolean;
  sheetId: string;
  sheetName: string;
  accessToken: string | null;
  user: AppUser | null;
  isSyncing?: boolean;
  refreshKey?: number;
}


const AVAILABLE_ADDITIONAL_COLS: { key: keyof CaseRow; label: string }[] = [
  { key: 'totalListingDays', label: 'Total Listing Days' },
  { key: 'city', label: 'City' },
  { key: 'carRegNo', label: 'Car Registration No' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'variant', label: 'Variant' },
  { key: 'hubCode', label: 'Hub Code' },
  { key: 'cancelReason', label: 'Cancellation Reason' },
  { key: 'sheetFinalStatus', label: 'Sheet Final Status' },
  { key: 'formFinalStatus', label: 'Form Final Status' },
  { key: 'deviationMitigationComment', label: 'Deviation Comments' },
  { key: 'creditLtv', label: 'Credit LTV' },
  { key: 'contactNumber', label: 'Contact Number' }
];

export default function Dashboard({ 
  rows, 
  setRows, 
  demoMode = false,
  sheetId,
  sheetName,
  accessToken,
  user,
  isSyncing,
  refreshKey = 0,
}: DashboardProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const serverMode = Boolean(user) && !demoMode;

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [activeTab, setActiveTab] = useState<'ops' | 'performance' | 'loss' | 'ledger'>('ops');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // CSV Export Modal states
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [additionalCsvCols, setAdditionalCsvCols] = useState<string[]>([]);

  // Sorting states
  const [sortField, setSortField] = useState<keyof CaseRow | null>('tokenDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const {
    pageRows,
    setPageRows,
    activeTokenRows,
    summary,
    matrix,
    filterOptions,
    totalCount,
    loadingPage,
    activeTokenFastPath,
    reload,
  } = useDashboardDataSource({
    activeTab,
    demoMode,
    demoRows: rows,
    filters,
    page: currentPage,
    pageSize,
    sortField: sortField || 'tokenDate',
    sortDirection,
    refreshKey,
  });

  const handleSort = (field: keyof CaseRow) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const [exportingGoogleSheet, setExportingGoogleSheet] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const handleExportGoogleSheet = async () => {
    if (!accessToken) {
      alert("Please sign in with Google to export to Google Sheets.");
      return;
    }

    setExportingGoogleSheet(true);
    setExportFeedback("Creating new tab in Google Sheets...");
    
    try {
      const { exportFilteredRowsToGoogleSheet } = await import('../lib/sheetsService');
      const newTabTitle = await exportFilteredRowsToGoogleSheet(
        sheetId,
        accessToken,
        currentRows,
        additionalCsvCols
      );
      setExportFeedback(`Successfully exported to new tab: "${newTabTitle}"!`);
      setTimeout(() => {
        setExportFeedback(null);
        setShowCsvModal(false);
      }, 3000);
    } catch (err: any) {
      console.error("Google Sheets export failed:", err);
      setExportFeedback(`Export failed: ${err.message || err}`);
      setTimeout(() => setExportFeedback(null), 5000);
    } finally {
      setExportingGoogleSheet(false);
    }
  };

  const handleExportCsv = () => {
    // Basic standard columns
    const standardHeader = ["Booking ID", "Loan ID", "Token Date", "Hub", "RM", "TokenType", "PaymentType", "LeadStage", "Tasks", "ExpectedDelivery", "Ready", "ODCompletion", "Remarks"];
    
    // Add additional headers
    const additionalHeaders = AVAILABLE_ADDITIONAL_COLS
      .filter(col => additionalCsvCols.includes(String(col.key)))
      .map(col => col.label);
      
    const headerRow = [...standardHeader, ...additionalHeaders].join(",");
    
    const dataRows = currentRows.map(row => {
      const standardVals = [
        row.bookingId,
        row.loanId,
        row.tokenDate,
        row.hubName,
        row.allocatedRm,
        row.tokenType,
        row.paymentType,
        row.leadStage,
        row.taskBucket,
        row.expectedDeliveryDate,
        row.readyToDeliver,
        row.expectedOdCompletionDate,
        row.reviewerRemarks
      ];
      
      const additionalVals = AVAILABLE_ADDITIONAL_COLS
        .filter(col => additionalCsvCols.includes(String(col.key)))
        .map(col => {
          const val = row[col.key];
          return val !== undefined && val !== null ? val : '';
        });
        
      return [...standardVals, ...additionalVals]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    
    const csvContent = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cars24_ops_filtered_dataset.csv';
    link.click();
    setShowCsvModal(false);
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

  const currentRows = pageRows;
  const displayTotalCount = totalCount;
  const totalPages = Math.max(1, Math.ceil(displayTotalCount / pageSize));
  const activePage = Math.min(currentPage, totalPages);

  const {
    selectedBookingId,
    selectedRow,
    tempRowData,
    setTempRowData,
    savingRow,
    saveSuccess,
    saveFeedback,
    fetchingLatestRow,
    auditLogs,
    loadingAuditLogs,
    closeEditor,
    handleEditRowClick,
    handleSaveActionables,
  } = useCaseEditor({
    accessToken,
    rows: currentRows,
    setRows: serverMode ? setPageRows : setRows,
    sheetId,
    sheetName,
    user,
    onAfterSave: serverMode ? reload : undefined,
  });

  const dynamicFilterOptions = useMemo(() => ({
    cities: filterOptions.cities,
    tokenTypes: filterOptions.tokenTypes,
    tokenTypesWithNrt: filterOptions.tokenTypesWithNrt,
    rms: filterOptions.rms,
    dcs: filterOptions.dcs,
    paymentTypes: filterOptions.paymentTypes,
    leadStages: filterOptions.leadStages,
    funnelStages: filterOptions.funnelStages,
    sheetFinalStatuses: filterOptions.sheetFinalStatuses,
    formFinalStatuses: filterOptions.formFinalStatuses,
    gmailPendencyStatuses: filterOptions.gmailPendencyStatuses,
    onDemandStatuses: filterOptions.onDemandStatuses,
    tasks: filterOptions.tasks,
    derivedOptions: [...CORE_DERIVED_OPTIONS, ...filterOptions.tasks.filter(task => !CORE_DERIVED_OPTIONS.includes(task))],
    cancelReasons: filterOptions.cancelReasons,
    leadDsChannels: filterOptions.leadDsChannels,
  }), [filterOptions]);

  const cityFilteredHubs = useMemo(() => {
    if (filters.city === 'All') {
      return filterOptions.hubs;
    }

    const selectedCities = filters.city
      .split('|||')
      .map(value => value.trim())
      .filter(Boolean);

    const hubs = new Set<string>();
    selectedCities.forEach(city => {
      (filterOptions.hubsByCity[city] || []).forEach(hub => hubs.add(hub));
    });

    return Array.from(hubs).sort();
  }, [filterOptions.hubs, filterOptions.hubsByCity, filters.city]);

  // When city filter changes, clear hub selection (hub from old city is irrelevant)
  const prevCityRef = React.useRef(filters.city);
  useEffect(() => {
    if (prevCityRef.current !== filters.city) {
      prevCityRef.current = filters.city;
      setFilters(prev => ({ ...prev, hubName: 'All' }));
    }
  }, [filters.city]);

  const c2dStats = useMemo(() => {
    const sourceRows = demoMode ? rows : activeTokenFastPath ? activeTokenRows : currentRows;
    const grouped: Record<string, CaseRow[]> = {};
    sourceRows.forEach(row => {
      const id = row.userId || row.uid || row.leadId;
      if (!id) return;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(row);
    });

    const c2dBookingIds = new Set<string>();
    Object.values(grouped).forEach(customerRows => {
      const hasCancelled = customerRows.some(row => getDerivedFlags(row).isCancelled);
      const hasDelivered = customerRows.some(row => row.leadStage === 'DELIVERED');
      if (hasCancelled && hasDelivered) {
        customerRows.forEach(row => {
          if (getDerivedFlags(row).isCancelled) {
            c2dBookingIds.add(row.bookingId);
          }
        });
      }
    });

    return { c2dBookingIds };
  }, [activeTokenFastPath, activeTokenRows, currentRows, demoMode, rows]);

  const kpis = summary.kpis;
  const charts = summary.charts;
  const filteredCancelledC2dCount = summary.filteredCancelledC2dCount;

  const derivedLabels = useMemo(() => createDerivedLabels(filterOptions.tasks), [filterOptions.tasks]);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
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

  // Utility to format INR currencies
  const formatCurrency = (val: number) => {
    if (val >= 10000000) {
      return 'INR ' + (val / 10000000).toFixed(1) + ' Cr';
    }
    if (val >= 100000) {
      return 'INR ' + (val / 100000).toFixed(1) + ' L';
    }
    return 'INR ' + val.toLocaleString('en-IN');
  };
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
  const isConfidenceTrendActive = filters.confidenceTrend !== 'All';
  const isOnDemandStatusActive = filters.onDemandStatus !== 'All';
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
    if (isConfidenceTrendActive) count++;
    if (isOnDemandStatusActive) count++;
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
    isFormStatusActive, isGmailActive, isConfidenceTrendActive, isOnDemandStatusActive, isTaskActive, isDerivedActive,
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
              {isSorted ? (sortDirection === 'asc' ? '^' : 'v') : '<>'}
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
              Showing {displayTotalCount} matches in the current data source.
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => {
                setAdditionalCsvCols([]); // reset choices
                setShowCsvModal(true);
              }}
              className="p-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
            >
              Export Ledger
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
              {loadingPage ? (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-slate-400 font-medium">
                    Loading matching cases from the cache...
                  </td>
                </tr>
              ) : displayTotalCount === 0 ? (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-slate-400 font-medium">
                    No matching CARS24 rows fit the specified operational handshake filters.
                  </td>
                </tr>
              ) : (
                currentRows.map(row => {
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
                            : row.leadStage === 'RETURNED'
                            ? 'bg-purple-50 text-purple-700 font-extrabold border border-purple-100'
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
                            onClick={() => handleEditRowClick(row.bookingId)}
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
        {displayTotalCount > 0 && (
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
              Showing <span className="font-bold text-slate-800">{Math.min(displayTotalCount, (activePage - 1) * pageSize + 1)}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(displayTotalCount, activePage * pageSize)}</span> of{' '}
              <span className="font-bold text-slate-800">{displayTotalCount}</span> records
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-500" />
            <h3 className="font-sans font-semibold text-slate-800 text-sm">
              Operational Handshake Filters
            </h3>
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">
              {activeFiltersCount} Active Mappings
            </span>
          </div>

          {isSyncing && (
            <div
              className="p-2 px-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-extrabold shadow-sm text-xs flex items-center gap-1.5 select-none shrink-0"
              title="Google Sheets refresh is currently running"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Syncing...
            </div>
          )}
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

          <MultiSelectDropdown
            label="Confidence Trend"
            options={CONFIDENCE_TREND_OPTIONS}
            selectedString={filters.confidenceTrend}
            onChange={val => setFilters(p => ({ ...p, confidenceTrend: val }))}
            placeholder="All Trends"
            isActive={isConfidenceTrendActive}
            isOpen={openDropdown === 'confidenceTrend'}
            onToggle={() => setOpenDropdown(p => p === 'confidenceTrend' ? null : 'confidenceTrend')}
          />

          {/* On Demand Status */}
          <MultiSelectDropdown
            label="On Demand Status"
            options={dynamicFilterOptions.onDemandStatuses}
            selectedString={filters.onDemandStatus}
            onChange={val => setFilters(p => ({ ...p, onDemandStatus: val }))}
            placeholder="All OD Statuses"
            showBlank={true}
            isActive={isOnDemandStatusActive}
            isOpen={openDropdown === 'onDemandStatus'}
            onToggle={() => setOpenDropdown(p => p === 'onDemandStatus' ? null : 'onDemandStatus')}
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
      <DashboardKpiCards kpis={kpis} filteredCancelledC2dCount={filteredCancelledC2dCount} />

      {/* Tab Navigation Bar */}
      <div className="flex border-b border-slate-200 mt-6 mb-5 gap-2 select-none overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab('ops')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'ops'
              ? 'text-brand-blue font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          Operations Console
          {activeTab === 'ops' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'performance'
              ? 'text-brand-blue font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          Performance & Hubs
          {activeTab === 'performance' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('loss')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'loss'
              ? 'text-brand-blue font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          Loss & Cancellations
          {activeTab === 'loss' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-2.5 px-4 text-xs font-bold transition-all relative cursor-pointer active:scale-98 ${
            activeTab === 'ledger'
              ? 'text-brand-blue font-extrabold font-sans'
              : 'text-slate-400 hover:text-slate-700 font-sans'
          }`}
        >
          Executive Ledger
          {activeTab === 'ledger' && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange"
            />
          )}
        </button>
      </div>

      {(activeTab === 'ops' || activeTab === 'performance' || activeTab === 'loss') && (
        <DashboardCharts
          charts={charts}
          filters={filters}
          setFilters={setFilters}
          setCurrentPage={setCurrentPage}
          activeTab={activeTab}
          filteredCancelledC2dCount={filteredCancelledC2dCount}
        />
      )}

      {activeTab === 'ops' && renderInteractiveTable()}

      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="bg-indigo-50/40 border border-indigo-150 p-4 rounded-2xl flex items-start gap-3 mt-6">
            <Activity className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="text-xs font-bold text-indigo-950">Performance Insights</h5>
              <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                Click on any City, Hub, On Demand Status, or Ready to Deliver bar above to immediately filter the entire dashboard view. The Total Expected Amount card shows value-band distribution for the current selection. If a filter is currently active, a pulsing indicator will appear next to the label and the bar will turn orange.
              </p>
            </div>
          </div>
          {renderInteractiveTable()}
        </div>
      )}

      {activeTab === 'loss' && (
        <div className="space-y-6">
          <div className="bg-rose-50/50 border border-rose-150 p-4 rounded-2xl flex items-start gap-3 mt-6">
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
                Executive Operations Ledger
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
                          {category}
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
      <CaseDetailsSidebar
        isOpen={selectedBookingId !== null}
        onClose={closeEditor}
        selectedRow={selectedRow}
        fetchingLatestRow={fetchingLatestRow}
        tempRowData={tempRowData}
        setTempRowData={setTempRowData}
        saveSuccess={saveSuccess}
        saveFeedback={saveFeedback}
        isOffline={!accessToken}
        savingRow={savingRow}
        handleSaveActionables={handleSaveActionables}
        loadingAuditLogs={loadingAuditLogs}
        auditLogs={auditLogs}
      />

      {/* CSV Export Options Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full border border-slate-100 overflow-hidden transform scale-98 active:scale-100 transition-all duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Export Ledger Options</h3>
                <p className="text-xs text-slate-400 mt-1">Select additional columns to include in your export dataset</p>
              </div>
              <button 
                onClick={() => setShowCsvModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 max-h-[50vh] overflow-y-auto space-y-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Standard Columns (Always Included)</span>
              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 font-medium leading-relaxed">
                Booking ID, Loan ID, Token Date, Hub, RM, Token Type, Payment Type, Lead Stage, Task List, Expected EDD, Ready?, OD Completion, Remarks
              </div>
              
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 mt-4">Available Additional Columns</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AVAILABLE_ADDITIONAL_COLS.map(col => {
                  const isChecked = additionalCsvCols.includes(String(col.key));
                  return (
                    <label 
                      key={col.key} 
                      className={`flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer text-xs transition-all ${
                        isChecked 
                          ? 'border-amber-400 bg-amber-50/20 text-amber-900 font-semibold shadow-2xs' 
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setAdditionalCsvCols(prev => {
                            if (prev.includes(String(col.key))) {
                              return prev.filter(k => k !== col.key);
                            } else {
                              return [...prev, String(col.key)];
                            }
                          });
                        }}
                        className="rounded text-amber-500 focus:ring-amber-500/20 w-4 h-4 border-slate-300"
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {exportFeedback && (
              <div className={`mx-6 my-2 p-3 rounded-xl text-xs font-semibold ${
                exportFeedback.includes('failed') || exportFeedback.includes('Error')
                  ? 'bg-rose-50 text-rose-700 border border-rose-100'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-100/60'
              }`}>
                {exportFeedback}
              </div>
            )}
            
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end items-center gap-2">
              {!accessToken && (
                <span className="text-[10px] text-rose-500 font-semibold sm:mr-auto">
                  *Google Sign-in required for Sheets export
                </span>
              )}
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button 
                  onClick={() => setShowCsvModal(false)}
                  disabled={exportingGoogleSheet}
                  className="p-2 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 border border-slate-200 active:scale-95 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleExportCsv}
                  disabled={exportingGoogleSheet}
                  className="p-2 px-4 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 active:scale-95 transition-all shadow-xs disabled:opacity-50"
                >
                  Export CSV
                </button>
                <button 
                  onClick={handleExportGoogleSheet}
                  disabled={!accessToken || exportingGoogleSheet}
                  className="p-2 px-4 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {exportingGoogleSheet ? 'Exporting...' : 'Export Google Sheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

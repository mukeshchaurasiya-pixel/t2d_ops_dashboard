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
import { CaseRow, FilterState, DashboardKpis, DashboardCharts } from '../types';
import { getDerivedFlags, buildKpis, buildCharts, splitTasks } from '../data/mockData';
import { auth } from '../lib/firebaseAuth';
import { parseDateString } from '../lib/dateUtils';
import { calculateOperationsMatrix, MatrixRow } from '../lib/matrixCalculator';

interface DashboardProps {
  rows: CaseRow[];
  setRows: React.Dispatch<React.SetStateAction<CaseRow[]>>;
  filterOptions: Record<string, string[]>;
  sheetId: string;
  sheetName: string;
  accessToken: string | null;
}

export default function Dashboard({ 
  rows, 
  setRows, 
  filterOptions,
  sheetId,
  sheetName,
  accessToken
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
    searchQuery: ''
  });

  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'actions' | 'journey' | 'pmax' | 'copilot' | 'raw_data'>('actions');
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [tempRowData, setTempRowData] = useState<Partial<CaseRow>>({});
  const [savingRow, setSavingRow] = useState(false);
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

  // Filter logic
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      // Free text search
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesQuery = 
          String(row.bookingId || '').toLowerCase().includes(query) ||
          String(row.carRegNo || '').toLowerCase().includes(query) ||
          String(row.userId || '').toLowerCase().includes(query) ||
          String(row.make || '').toLowerCase().includes(query) ||
          String(row.model || '').toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      // Check simple mapping filters
      if (filters.city !== 'All' && row.city !== filters.city) return false;
      if (filters.hubName !== 'All' && row.hubName !== filters.hubName) return false;
      if (filters.tokenType !== 'All' && row.tokenType !== filters.tokenType) return false;
      if (filters.tokenTypeWithNrt !== 'All' && row.tokenTypeWithNrt !== filters.tokenTypeWithNrt) return false;
      
      if (filters.rmName !== 'All') {
        if (filters.rmName === 'Blank') {
          if (row.assignedRm && String(row.assignedRm).trim() !== '') return false;
        } else if (row.assignedRm !== filters.rmName) {
          return false;
        }
      }

      if (filters.dcName !== 'All') {
        if (filters.dcName === 'Blank') {
          if (row.assignedDc && String(row.assignedDc).trim() !== '') return false;
        } else if (row.assignedDc !== filters.dcName) {
          return false;
        }
      }

      if (filters.paymentType !== 'All') {
        if (filters.paymentType === 'Blank') {
          if (row.paymentType && String(row.paymentType).trim() !== '') return false;
        } else if (row.paymentType !== filters.paymentType) {
          return false;
        }
      }

      if (filters.leadStage !== 'All' && row.leadStage !== filters.leadStage) return false;
      if (filters.dealStatus !== 'All' && row.dealStatus !== filters.dealStatus) return false;
      if (filters.funnelStage !== 'All' && row.funnelStage !== filters.funnelStage) return false;

      if (filters.sheetFinalStatus !== 'All') {
        if (filters.sheetFinalStatus === 'Blank') {
          if (row.sheetFinalStatus && String(row.sheetFinalStatus).trim() !== '') return false;
        } else if (row.sheetFinalStatus !== filters.sheetFinalStatus) {
          return false;
        }
      }

      if (filters.formFinalStatus !== 'All') {
        if (filters.formFinalStatus === 'Blank') {
          if (row.formFinalStatus && String(row.formFinalStatus).trim() !== '') return false;
        } else if (row.formFinalStatus !== filters.formFinalStatus) {
          return false;
        }
      }

      if (filters.gmailPendencyStatus !== 'All' && row.gmailPendencyStatus !== filters.gmailPendencyStatus) return false;

      // Task Bucket checking
      if (filters.taskBucket !== 'All') {
        if (filters.taskBucket === 'Blank') {
          if (row.taskBucket && String(row.taskBucket).trim() !== '') return false;
        } else {
          const tasks = String(row.taskBucket || '').toLowerCase();
          if (!tasks.includes(filters.taskBucket.toLowerCase())) return false;
        }
      }

      // Derived status checking
      if (filters.derivedStatus !== 'All') {
        const flags = getDerivedFlags(row);
        let match = false;
        if (filters.derivedStatus === 'Alert Cases' && flags.isAlertCase) match = true;
        else if (filters.derivedStatus === 'EDD Missing' && flags.isEddMissing) match = true;
        else if (filters.derivedStatus === 'EDD Breached' && flags.isEddBreached) match = true;
        else if (filters.derivedStatus === 'PMax Stuck' && flags.isPmaxStuck) match = true;
        else if (filters.derivedStatus === 'Customer Connect Pending' && flags.isCustomerConnectPending) match = true;
        else if (filters.derivedStatus === 'High Payment Pending Delivery' && flags.isHighPaymentPendingDelivery) match = true;
        else if (filters.derivedStatus === 'Cancelled After Payment' && flags.isCancelledAfterPayment) match = true;
        else if (filters.derivedStatus === 'OD Pending' && flags.isOdPending) match = true;
        else if (filters.derivedStatus === 'Blank Payment Type' && flags.isBlankPaymentType) match = true;
        else if (filters.derivedStatus === 'Payment Pending' && flags.isPaymentPending) match = true;
        else if (filters.derivedStatus === 'Any Active Task' && Boolean(row.taskBucket)) match = true;
        // Search if matching dynamic spreadsheet task explicitly
        else if (row.taskBucket && String(row.taskBucket).toLowerCase().includes(filters.derivedStatus.toLowerCase())) match = true;
        
        if (!match) return false;
      }

      // Date ranges checking
      if (filters.dateField !== 'All' && (filters.startDate || filters.endDate)) {
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

      return true;
    });
  }, [rows, filters]);

  // KPIs
  const kpis: DashboardKpis = useMemo(() => buildKpis(filteredRows), [filteredRows]);
  
  // Charts
  const charts: DashboardCharts = useMemo(() => buildCharts(filteredRows), [filteredRows]);

  // Executive Operations Matrix Ledger
  const matrix = useMemo(() => calculateOperationsMatrix(filteredRows), [filteredRows]);

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
      searchQuery: ''
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
    
    // Mutation Warning check & Lock mechanism inside simulation
    const confirmed = window.confirm("Save and synchronize these actionable fields directly back to Google Sheet?");
    if (!confirmed) return;

    setSavingRow(true);
    const targetRow = filteredRows[selectedRowIndex];
    const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Concatenate extra comment/remark addition if filled
    const originalRemarks = tempRowData.reviewerRemarks || '';
    const newAddition = (tempRowData as any).newRemarkAddition || '';
    
    let combinedRemarks = originalRemarks;
    if (newAddition.trim()) {
      const emailSuffix = auth.currentUser?.email ? ` (${auth.currentUser.email.split('@')[0]})` : '';
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
          alert("Successfully saved and pushed changes directly to Google Sheets database row!");
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
      alert("Changes saved locally. Since you are in Anonymous Mode, please authorize under the Google Sheets tab to write back directly to the spreadsheet.");
      // Save locally anyway
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
    filterKey?: keyof FilterState
  ) => {
    const entries = Object.entries(dataObj).filter(([k]) => k !== 'Blank' && k !== 'All' && k !== '');
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
                  className={`h-full rounded-full ${isCurrentFilter ? 'bg-amber-500' : colorClass}`}
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
  const isDateFieldActive = filters.dateField !== 'All';
  const isDateRangeActive = isDateFieldActive && (filters.startDate !== '' || filters.endDate !== '' || filters.filterBlankDates);

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
            12 Active Mappings
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* City */}
          <div>
            <label className={getFilterLabelClass(isCityActive)}>City</label>
            <select
              value={filters.city}
              onChange={e => setFilters(p => ({ ...p, city: e.target.value, hubName: 'All' }))}
              className={getFilterSelectClass(isCityActive)}
            >
              <option value="All">All Cities</option>
              {filterOptions.cities?.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Hub */}
          <div>
            <label className={getFilterLabelClass(isHubActive)}>Hub Name</label>
            <select
              value={filters.hubName}
              onChange={e => setFilters(p => ({ ...p, hubName: e.target.value }))}
              className={getFilterSelectClass(isHubActive)}
            >
              <option value="All">All Hubs</option>
              {filterOptions.hubs?.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* TokenType */}
          <div>
            <label className={getFilterLabelClass(isTokenTypeActive)}>Token Type</label>
            <select
              value={filters.tokenType}
              onChange={e => setFilters(p => ({ ...p, tokenType: e.target.value }))}
              className={getFilterSelectClass(isTokenTypeActive)}
            >
              <option value="All">All Tokens</option>
              {filterOptions.tokenTypes?.map(tt => <option key={tt} value={tt}>{tt}</option>)}
            </select>
          </div>

          {/* RM Name */}
          <div>
            <label className={getFilterLabelClass(isRmActive)}>Assigned RM</label>
            <select
              value={filters.rmName}
              onChange={e => setFilters(p => ({ ...p, rmName: e.target.value }))}
              className={getFilterSelectClass(isRmActive)}
            >
              <option value="All">All RMs</option>
              <option value="Blank">Blank / Empty</option>
              {filterOptions.rms?.map(rm => <option key={rm} value={rm}>{rm}</option>)}
            </select>
          </div>

          {/* DC Name */}
          <div>
            <label className={getFilterLabelClass(isDcActive)}>Assigned DC</label>
            <select
              value={filters.dcName}
              onChange={e => setFilters(p => ({ ...p, dcName: e.target.value }))}
              className={getFilterSelectClass(isDcActive)}
            >
              <option value="All">All DCs</option>
              <option value="Blank">Blank / Empty</option>
              {filterOptions.dcs?.map(dc => <option key={dc} value={dc}>{dc}</option>)}
            </select>
          </div>

          {/* Payment Type */}
          <div>
            <label className={getFilterLabelClass(isPaymentActive)}>Payment Type</label>
            <select
              value={filters.paymentType}
              onChange={e => setFilters(p => ({ ...p, paymentType: e.target.value }))}
              className={getFilterSelectClass(isPaymentActive)}
            >
              <option value="All">All Payments</option>
              <option value="Blank">Blank / Empty</option>
              {filterOptions.paymentTypes?.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
          </div>

          {/* Lead Stage */}
          <div>
            <label className={getFilterLabelClass(isLeadStageActive)}>Lead Stage</label>
            <select
              value={filters.leadStage}
              onChange={e => setFilters(p => ({ ...p, leadStage: e.target.value }))}
              className={getFilterSelectClass(isLeadStageActive)}
            >
              <option value="All">All Stages</option>
              {filterOptions.leadStages?.map(ls => <option key={ls} value={ls}>{ls}</option>)}
            </select>
          </div>

          {/* Funnel Stage */}
          <div>
            <label className={getFilterLabelClass(isFunnelStageActive)}>Funnel Stage</label>
            <select
              value={filters.funnelStage}
              onChange={e => setFilters(p => ({ ...p, funnelStage: e.target.value }))}
              className={getFilterSelectClass(isFunnelStageActive)}
            >
              <option value="All">All Funnel Stages</option>
              {filterOptions.funnelStages?.map(fs => <option key={fs} value={fs}>{fs}</option>)}
            </select>
          </div>

          {/* Sheet Final Status */}
          <div>
            <label className={getFilterLabelClass(isSheetStatusActive)}>Sheet Status</label>
            <select
              value={filters.sheetFinalStatus}
              onChange={e => setFilters(p => ({ ...p, sheetFinalStatus: e.target.value }))}
              className={getFilterSelectClass(isSheetStatusActive)}
            >
              <option value="All">All Sheet Statuses</option>
              <option value="Blank">Blank / Empty</option>
              {filterOptions.sheetFinalStatuses?.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Form Final Status */}
          <div>
            <label className={getFilterLabelClass(isFormStatusActive)}>Form Status</label>
            <select
              value={filters.formFinalStatus}
              onChange={e => setFilters(p => ({ ...p, formFinalStatus: e.target.value }))}
              className={getFilterSelectClass(isFormStatusActive)}
            >
              <option value="All">All Form Statuses</option>
              <option value="Blank">Blank / Empty</option>
              {filterOptions.formFinalStatuses?.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Gmail Pendency Status */}
          <div>
            <label className={getFilterLabelClass(isGmailActive)}>Gmail Pendency</label>
            <select
              value={filters.gmailPendencyStatus}
              onChange={e => setFilters(p => ({ ...p, gmailPendencyStatus: e.target.value }))}
              className={getFilterSelectClass(isGmailActive)}
            >
              <option value="All">All Pendency Statuses</option>
              {filterOptions.gmailPendencyStatuses?.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Task Bucket */}
          <div>
            <label className={getFilterLabelClass(isTaskActive)}>Task Bucket</label>
            <select
              value={filters.taskBucket}
              onChange={e => setFilters(p => ({ ...p, taskBucket: e.target.value }))}
              className={getFilterSelectClass(isTaskActive)}
            >
              <option value="All">All Task Buckets</option>
              <option value="Blank">Blank / Empty</option>
              {allUniqueTasks.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Derived Status */}
          <div>
            <label className={getFilterLabelClass(isDerivedActive)}>Derived Issue</label>
            <select
              value={filters.derivedStatus}
              onChange={e => setFilters(p => ({ ...p, derivedStatus: e.target.value }))}
              className={getFilterSelectClass(isDerivedActive)}
            >
              <option value="All">Clear Case / No Issue</option>
              <optgroup label="Derived Alerts & Issues">
                <option value="Alert Cases">Alert Cases</option>
                <option value="EDD Missing">EDD Missing</option>
                <option value="EDD Breached">EDD Breached</option>
                <option value="PMax Stuck">PMax Stuck</option>
                <option value="Customer Connect Pending">Customer Connect Pending</option>
                <option value="High Payment Pending Delivery">High Payment Pending Delivery</option>
                <option value="Cancelled After Payment">Cancelled After Payment</option>
                <option value="OD Pending">OD Pending</option>
                <option value="Blank Payment Type">Blank Payment Type</option>
                <option value="Payment Pending">Payment Pending</option>
                <option value="Any Active Task">Any Active Task / Pending Item</option>
              </optgroup>
              {allUniqueTasks.length > 0 && (
                <optgroup label="Spreadsheet Task Buckets">
                  {allUniqueTasks.map(task => (
                    <option key={task} value={task}>Task: {task}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Date Selector Field */}
          <div>
            <label className={getFilterLabelClass(isDateFieldActive)}>Date Parameter</label>
            <select
              value={filters.dateField}
              onChange={e => setFilters(p => ({ ...p, dateField: e.target.value, filterBlankDates: false }))}
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
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Cancelled</span>
          <h4 className="text-2xl font-sans font-bold text-rose-600 leading-none my-1">
            {kpis.cancelled}
          </h4>
          <span className="text-[10px] text-slate-400">cancellation records</span>
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

            {/* Derived status split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Derived Status Distribution
              </h4>
              {renderSvgBarChart('Derived Status', charts.derivedStatus, "bg-rose-500", "derivedStatus")}
            </div>
          </div>

          {/* 4. Active Dataset Spreadsheet Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" id="interactive-dataset-panel">
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
                      ["Booking ID", "City", "Hub", "RM", "TokenType", "PaymentType", "LeadStage", "Tasks", "ExpectedDelivery", "Ready", "ODCompletion", "Remarks"].join(","),
                      ...filteredRows.map(row => [
                        row.bookingId, row.city, row.hubName, row.assignedRm, row.tokenType, row.paymentType, row.leadStage, row.taskBucket, row.expectedDeliveryDate, row.readyToDeliver, row.expectedOdCompletionDate, row.reviewerRemarks
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
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 font-sans border-b border-slate-100/80 text-slate-500 select-none">
                    <th className="p-3.5 pl-5 font-semibold">Booking ID</th>
                    <th className="p-3.5 font-semibold">City</th>
                    <th className="p-3.5 font-semibold text-slate-600">Hub</th>
                    <th className="p-3.5 font-semibold">RM Name</th>
                    <th className="p-3.5 font-semibold">Payment Type</th>
                    <th className="p-3.5 font-semibold">Lead Stage</th>
                    <th className="p-3.5 font-semibold">Task List</th>
                    <th className="p-3.5 font-semibold">Expected EDD</th>
                    <th className="p-3.5 font-semibold">Ready?</th>
                    <th className="p-3.5 font-semibold">OD Completion</th>
                    <th className="p-3.5 text-right pr-5 font-semibold">Control Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-10 text-center text-slate-400 font-medium">
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
                            <div className="font-semibold text-slate-800">{row.bookingId}</div>
                            {(row.userId || row.uid) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                <a 
                                  href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(row.userId || row.uid || '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-1.5 py-0.5 rounded font-mono font-medium flex items-center gap-0.5 transition-all"
                                  title="View Customer WMF/LMS Profile"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  WMFACT <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            )}
                          </td>
                          <td className="p-3.5">{row.city}</td>
                          <td className="p-3.5 truncate max-w-[130px]" title={row.hubName}>
                            {row.hubName}
                          </td>
                          <td className="p-3.5">{row.assignedRm}</td>
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

            {/* DC Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Delivery Coordinators (DC)
              </h4>
              {renderSvgBarChart('DC', charts.dc, "bg-teal-500", "dcName")}
            </div>
          </div>
          
          <div className="bg-indigo-50/40 border border-indigo-150 p-4 rounded-2xl flex items-start gap-3">
            <Activity className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="text-xs font-bold text-indigo-950">Performance Insights</h5>
              <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                Click on any location (City/Hub) or personnel (RM/DC) bar above to immediately filter the entire dashboard view. If a filter is currently active, a pulsing indicator will appear next to the label and the bar will turn orange.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'loss' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Cancellation Reason Split */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
                Cancellation Reasons
              </h4>
              {renderSvgBarChart('Cancellation Reason', charts.cancellationReason, "bg-rose-500")}
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

                        {/* Latest Remark from GSheet Section (Placed Below and Fully Visible) */}
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

                        <button
                          type="button"
                          onClick={handleSaveActionables}
                          disabled={savingRow}
                          className="w-full p-2.5 rounded-xl text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-all mt-2 active:scale-97 cursor-pointer flex items-center justify-center gap-1.5"
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

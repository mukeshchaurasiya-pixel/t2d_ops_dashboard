import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CaseRow,
  DashboardFilterOptions,
  DashboardMatrixResult,
  DashboardSummaryResult,
  FilterState,
} from '../types';
import {
  buildLocalDashboardMatrix,
  buildLocalDashboardSummary,
  createCaseQuery,
  EMPTY_CASE_PAGE,
  EMPTY_DASHBOARD_MATRIX,
  EMPTY_DASHBOARD_SUMMARY,
  EMPTY_FILTER_OPTIONS,
  isActiveTokenFastPath,
  normalizeFilterState,
} from '../lib/dashboardQuery';
import {
  getActiveTokenCasesFromDb,
  getCasesPageFromDb,
  getDashboardFilterOptionsFromDb,
  getDashboardMatrixFromDb,
  getDashboardSummaryFromDb,
} from '../lib/supabaseDb';
import { buildC2DStats, buildDynamicFilterOptions, buildEddLabels, C2DStats, isRowMatchingFilter } from '../lib/dashboardFilters';
import { getDerivedFlags, splitTasks } from '../data/mockData';
import { parseDateString } from '../lib/dateUtils';

type DashboardDataSourceArgs = {
  activeTab: 'ops' | 'performance' | 'loss' | 'ledger';
  demoMode: boolean;
  demoRows: CaseRow[];
  filters: FilterState;
  page: number;
  pageSize: number;
  sortField: keyof CaseRow | string;
  sortDirection: 'asc' | 'desc';
  refreshKey?: number;
};

function sortRows(rows: CaseRow[], sortField: keyof CaseRow | string, sortDirection: 'asc' | 'desc') {
  const fieldName = String(sortField).toLowerCase();
  const isDateField = fieldName.includes('date') || fieldName.includes('time') || fieldName.includes('timestamp');

  if (isDateField) {
    const mapped = rows.map(row => {
      const val = row[sortField as keyof CaseRow];
      const date = val ? parseDateString(String(val)) : null;
      return { row, val: date ? date.getTime() : 0 };
    });
    mapped.sort((a, b) => {
      return sortDirection === 'asc' ? a.val - b.val : b.val - a.val;
    });
    return mapped.map(item => item.row);
  }

  return [...rows].sort((a, b) => {
    const valA = a[sortField as keyof CaseRow];
    const valB = b[sortField as keyof CaseRow];

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }

    const strA = String(valA || '').toLowerCase();
    const strB = String(valB || '').toLowerCase();
    if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
    if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

function buildLocalFilterOptions(rows: CaseRow[]): DashboardFilterOptions {
  const dynamic = buildDynamicFilterOptions(rows);
  const hubsByCity: Record<string, string[]> = {};
  const hubs = new Set<string>();
  const tokenTypesWithNrt = new Set<string>();
  const dealStatuses = new Set<string>();

  rows.forEach(row => {
    if (row.hubName) {
      hubs.add(row.hubName.trim());
      const city = String(row.city || '').trim();
      if (city) {
        if (!hubsByCity[city]) hubsByCity[city] = [];
        if (!hubsByCity[city].includes(row.hubName.trim())) {
          hubsByCity[city].push(row.hubName.trim());
        }
      }
    }
    if (row.tokenTypeWithNrt) tokenTypesWithNrt.add(String(row.tokenTypeWithNrt).trim());
    if (row.dealStatus) dealStatuses.add(String(row.dealStatus).trim());
  });

  Object.values(hubsByCity).forEach(values => values.sort());

  return {
    cities: dynamic.cities,
    hubs: Array.from(hubs).sort(),
    hubsByCity,
    tokenTypes: dynamic.tokenTypes,
    tokenTypesWithNrt: Array.from(tokenTypesWithNrt).sort(),
    rms: dynamic.rms,
    dcs: dynamic.dcs,
    paymentTypes: dynamic.paymentTypes,
    leadStages: dynamic.leadStages,
    dealStatuses: Array.from(dealStatuses).sort(),
    funnelStages: dynamic.funnelStages,
    sheetFinalStatuses: dynamic.sheetFinalStatuses,
    formFinalStatuses: dynamic.formFinalStatuses,
    gmailPendencyStatuses: dynamic.gmailPendencyStatuses,
    onDemandStatuses: dynamic.onDemandStatuses,
    tasks: dynamic.tasks,
    cancelReasons: dynamic.cancelReasons,
    leadDsChannels: dynamic.leadDsChannels,
  };
}

function buildFilteredCancelledC2dCount(filteredRows: CaseRow[], allRows: CaseRow[]): number {
  const customerDeliveredTimes = new Map<string, number[]>();

  allRows.forEach(row => {
    if (row.leadStage === 'DELIVERED') {
      const key = row.userId || row.uid || row.leadId;
      if (key) {
        const cleanedKey = key.trim();
        const delDateStr = row.actualDeliveryDate || row.tokenDate;
        if (delDateStr) {
          const t = parseDateString(delDateStr)?.getTime() || 0;
          if (t > 0) {
            if (!customerDeliveredTimes.has(cleanedKey)) {
              customerDeliveredTimes.set(cleanedKey, []);
            }
            customerDeliveredTimes.get(cleanedKey)!.push(t);
          }
        }
      }
    }
  });

  let total = 0;
  filteredRows.forEach(row => {
    const flags = getDerivedFlags(row);
    if (flags.isCancelled) {
      const key = row.userId || row.uid || row.leadId;
      if (key) {
        const cleanedKey = key.trim();
        const deliveredTimes = customerDeliveredTimes.get(cleanedKey);
        if (deliveredTimes && deliveredTimes.length > 0) {
          const cancelledTime = row.tokenDate ? (parseDateString(row.tokenDate)?.getTime() || 0) : 0;
          const hasDeliveredAfter = deliveredTimes.some(t => t >= cancelledTime);
          if (hasDeliveredAfter) {
            total++;
          }
        }
      }
    }
  });

  return total;
}

function buildFilteredCancelledC2aCount(filteredRows: CaseRow[], allRows: CaseRow[]): number {
  const customerBookings = new Map<string, CaseRow[]>();
  allRows.forEach(row => {
    const key = row.userId || row.uid || row.leadId;
    if (key) {
      const cleanedKey = key.trim();
      if (!customerBookings.has(cleanedKey)) {
        customerBookings.set(cleanedKey, []);
      }
      customerBookings.get(cleanedKey)!.push(row);
    }
  });

  customerBookings.forEach(rows => {
    rows.sort((a, b) => {
      const ta = a.tokenDate ? (parseDateString(a.tokenDate)?.getTime() || 0) : 0;
      const tb = b.tokenDate ? (parseDateString(b.tokenDate)?.getTime() || 0) : 0;
      return ta - tb;
    });
  });

  let total = 0;
  filteredRows.forEach(row => {
    const flags = getDerivedFlags(row);
    if (flags.isCancelled) {
      const key = row.userId || row.uid || row.leadId;
      if (key) {
        const cleanedKey = key.trim();
        const sortedBookings = customerBookings.get(cleanedKey) || [];
        const index = sortedBookings.findIndex(b => b.bookingId === row.bookingId);
        if (index !== -1) {
          const cancelledTime = row.tokenDate ? (parseDateString(row.tokenDate)?.getTime() || 0) : 0;
          let prevTime = 0;
          if (index > 0) {
            const prevBooking = sortedBookings[index - 1];
            prevTime = prevBooking.tokenDate ? (parseDateString(prevBooking.tokenDate)?.getTime() || 0) : 0;
          }

          const hasMatchingActive = sortedBookings.some(r => {
            if (r.leadStage === 'ACTIVE_TOKEN') {
              const activeTime = r.tokenDate ? (parseDateString(r.tokenDate)?.getTime() || 0) : 0;
              if (activeTime >= cancelledTime) {
                return true;
              }
              if (index > 0 && activeTime >= prevTime && activeTime <= cancelledTime) {
                return true;
              }
            }
            return false;
          });

          if (hasMatchingActive) {
            total++;
          }
        }
      }
    }
  });

  return total;
}

function buildFilteredCancelledCr2dCount(filteredRows: CaseRow[]): number {
  let total = 0;
  filteredRows.forEach(row => {
    if (row.leadStage === 'DELIVERED' && Boolean(row.cancelReason)) {
      total++;
    }
  });
  return total;
}

function buildLocalSnapshot(
  sourceRows: CaseRow[],
  filters: FilterState,
  page: number,
  pageSize: number,
  sortField: keyof CaseRow | string,
  sortDirection: 'asc' | 'desc'
) {
  const eddLabels = buildEddLabels();
  const c2dStats = buildC2DStats(sourceRows);
  const filtered = sourceRows.filter(row => isRowMatchingFilter(row, filters, eddLabels, undefined, c2dStats));
  const sorted = sortRows(filtered, sortField, sortDirection);
  const totalCount = sorted.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const pagedRows = sorted.slice(start, start + pageSize);
  const filteredCancelledC2dCount = buildFilteredCancelledC2dCount(sorted, sourceRows);
  const filteredCancelledC2aCount = buildFilteredCancelledC2aCount(sorted, sourceRows);
  const filteredCancelledCr2dCount = buildFilteredCancelledCr2dCount(sorted);

  return {
    pageRows: pagedRows,
    totalCount,
    summary: buildLocalDashboardSummary(
      sorted,
      filteredCancelledC2dCount,
      filteredCancelledC2aCount,
      filteredCancelledCr2dCount
    ),
    matrix: buildLocalDashboardMatrix(sorted),
    filterOptions: buildLocalFilterOptions(sourceRows),
  };
}

export function useDashboardDataSource({
  activeTab,
  demoMode,
  demoRows,
  filters,
  page,
  pageSize,
  sortField,
  sortDirection,
  refreshKey = 0,
}: DashboardDataSourceArgs) {
  const [pageRows, setPageRows] = useState<CaseRow[]>(demoRows);
  const [activeTokenRows, setActiveTokenRows] = useState<CaseRow[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryResult>(EMPTY_DASHBOARD_SUMMARY);
  const [matrix, setMatrix] = useState<DashboardMatrixResult>(EMPTY_DASHBOARD_MATRIX);
  const [filterOptions, setFilterOptions] = useState<DashboardFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const query = useMemo(
    () => createCaseQuery(filters, page, pageSize, sortField, sortDirection),
    [filters, page, pageSize, sortField, sortDirection]
  );
  const activeTokenFastPath = !demoMode && isActiveTokenFastPath(query.filters) && activeTokenRows.length > 0;

  // 1. Determine local source rows
  const localSourceRows = useMemo(() => {
    if (demoMode) return demoRows;
    if (activeTokenFastPath) return activeTokenRows;
    return [];
  }, [demoMode, demoRows, activeTokenFastPath, activeTokenRows]);

  // 1.5 local C2D/C2A statistics
  const localC2dStats = useMemo(() => {
    return buildC2DStats(localSourceRows);
  }, [localSourceRows]);

  // 2. Local filtering
  const localFilteredRows = useMemo(() => {
    if (localSourceRows.length === 0) return [];
    const eddLabels = buildEddLabels();
    return localSourceRows.filter(row => isRowMatchingFilter(row, filters, eddLabels, undefined, localC2dStats));
  }, [localSourceRows, filters, localC2dStats]);

  // 3. Filtered Cancelled C2D Count
  const localFilteredCancelledC2dCount = useMemo(() => {
    if (localFilteredRows.length === 0) return 0;
    return buildFilteredCancelledC2dCount(localFilteredRows, localSourceRows);
  }, [localFilteredRows, localSourceRows]);

  const localFilteredCancelledC2aCount = useMemo(() => {
    if (localFilteredRows.length === 0) return 0;
    return buildFilteredCancelledC2aCount(localFilteredRows, localSourceRows);
  }, [localFilteredRows, localSourceRows]);

  const localFilteredCancelledCr2dCount = useMemo(() => {
    if (localFilteredRows.length === 0) return 0;
    return buildFilteredCancelledCr2dCount(localFilteredRows);
  }, [localFilteredRows]);

  // 4. Local Summary
  const localSummary = useMemo(() => {
    if (localSourceRows.length === 0) return EMPTY_DASHBOARD_SUMMARY;
    return buildLocalDashboardSummary(
      localFilteredRows,
      localFilteredCancelledC2dCount,
      localFilteredCancelledC2aCount,
      localFilteredCancelledCr2dCount
    );
  }, [
    localFilteredRows,
    localFilteredCancelledC2dCount,
    localFilteredCancelledC2aCount,
    localFilteredCancelledCr2dCount,
    localSourceRows.length
  ]);

  // 4.5 Local filtering for matrix (ignoring date range filters so columns aren't truncated)
  const localFilteredRowsForMatrix = useMemo(() => {
    if (localSourceRows.length === 0) return [];
    const eddLabels = buildEddLabels();
    return localSourceRows.filter(row => isRowMatchingFilter(row, filters, eddLabels, 'dateRange', localC2dStats));
  }, [localSourceRows, filters, localC2dStats]);

  // 5. Local Matrix
  const localMatrix = useMemo(() => {
    if (localSourceRows.length === 0) return EMPTY_DASHBOARD_MATRIX;
    return buildLocalDashboardMatrix(localFilteredRowsForMatrix);
  }, [localFilteredRowsForMatrix, localSourceRows.length]);

  // 6. Local Filter Options
  const localFilterOptions = useMemo(() => {
    if (localSourceRows.length === 0) return EMPTY_FILTER_OPTIONS;
    return buildLocalFilterOptions(localSourceRows);
  }, [localSourceRows]);

  // 7. Local Sorting
  const localSortedRows = useMemo(() => {
    if (localFilteredRows.length === 0) return [];
    return sortRows(localFilteredRows, sortField, sortDirection);
  }, [localFilteredRows, sortField, sortDirection]);

  // 8. Local Paged Rows
  const localPagedRows = useMemo(() => {
    if (localSortedRows.length === 0) return [];
    const start = Math.max(0, (page - 1) * pageSize);
    return localSortedRows.slice(start, start + pageSize);
  }, [localSortedRows, page, pageSize]);

  // 9. Local Total Count
  const localTotalCount = useMemo(() => {
    return localSortedRows.length;
  }, [localSortedRows]);

  // Sync local changes to state
  useEffect(() => {
    if (demoMode || activeTokenFastPath) {
      setPageRows(localPagedRows);
      setTotalCount(localTotalCount);
      setSummary(localSummary);
      setMatrix(localMatrix);
      setFilterOptions(localFilterOptions);
    }
  }, [
    demoMode,
    activeTokenFastPath,
    localPagedRows,
    localTotalCount,
    localSummary,
    localMatrix,
    localFilterOptions,
  ]);

  useEffect(() => {
    if (demoMode) {
      return;
    }

    let cancelled = false;
    const loadStaticData = async () => {
      try {
        const [options, workingSet] = await Promise.all([
          getDashboardFilterOptionsFromDb(),
          getActiveTokenCasesFromDb(),
        ]);
        if (!cancelled) {
          setFilterOptions(options);
          setActiveTokenRows(workingSet);
        }
      } catch (err) {
        console.warn('Failed to bootstrap dashboard filter options or ACTIVE_TOKEN working set:', err);
      }
    };

    void loadStaticData();

    return () => {
      cancelled = true;
    };
  }, [demoMode, refreshKey, reloadNonce]);

  const reload = useCallback(() => {
    setReloadNonce(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (demoMode || activeTokenFastPath) {
      return;
    }

    let cancelled = false;

    const loadServerData = async () => {
      setLoadingPage(true);
      setLoadingSummary(true);

      try {
        const [pageResult, summaryResult] = await Promise.all([
          getCasesPageFromDb(query),
          getDashboardSummaryFromDb({ filters: query.filters }),
        ]);

        if (!cancelled) {
          setPageRows(pageResult.rows || EMPTY_CASE_PAGE.rows);
          setTotalCount(pageResult.totalCount || 0);
          setSummary(summaryResult);
        }
      } catch (err) {
        console.error('Failed to load dashboard page or summary:', err);
      } finally {
        if (!cancelled) {
          setLoadingPage(false);
          setLoadingSummary(false);
        }
      }
    };

    void loadServerData();

    return () => {
      cancelled = true;
    };
  }, [
    activeTokenFastPath,
    demoMode,
    query,
    reloadNonce,
  ]);

  // Memoize non-date filters for matrix queries to prevent unnecessary runs and date filter leakage
  const nonDateFilters = useMemo(() => {
    const {
      city,
      hubName,
      tokenType,
      tokenTypeWithNrt,
      rmName,
      dcName,
      paymentType,
      leadStage,
      dealStatus,
      funnelStage,
      sheetFinalStatus,
      formFinalStatus,
      gmailPendencyStatus,
      confidenceTrend,
      onDemandStatus,
      taskBucket,
      derivedStatus,
      cancelReason,
      leadDsChannel,
      readyToDeliver,
      eddStatus,
      listingDaysBucket,
      searchQuery,
      minPaymentPercentage,
      c2dFilter,
    } = filters;

    // Use default/blank values for date filters to prevent date range filtration
    return normalizeFilterState({
      city,
      hubName,
      tokenType,
      tokenTypeWithNrt,
      rmName,
      dcName,
      paymentType,
      leadStage,
      dealStatus,
      funnelStage,
      sheetFinalStatus,
      formFinalStatus,
      gmailPendencyStatus,
      confidenceTrend,
      onDemandStatus,
      taskBucket,
      derivedStatus,
      cancelReason,
      leadDsChannel,
      readyToDeliver,
      eddStatus,
      listingDaysBucket,
      searchQuery,
      minPaymentPercentage,
      c2dFilter,
      dateField: 'All',
      startDate: '',
      endDate: '',
      filterBlankDates: false,
      dateFilters: [],
    });
  }, [
    filters.city,
    filters.hubName,
    filters.tokenType,
    filters.tokenTypeWithNrt,
    filters.rmName,
    filters.dcName,
    filters.paymentType,
    filters.leadStage,
    filters.dealStatus,
    filters.funnelStage,
    filters.sheetFinalStatus,
    filters.formFinalStatus,
    filters.gmailPendencyStatus,
    filters.confidenceTrend,
    filters.onDemandStatus,
    filters.taskBucket,
    filters.derivedStatus,
    filters.cancelReason,
    filters.leadDsChannel,
    filters.readyToDeliver,
    filters.eddStatus,
    filters.listingDaysBucket,
    filters.searchQuery,
    filters.minPaymentPercentage,
    filters.c2dFilter,
  ]);

  useEffect(() => {
    if (demoMode || activeTokenFastPath) {
      return;
    }

    let cancelled = false;

    if (activeTab !== 'ledger') {
      setMatrix(EMPTY_DASHBOARD_MATRIX);
      return;
    }

    const loadMatrix = async () => {
      setLoadingMatrix(true);
      try {
        const matrixResult = await getDashboardMatrixFromDb({ filters: nonDateFilters });
        if (!cancelled) {
          setMatrix(matrixResult);
        }
      } catch (err) {
        console.error('Failed to load dashboard matrix summary:', err);
      } finally {
        if (!cancelled) {
          setLoadingMatrix(false);
        }
      }
    };

    void loadMatrix();

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeTokenFastPath, demoMode, nonDateFilters, reloadNonce]);

  return {
    pageRows,
    setPageRows,
    activeTokenRows,
    summary,
    matrix,
    filterOptions,
    totalCount,
    loadingPage,
    loadingSummary,
    loadingMatrix,
    activeTokenFastPath,
    reload,
  };
}

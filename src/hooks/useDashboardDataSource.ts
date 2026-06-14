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
} from '../lib/dashboardQuery';
import {
  getActiveTokenCasesFromDb,
  getCasesPageFromDb,
  getDashboardFilterOptionsFromDb,
  getDashboardMatrixFromDb,
  getDashboardSummaryFromDb,
} from '../lib/supabaseDb';
import { buildDynamicFilterOptions, buildEddLabels, isRowMatchingFilter } from '../lib/dashboardFilters';
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
  return [...rows].sort((a, b) => {
    const valA = a[sortField as keyof CaseRow];
    const valB = b[sortField as keyof CaseRow];
    const fieldName = String(sortField).toLowerCase();
    const isDateField = fieldName.includes('date') || fieldName.includes('time') || fieldName.includes('timestamp');

    if (isDateField) {
      const dateA = valA ? parseDateString(String(valA)) : null;
      const dateB = valB ? parseDateString(String(valB)) : null;
      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;
      return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
    }

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

function buildFilteredCancelledC2dCount(rows: CaseRow[]): number {
  const groupedByCustomer = new Map<string, CaseRow[]>();

  rows.forEach(row => {
    const key = row.userId || row.uid || row.leadId;
    if (!key) return;
    const list = groupedByCustomer.get(key) || [];
    list.push(row);
    groupedByCustomer.set(key, list);
  });

  let total = 0;
  groupedByCustomer.forEach(customerRows => {
    const hasCancelled = customerRows.some(row => {
      const flags = getDerivedFlags(row);
      return flags.isCancelled;
    });
    const hasDelivered = customerRows.some(row => row.leadStage === 'DELIVERED');
    if (hasCancelled && hasDelivered) {
      total += customerRows.filter(row => {
        const flags = getDerivedFlags(row);
        return flags.isCancelled;
      }).length;
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
  const filtered = sourceRows.filter(row => isRowMatchingFilter(row, filters, eddLabels));
  const sorted = sortRows(filtered, sortField, sortDirection);
  const totalCount = sorted.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const pagedRows = sorted.slice(start, start + pageSize);
  const filteredCancelledC2dCount = buildFilteredCancelledC2dCount(sorted);

  return {
    pageRows: pagedRows,
    totalCount,
    summary: buildLocalDashboardSummary(sorted, filteredCancelledC2dCount),
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

  useEffect(() => {
    if (demoMode) {
      setFilterOptions(buildLocalFilterOptions(demoRows));
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
  }, [demoMode, refreshKey]);

  const reload = useCallback(() => {
    setReloadNonce(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (demoMode) {
      const local = buildLocalSnapshot(demoRows, filters, page, pageSize, sortField, sortDirection);
      setPageRows(local.pageRows);
      setTotalCount(local.totalCount);
      setSummary(local.summary);
      setMatrix(local.matrix);
      setFilterOptions(local.filterOptions);
      return;
    }

    if (activeTokenFastPath) {
      const local = buildLocalSnapshot(activeTokenRows, filters, page, pageSize, sortField, sortDirection);
      setPageRows(local.pageRows);
      setTotalCount(local.totalCount);
      setSummary(local.summary);
      setMatrix(local.matrix);
      setFilterOptions(buildLocalFilterOptions(activeTokenRows));
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
    activeTokenRows,
    demoMode,
    demoRows,
    filters,
    page,
    pageSize,
    query,
    reloadNonce,
    sortDirection,
    sortField,
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
        const matrixResult = await getDashboardMatrixFromDb({ filters: query.filters });
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
  }, [activeTab, activeTokenFastPath, demoMode, query.filters, reloadNonce]);

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

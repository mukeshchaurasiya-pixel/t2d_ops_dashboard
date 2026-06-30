import {
  CaseRow,
  CaseQuery,
  CasePageResult,
  DashboardCharts,
  DashboardFilterOptions,
  DashboardFilterQuery,
  DashboardKpis,
  DashboardMatrixResult,
  DashboardSummaryResult,
  FilterState,
  NormalizedDateFilter,
} from '../types';
import { buildCharts, buildKpis } from '../data/mockData';
import { calculateOperationsMatrix } from './matrixCalculator';

const EMPTY_KPIS: DashboardKpis = {
  totalCases: 0,
  activeTokens: 0,
  delivered: 0,
  cancelled: 0,
  bookingsWithTasks: 0,
  totalTaskInstances: 0,
  pmaxCases: 0,
  paymentPending: 0,
  totalCollected: 0,
  totalPending: 0,
  avgPaymentPercentage: 0,
};

const EMPTY_CHARTS: DashboardCharts = {
  leadStage: {},
  dealStatus: {},
  city: {},
  hub: {},
  rm: {},
  dc: {},
  readyToDeliver: {},
  onDemandStatusDistribution: {},
  totalExpectedAmountDistribution: {},
  tokenType: {},
  tokenTypeWithNrt: {},
  paymentType: {},
  funnelStage: {},
  taskBucket: {},
  cancellationReason: {},
  sheetFinalStatus: {},
  formFinalStatus: {},
  eddDistribution: {},
  leadDsChannel: {},
  listingDaysDistribution: {},
};

export const EMPTY_CASE_PAGE: CasePageResult = {
  rows: [],
  totalCount: 0,
  page: 1,
  pageSize: 15,
};

export const EMPTY_DASHBOARD_SUMMARY: DashboardSummaryResult = {
  kpis: EMPTY_KPIS,
  charts: EMPTY_CHARTS,
  filteredCancelledC2dCount: 0,
  filteredCancelledC2aCount: 0,
  filteredCancelledCr2dCount: 0,
};

export const EMPTY_DASHBOARD_MATRIX: DashboardMatrixResult = {
  columns: [],
  rows: [],
};

export const EMPTY_FILTER_OPTIONS: DashboardFilterOptions = {
  cities: [],
  hubs: [],
  hubsByCity: {},
  tokenTypes: [],
  tokenTypesWithNrt: [],
  rms: [],
  dcs: [],
  paymentTypes: [],
  leadStages: [],
  dealStatuses: [],
  funnelStages: [],
  sheetFinalStatuses: [],
  formFinalStatuses: [],
  gmailPendencyStatuses: [],
  onDemandStatuses: [],
  tasks: [],
  cancelReasons: [],
  leadDsChannels: [],
};

function parseMultiSelect(value: string | undefined): string[] | undefined {
  if (!value || value === 'All') return undefined;
  const parts = value
    .split('|||')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function normalizeDateFilters(dateFilters?: FilterState['dateFilters']): NormalizedDateFilter[] | undefined {
  if (!dateFilters || dateFilters.length === 0) return undefined;

  const normalized = dateFilters
    .filter(filter => filter.dateField !== 'All')
    .map(filter => ({
      field: filter.dateField,
      startDate: filter.startDate || undefined,
      endDate: filter.endDate || undefined,
      filterBlankDates: Boolean(filter.filterBlankDates),
    }))
    .filter(filter => filter.filterBlankDates || filter.startDate || filter.endDate);

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeFilterState(filters: FilterState): DashboardFilterQuery {
  const minPaymentPercentage = filters.minPaymentPercentage && filters.minPaymentPercentage !== 'All'
    ? Number(filters.minPaymentPercentage)
    : null;

  return {
    city: parseMultiSelect(filters.city),
    hubName: parseMultiSelect(filters.hubName),
    tokenType: parseMultiSelect(filters.tokenType),
    tokenTypeWithNrt: parseMultiSelect(filters.tokenTypeWithNrt),
    rmName: parseMultiSelect(filters.rmName),
    dcName: parseMultiSelect(filters.dcName),
    paymentType: parseMultiSelect(filters.paymentType),
    leadStage: parseMultiSelect(filters.leadStage),
    dealStatus: parseMultiSelect(filters.dealStatus),
    funnelStage: parseMultiSelect(filters.funnelStage),
    sheetFinalStatus: parseMultiSelect(filters.sheetFinalStatus),
    formFinalStatus: parseMultiSelect(filters.formFinalStatus),
    gmailPendencyStatus: parseMultiSelect(filters.gmailPendencyStatus),
    confidenceTrend: parseMultiSelect(filters.confidenceTrend),
    onDemandStatus: parseMultiSelect(filters.onDemandStatus),
    taskBucket: parseMultiSelect(filters.taskBucket),
    derivedStatus: parseMultiSelect(filters.derivedStatus),
    cancelReason: parseMultiSelect(filters.cancelReason),
    leadDsChannel: parseMultiSelect(filters.leadDsChannel),
    readyToDeliver: parseMultiSelect(filters.readyToDeliver),
    eddStatus: filters.eddStatus && filters.eddStatus !== 'All' ? filters.eddStatus : null,
    listingDaysBucket: filters.listingDaysBucket && filters.listingDaysBucket !== 'All' ? filters.listingDaysBucket : null,
    searchQuery: filters.searchQuery.trim() || null,
    dateField: filters.dateField !== 'All' ? filters.dateField : null,
    startDate: filters.startDate || null,
    endDate: filters.endDate || null,
    filterBlankDates: Boolean(filters.filterBlankDates),
    dateFilters: normalizeDateFilters(filters.dateFilters),
    minPaymentPercentage: Number.isFinite(minPaymentPercentage) ? minPaymentPercentage : null,
    c2dFilter: filters.c2dFilter && filters.c2dFilter !== 'All' ? filters.c2dFilter : null,
  };
}

export function createCaseQuery(
  filters: FilterState,
  page: number,
  pageSize: number,
  sortField: keyof CaseRow | string,
  sortDirection: 'asc' | 'desc'
): CaseQuery {
  return {
    page,
    pageSize,
    sortField,
    sortDirection,
    filters: normalizeFilterState(filters),
  };
}

export function isActiveTokenFastPath(filters: DashboardFilterQuery): boolean {
  return Boolean(
    filters.leadStage &&
    filters.leadStage.length === 1 &&
    filters.leadStage[0] === 'ACTIVE_TOKEN' &&
    (!filters.confidenceTrend || filters.confidenceTrend.length === 0)
  );
}

export function buildLocalDashboardSummary(
  rows: CaseRow[],
  filteredCancelledC2dCount: number,
  filteredCancelledC2aCount: number = 0,
  filteredCancelledCr2dCount: number = 0
): DashboardSummaryResult {
  return {
    kpis: buildKpis(rows),
    charts: buildCharts(rows),
    filteredCancelledC2dCount,
    filteredCancelledC2aCount,
    filteredCancelledCr2dCount,
  };
}

export function buildLocalDashboardMatrix(rows: CaseRow[], filters?: FilterState): DashboardMatrixResult {
  return calculateOperationsMatrix(rows, filters);
}

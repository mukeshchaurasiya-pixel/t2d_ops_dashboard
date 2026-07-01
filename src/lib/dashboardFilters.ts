import { CaseRow, DateFilter, FilterState } from '../types';
import { getDerivedFlags, splitTasks } from '../data/mockData';
import { parseDateString } from './dateUtils';

export const DEFAULT_FILTERS: FilterState = {
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
  confidenceTrend: 'All',
  onDemandStatus: 'All',
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
  dateFilters: [{ id: 'initial', dateField: 'All', startDate: '', endDate: '', filterBlankDates: false }],
  minPaymentPercentage: 'All',
  listingDaysBucket: 'All',
  c2dFilter: 'All',
};

export const MILESTONE_STAGES = [
  'Lead Created',
  'Case Logged In',
  'Credit Assessed',
  'Diligence Assessed',
  'T&C Accepted',
  'FCU Checked',
  'Submitted To Ops',
  'Finance Disbursed',
];

const DATE_MAP: Record<string, keyof CaseRow> = {
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
  tokenAutoCancellationExtendedDate: 'tokenAutoCancellationExtendedDate',
};

type EddLabels = {
  today: Date;
  labelToday: string;
  labelD1: string;
  labelD2: string;
  labelD3_6: string;
  labelD7Plus: string;
};

function getOrdinalSuffix(day: number) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatDateWithSuffix(date: Date) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  return `${day}${getOrdinalSuffix(day)} ${month}`;
}

function addDays(date: Date, count: number) {
  const nextDate = new Date(date.getTime());
  nextDate.setDate(nextDate.getDate() + count);
  return nextDate;
}

function formatRange(start: Date, end: Date) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = months[start.getMonth()];
  const endMonth = months[end.getMonth()];

  if (startMonth === endMonth) {
    return `${startDay}${getOrdinalSuffix(startDay)} to ${endDay}${getOrdinalSuffix(endDay)} ${startMonth}`;
  }

  return `${startDay}${getOrdinalSuffix(startDay)} ${startMonth} to ${endDay}${getOrdinalSuffix(endDay)} ${endMonth}`;
}

function getMilestoneStatus(row: CaseRow, milestone: string): boolean {
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
}

function matchMulti(filterValue: string, rowValue: unknown) {
  if (filterValue === 'All') return true;
  if (filterValue === '') return false;
  if (!filterValue) return true;

  const selected = filterValue.split('|||').map(value => value.trim().toLowerCase());
  const rowString = String(rowValue || '').trim().toLowerCase();

  if (selected.includes('blank') && rowString === '') {
    return true;
  }

  return selected.includes(rowString);
}

export function getNormalizedFieldTimestamp(row: CaseRow, dateField: string): Date | null {
  const value = row[dateField as keyof CaseRow];
  const strVal = String(value || '').trim();

  let correspondingDateField = '';
  if (dateField.endsWith('DateTime')) {
    correspondingDateField = dateField.replace('DateTime', 'Date');
  } else if (dateField.endsWith('Time')) {
    correspondingDateField = dateField.replace('Time', 'Date');
  }

  if (!strVal) {
    if (correspondingDateField) {
      const dateVal = row[correspondingDateField as keyof CaseRow];
      const dateStr = String(dateVal || '').trim();
      return dateStr ? parseDateString(dateStr) : null;
    }
    return null;
  }

  const hasDate = strVal.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/) || strVal.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/);
  if (hasDate) {
    return parseDateString(strVal);
  }

  if (correspondingDateField) {
    const dateVal = row[correspondingDateField as keyof CaseRow];
    const dateStr = String(dateVal || '').trim();
    if (dateStr) {
      return parseDateString(`${dateStr} ${strVal}`);
    }
  }

  return parseDateString(strVal);
}

export function getExpectedDeliveryTimeTimestamp(row: CaseRow): Date | null {
  return getNormalizedFieldTimestamp(row, 'expectedDeliveryTime');
}

function matchesDateFilter(rawValue: unknown, dateFilter: Pick<DateFilter, 'startDate' | 'endDate' | 'filterBlankDates'>) {
  const rowDate = rawValue instanceof Date ? rawValue : (rawValue ? parseDateString(String(rawValue)) : null);

  if (dateFilter.filterBlankDates) {
    return !rowDate;
  }

  if (!rowDate) return false;

  if (dateFilter.startDate) {
    const start = parseDateString(dateFilter.startDate);
    if (start) {
      start.setHours(0, 0, 0, 0);
      if (rowDate < start) return false;
    }
  }

  if (dateFilter.endDate) {
    const end = parseDateString(dateFilter.endDate);
    if (end) {
      end.setHours(23, 59, 59, 999);
      if (rowDate > end) return false;
    }
  }

  return true;
}

export function buildEddLabels(): EddLabels {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    today,
    labelToday: formatDateWithSuffix(today),
    labelD1: formatDateWithSuffix(addDays(today, 1)),
    labelD2: formatDateWithSuffix(addDays(today, 2)),
    labelD3_6: formatRange(addDays(today, 3), addDays(today, 6)),
    labelD7Plus: `${formatDateWithSuffix(addDays(today, 7))} +`,
  };
}

const confidenceTrendCache = new WeakMap<any, 'Decline' | 'Stable' | 'Improving'>();

export function getConfidenceTrendStatus(row: CaseRow): 'Decline' | 'Stable' | 'Improving' {
  const cached = confidenceTrendCache.get(row);
  if (cached) return cached;

  if (row.confidenceTrendStatus) {
    confidenceTrendCache.set(row, row.confidenceTrendStatus);
    return row.confidenceTrendStatus;
  }
  const score = parseFloat(row.confidenceScore || '0');
  if (isNaN(score) || score <= 0) {
    confidenceTrendCache.set(row, 'Stable');
    return 'Stable';
  }

  // Deterministic fallback based on bookingId
  const hashStr = row.bookingId || '';
  let hash = 0;
  for (let i = 0; i < hashStr.length; i++) {
    hash = (hash << 5) - hash + hashStr.charCodeAt(i);
    hash |= 0;
  }
  const mod = Math.abs(hash) % 3;
  let status: 'Decline' | 'Stable' | 'Improving' = 'Stable';
  if (mod === 0) status = 'Stable';
  else if (mod === 1) status = 'Improving';
  else status = 'Decline';

  confidenceTrendCache.set(row, status);
  return status;
}

export interface C2DStats {
  c2dBookingIds: Set<string>;
  c2aBookingIds: Set<string>;
  cr2dBookingIds: Set<string>;
}

export function buildC2DStats(rows: CaseRow[]): C2DStats {
  const c2dBookingIds = new Set<string>();
  const c2aBookingIds = new Set<string>();
  const cr2dBookingIds = new Set<string>();

  const grouped: Record<string, CaseRow[]> = {};
  rows.forEach(row => {
    const id = row.userId;
    if (!id) return;
    const key = id.trim();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => {
      const ta = a.tokenDate ? (parseDateString(a.tokenDate)?.getTime() || 0) : 0;
      const tb = b.tokenDate ? (parseDateString(b.tokenDate)?.getTime() || 0) : 0;
      return ta - tb;
    });
  });

  rows.forEach(row => {
    if (row.isC2D) c2dBookingIds.add(row.bookingId);
    if (row.isC2A) c2aBookingIds.add(row.bookingId);
    if (row.isCR2D) cr2dBookingIds.add(row.bookingId);

    const flags = getDerivedFlags(row);
    const customerId = row.userId;

    if (row.leadStage === 'DELIVERED' && Boolean(row.cancelReason)) {
      cr2dBookingIds.add(row.bookingId);
    }

    if (flags.isCancelled && customerId) {
      const key = customerId.trim();
      const customerRows = grouped[key] || [];
      const cancelledTime = row.tokenDate ? (parseDateString(row.tokenDate)?.getTime() || 0) : 0;

      const matchingDelivereds = customerRows.filter(r => {
        if (r.leadStage === 'DELIVERED') {
          const delDateStr = r.actualDeliveryDate || r.tokenDate;
          const deliveredTime = delDateStr ? (parseDateString(delDateStr)?.getTime() || 0) : 0;
          return deliveredTime >= cancelledTime;
        }
        return false;
      });

      if (matchingDelivereds.length > 0) {
        c2dBookingIds.add(row.bookingId);
        matchingDelivereds.forEach(del => {
          c2dBookingIds.add(del.bookingId);
        });
      }

      const index = customerRows.findIndex(b => b.bookingId === row.bookingId);
      if (index !== -1) {
        let prevTime = 0;
        if (index > 0) {
          const prevBooking = customerRows[index - 1];
          prevTime = prevBooking.tokenDate ? (parseDateString(prevBooking.tokenDate)?.getTime() || 0) : 0;
        }

        const matchingActives = customerRows.filter(r => {
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

        if (matchingActives.length > 0) {
          c2aBookingIds.add(row.bookingId);
          matchingActives.forEach(act => {
            c2aBookingIds.add(act.bookingId);
          });
        }
      }
    }
  });

  return { c2dBookingIds, c2aBookingIds, cr2dBookingIds };
}

export function isRowMatchingFilter(
  row: CaseRow,
  filters: FilterState,
  eddLabels: EddLabels,
  ignoreKey?: string,
  c2dStats?: C2DStats
) {
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    return (
      String(row.bookingId || '').toLowerCase().includes(query) ||
      String(row.carRegNo || '').toLowerCase().includes(query) ||
      String(row.userId || '').toLowerCase().includes(query) ||
      String(row.make || '').toLowerCase().includes(query) ||
      String(row.model || '').toLowerCase().includes(query) ||
      String(row.appointmentId || '').toLowerCase().includes(query)
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
    const selectedStages = filters.funnelStage.split('|||').map(value => value.trim());
    const rowMatchesFunnel = selectedStages.some(stage => {
      if (MILESTONE_STAGES.includes(stage)) {
        return getMilestoneStatus(row, stage);
      }
      return String(row.funnelStage || '').toLowerCase() === stage.toLowerCase();
    });

    if (!rowMatchesFunnel) return false;
  }

  if (filters.minPaymentPercentage && filters.minPaymentPercentage !== 'All') {
    const thresholdPercent = parseFloat(filters.minPaymentPercentage);
    if (!Number.isNaN(thresholdPercent)) {
      const rowPercent = Number(row.paymentPercentage || 0);
      const normalizedRowPercent = rowPercent > 1 ? rowPercent / 100 : rowPercent;
      if (normalizedRowPercent < thresholdPercent / 100) return false;
    }
  }

  if (ignoreKey !== 'sheetFinalStatus' && !matchMulti(filters.sheetFinalStatus, row.sheetFinalStatus)) return false;
  if (ignoreKey !== 'formFinalStatus' && !matchMulti(filters.formFinalStatus, row.formFinalStatus)) return false;
  if (ignoreKey !== 'gmailPendencyStatus' && !matchMulti(filters.gmailPendencyStatus, row.gmailPendencyStatus)) return false;
  if (ignoreKey !== 'confidenceTrend' && !matchMulti(filters.confidenceTrend, getConfidenceTrendStatus(row))) return false;
  if (ignoreKey !== 'onDemandStatus' && !matchMulti(filters.onDemandStatus, row.onDemandStatus)) return false;

  if (ignoreKey !== 'listingDaysBucket' && filters.listingDaysBucket && filters.listingDaysBucket !== 'All') {
    const days = Number(row.totalListingDays || 0);
    if (filters.listingDaysBucket === '0-7' && !(days >= 0 && days <= 7)) return false;
    if (filters.listingDaysBucket === '7-15' && !(days > 7 && days <= 15)) return false;
    if (filters.listingDaysBucket === '15-30' && !(days > 15 && days <= 30)) return false;
    if (filters.listingDaysBucket === '30-60' && !(days > 30 && days <= 60)) return false;
    if (filters.listingDaysBucket === '60+' && !(days > 60)) return false;
  }

  if (ignoreKey !== 'taskBucket' && filters.taskBucket !== 'All') {
    const selectedTasks = filters.taskBucket.split('|||').map(value => value.trim().toLowerCase());
    const rowTasks = splitTasks(row.taskBucket || '').map(value => value.trim().toLowerCase());
    const matchesBlank = selectedTasks.includes('blank') && rowTasks.length === 0;
    const matchesAnyTask = selectedTasks.some(task => rowTasks.includes(task));
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

  if (ignoreKey !== 'dateRange' && filters.dateField !== 'All') {
    const rawValue = getNormalizedFieldTimestamp(row, filters.dateField);
    if (!matchesDateFilter(rawValue, filters)) {
      return false;
    }
  }

  if (ignoreKey !== 'dateRange' && filters.dateFilters && filters.dateFilters.length > 0) {
    for (const dateFilter of filters.dateFilters) {
      if (dateFilter.dateField === 'All') continue;
      const rawValue = getNormalizedFieldTimestamp(row, dateFilter.dateField);
      if (!matchesDateFilter(rawValue, dateFilter)) {
        return false;
      }
    }
  }

  if (ignoreKey !== 'eddStatus' && filters.eddStatus && filters.eddStatus !== 'All') {
    let rowBucket = 'Blank / Empty';

    const edd = getExpectedDeliveryTimeTimestamp(row);
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

    if (rowBucket !== filters.eddStatus) return false;
  }

  if (ignoreKey !== 'cancelReason' && !matchMulti(filters.cancelReason || 'All', row.cancelReason)) return false;
  if (ignoreKey !== 'leadDsChannel' && !matchMulti(filters.leadDsChannel || 'All', row.leadDsChannel)) return false;

  if (ignoreKey !== 'readyToDeliver' && filters.readyToDeliver && filters.readyToDeliver !== 'All') {
    const readyToDeliverValue = (row.readyToDeliver || '').trim();
    if (filters.readyToDeliver === 'Blank') {
      if (readyToDeliverValue !== '') return false;
    } else if (readyToDeliverValue.toLowerCase() !== filters.readyToDeliver.toLowerCase()) {
      return false;
    }
  }

  if (ignoreKey !== 'c2dFilter' && filters.c2dFilter && filters.c2dFilter !== 'All') {
    if (!c2dStats) {
      return false;
    }
    if (filters.c2dFilter === 'C2D' && !c2dStats.c2dBookingIds.has(row.bookingId)) {
      return false;
    }
    if (filters.c2dFilter === 'C2A' && !c2dStats.c2aBookingIds.has(row.bookingId)) {
      return false;
    }
    if (filters.c2dFilter === 'CR2D' && !c2dStats.cr2dBookingIds.has(row.bookingId)) {
      return false;
    }
  }

  return true;
}

export function buildDynamicFilterOptions(rows: CaseRow[]) {
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
  const onDemandStatusSet = new Set<string>();
  const tasksSet = new Set<string>();
  const derivedSet = new Set<string>();
  const cancelReasonsSet = new Set<string>();
  const leadDsChannelsSet = new Set<string>();

  rows.forEach(row => {
    if (row.city) citiesSet.add(row.city.trim());
    if (row.tokenType) tokenTypeSet.add(row.tokenType);
    if (row.allocatedRm) rmSet.add(row.allocatedRm);
    if (row.assignedDc) dcSet.add(row.assignedDc);
    if (row.paymentType) paymentSet.add(row.paymentType);
    if (row.leadStage) stagesSet.add(row.leadStage);
    if (row.funnelStage) funnelSet.add(row.funnelStage);
    if (row.sheetFinalStatus) sheetFinalSet.add(row.sheetFinalStatus);
    if (row.formFinalStatus) formFinalSet.add(row.formFinalStatus);
    if (row.gmailPendencyStatus) gmailPendencySet.add(row.gmailPendencyStatus);
    if (row.onDemandStatus) onDemandStatusSet.add(row.onDemandStatus);
    if (row.cancelReason) cancelReasonsSet.add(row.cancelReason);
    if (row.leadDsChannel) leadDsChannelsSet.add(row.leadDsChannel.trim());
    if (row.taskBucket) {
      splitTasks(row.taskBucket).forEach(task => {
        if (task.trim()) tasksSet.add(task.trim());
      });
    }

    const flags = getDerivedFlags(row);
    if (flags.isAlertCase) derivedSet.add('Alert Cases');
    if (flags.isEddMissing) derivedSet.add('EDD Missing');
    if (flags.isEddBreached) derivedSet.add('EDD Breached');
    if (flags.isPmaxStuck) derivedSet.add('PMax Stuck');
    if (flags.isCustomerConnectPending) derivedSet.add('Customer Connect Pending');
    if (flags.isHighPaymentPendingDelivery) derivedSet.add('High Payment Pending Delivery');
    if (flags.isCancelledAfterPayment) derivedSet.add('Cancelled After Payment');
    if (flags.isOdPending) derivedSet.add('OD Pending');
    if (flags.isBlankPaymentType) derivedSet.add('Blank Payment Type');
    if (flags.isPaymentPending) derivedSet.add('Payment Pending');
    if (row.taskBucket) {
      derivedSet.add('Any Active Task');
      splitTasks(row.taskBucket).forEach(task => {
        if (task.trim()) derivedSet.add(task.trim());
      });
    }
  });

  const coreOrder = [
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

  const sortedDerived = Array.from(derivedSet).sort((left, right) => {
    const leftIndex = coreOrder.indexOf(left);
    const rightIndex = coreOrder.indexOf(right);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.localeCompare(right);
  });

  return {
    cities: Array.from(citiesSet).sort(),
    tokenTypes: Array.from(tokenTypeSet).sort(),
    rms: Array.from(rmSet).sort(),
    dcs: Array.from(dcSet).sort(),
    paymentTypes: Array.from(paymentSet).sort(),
    leadStages: Array.from(stagesSet).sort(),
    funnelStages: [
      ...MILESTONE_STAGES,
      ...Array.from(funnelSet).filter(stage => !MILESTONE_STAGES.includes(stage)).sort(),
    ],
    sheetFinalStatuses: Array.from(sheetFinalSet).sort(),
    formFinalStatuses: Array.from(formFinalSet).sort(),
    gmailPendencyStatuses: Array.from(gmailPendencySet).sort(),
    onDemandStatuses: Array.from(onDemandStatusSet).sort(),
    tasks: Array.from(tasksSet).sort(),
    derivedOptions: sortedDerived,
    cancelReasons: Array.from(cancelReasonsSet).sort(),
    leadDsChannels: Array.from(leadDsChannelsSet).sort(),
  };
}

export function getCityFilteredHubs(rows: CaseRow[], cityFilter: string) {
  const selectedCities = cityFilter === 'All'
    ? null
    : cityFilter.split('|||').map(value => value.trim().toLowerCase());

  const hubsSet = new Set<string>();
  rows.forEach(row => {
    if (!row.hubName) return;
    if (selectedCities === null) {
      hubsSet.add(row.hubName.trim());
      return;
    }

    const rowCity = String(row.city || '').trim().toLowerCase();
    if (selectedCities.includes(rowCity)) {
      hubsSet.add(row.hubName.trim());
    }
  });

  return Array.from(hubsSet).sort();
}

export function createDerivedLabels(tasks: string[]) {
  const labels: Record<string, string> = {
    'Any Active Task': 'Any Active Task / Pending Item',
  };

  tasks.forEach(task => {
    labels[task] = `Task: ${task}`;
  });

  return labels;
}

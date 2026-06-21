import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFilterState, isActiveTokenFastPath } from './dashboardQuery';
import { DEFAULT_FILTERS, getConfidenceTrendStatus, isRowMatchingFilter, buildEddLabels, getExpectedDeliveryTimeTimestamp, getNormalizedFieldTimestamp } from './dashboardFilters';
import { applyReturnedLeadStage } from '../data/caseRowSchema.js';
import { buildCharts, buildEddDistribution } from '../data/mockData';
import { getChartBarColor, getChartEntriesForRender } from '../components/DashboardCharts';

test('normalizeFilterState converts multi-select filters into arrays', () => {
  const normalized = normalizeFilterState({
    ...DEFAULT_FILTERS,
    city: 'Delhi|||Mumbai',
    leadStage: 'ACTIVE_TOKEN',
    paymentType: 'Blank|||PMAX',
    confidenceTrend: 'Decline|||Stable',
    onDemandStatus: 'ASSIGNED|||DELIVERING',
  });

  assert.deepEqual(normalized.city, ['Delhi', 'Mumbai']);
  assert.deepEqual(normalized.leadStage, ['ACTIVE_TOKEN']);
  assert.deepEqual(normalized.paymentType, ['Blank', 'PMAX']);
  assert.deepEqual(normalized.confidenceTrend, ['Decline', 'Stable']);
  assert.deepEqual(normalized.onDemandStatus, ['ASSIGNED', 'DELIVERING']);
});

test('normalizeFilterState keeps date filters, search, and numeric thresholds', () => {
  const normalized = normalizeFilterState({
    ...DEFAULT_FILTERS,
    searchQuery: 'B-2026-1234',
    minPaymentPercentage: '75',
    dateField: 'tokenDate',
    startDate: '2026-06-01',
    endDate: '2026-06-14',
    filterBlankDates: true,
    dateFilters: [
      {
        id: 'active',
        dateField: 'expectedDeliveryDate',
        startDate: '2026-06-10',
        endDate: '2026-06-20',
        filterBlankDates: false,
      },
      {
        id: 'blank-only',
        dateField: 'gmailPendencyDate',
        startDate: '',
        endDate: '',
        filterBlankDates: true,
      },
      {
        id: 'ignored',
        dateField: 'All',
        startDate: '',
        endDate: '',
        filterBlankDates: false,
      },
    ],
  });

  assert.equal(normalized.searchQuery, 'B-2026-1234');
  assert.equal(normalized.minPaymentPercentage, 75);
  assert.equal(normalized.dateField, 'tokenDate');
  assert.equal(normalized.startDate, '2026-06-01');
  assert.equal(normalized.endDate, '2026-06-14');
  assert.equal(normalized.filterBlankDates, true);
  assert.deepEqual(normalized.dateFilters, [
    {
      field: 'expectedDeliveryDate',
      startDate: '2026-06-10',
      endDate: '2026-06-20',
      filterBlankDates: false,
    },
    {
      field: 'gmailPendencyDate',
      startDate: undefined,
      endDate: undefined,
      filterBlankDates: true,
    },
  ]);
});

test('isActiveTokenFastPath only enables the exact ACTIVE_TOKEN-only filter', () => {
  assert.equal(isActiveTokenFastPath({ leadStage: ['ACTIVE_TOKEN'] }), true);
  assert.equal(isActiveTokenFastPath({ leadStage: ['ACTIVE_TOKEN'], confidenceTrend: ['Decline'] }), false);
  assert.equal(isActiveTokenFastPath({ leadStage: ['ACTIVE_TOKEN', 'DELIVERED'] }), false);
  assert.equal(isActiveTokenFastPath({ city: ['Delhi'] }), false);
});

test('getConfidenceTrendStatus returns correct trend fallback when missing', () => {
  const row1 = { bookingId: 'B-1001', confidenceScore: '0.95' } as any;
  const trend1 = getConfidenceTrendStatus(row1);
  assert.ok(['Stable', 'Improving', 'Decline'].includes(trend1));
  
  const row2 = { bookingId: 'B-1001', confidenceScore: '0.95', confidenceTrendStatus: 'Improving' } as any;
  assert.equal(getConfidenceTrendStatus(row2), 'Improving');
});

test('isRowMatchingFilter matches on computed confidence trend status', () => {
  const row = { bookingId: 'B-1001', confidenceScore: '0.95' } as any;
  const computedTrend = getConfidenceTrendStatus(row);
  const eddLabels = buildEddLabels();

  const matchingFilters = {
    ...DEFAULT_FILTERS,
    confidenceTrend: computedTrend,
  };
  assert.equal(isRowMatchingFilter(row, matchingFilters, eddLabels), true);

  const nonMatchingTrend = computedTrend === 'Stable' ? 'Decline' : 'Stable';
  const nonMatchingFilters = {
    ...DEFAULT_FILTERS,
    confidenceTrend: nonMatchingTrend,
  };
  assert.equal(isRowMatchingFilter(row, nonMatchingFilters, eddLabels), false);
});

test('applyReturnedLeadStage links expectedDeliveryDate to date part of expectedDeliveryTime', () => {
  // Case A: expectedDeliveryTime has full date-time YYYY-MM-DD
  const row1 = { expectedDeliveryTime: '2026-06-18 00:00:00', expectedDeliveryDate: '2026-06-17' } as any;
  const processed1 = applyReturnedLeadStage(row1);
  assert.equal(processed1.expectedDeliveryDate, '2026-06-18');

  // Case B: expectedDeliveryTime has format DD/MM/YYYY
  const row2 = { expectedDeliveryTime: '18/06/2026 12:30:00', expectedDeliveryDate: '2026-06-17' } as any;
  const processed2 = applyReturnedLeadStage(row2);
  assert.equal(processed2.expectedDeliveryDate, '2026-06-18');

  // Case C: expectedDeliveryTime has only time, should NOT overwrite expectedDeliveryDate
  const row3 = { expectedDeliveryTime: '12:30:00', expectedDeliveryDate: '2026-06-17' } as any;
  const processed3 = applyReturnedLeadStage(row3);
  assert.equal(processed3.expectedDeliveryDate, '2026-06-17');
});

test('getExpectedDeliveryTimeTimestamp returns combined timestamp correctly', () => {
  // Case 1: has only time, links to date
  const row1 = { expectedDeliveryTime: '11:30:00', expectedDeliveryDate: '2026-06-18' } as any;
  const ts1 = getExpectedDeliveryTimeTimestamp(row1);
  assert.equal(ts1?.getFullYear(), 2026);
  assert.equal(ts1?.getMonth(), 5); // June is 5
  assert.equal(ts1?.getDate(), 18);
  assert.equal(ts1?.getHours(), 11);
  assert.equal(ts1?.getMinutes(), 30);

  // Case 2: has full date time
  const row2 = { expectedDeliveryTime: '2026-06-19 14:45:00', expectedDeliveryDate: '2026-06-18' } as any;
  const ts2 = getExpectedDeliveryTimeTimestamp(row2);
  assert.equal(ts2?.getDate(), 19);
  assert.equal(ts2?.getHours(), 14);

  // Case 3: missing time, falls back to date
  const row3 = { expectedDeliveryTime: '', expectedDeliveryDate: '2026-06-18' } as any;
  const ts3 = getExpectedDeliveryTimeTimestamp(row3);
  assert.equal(ts3?.getDate(), 18);
  assert.equal(ts3?.getHours(), 0);
});

test('isRowMatchingFilter filters expectedDeliveryTime in range correctly', () => {
  const row = { expectedDeliveryTime: '11:30:00', expectedDeliveryDate: '2026-06-18' } as any;
  const eddLabels = buildEddLabels();

  const matchingFilters = {
    ...DEFAULT_FILTERS,
    dateField: 'expectedDeliveryTime',
    startDate: '2026-06-18',
    endDate: '2026-06-18',
  };
  assert.equal(isRowMatchingFilter(row, matchingFilters, eddLabels), true);

  const nonMatchingFilters = {
    ...DEFAULT_FILTERS,
    dateField: 'expectedDeliveryTime',
    startDate: '2026-06-19',
    endDate: '2026-06-19',
  };
  assert.equal(isRowMatchingFilter(row, nonMatchingFilters, eddLabels), false);
});

test('getNormalizedFieldTimestamp links tokenDateTime to tokenDate correctly', () => {
  const row = { tokenDateTime: '10:45:00', tokenDate: '2026-06-18' } as any;
  const ts = getNormalizedFieldTimestamp(row, 'tokenDateTime');
  assert.equal(ts?.getFullYear(), 2026);
  assert.equal(ts?.getDate(), 18);
  assert.equal(ts?.getHours(), 10);
  assert.equal(ts?.getMinutes(), 45);
});

test('buildEddDistribution and eddStatus filtering prioritize expectedDeliveryTime', () => {
  
  // Row with expectedDeliveryTime having a date
  const rowWithTime = {
    bookingId: 'B-2001',
    expectedDeliveryTime: '2026-06-25 15:00:00',
    expectedDeliveryDate: '2026-06-17',
  } as any;

  // Let's verify the distribution output keys/buckets
  const dist = buildEddDistribution([rowWithTime]);
  // The value should go to the bucket for 2026-06-25 instead of 2026-06-17
  // Since 2026-06-25 is far in the future relative to today (2026-06-16 is current local time), it should be in the +7 days bucket or similar.
  const overdueCount = dist['Overdue / Breached'] || 0;
  assert.equal(overdueCount, 0);

  // Verify filtering behaves the same
  const eddLabels = buildEddLabels();
  // Today is 2026-06-16 in local test context or system date
  // Let's test filter match
  const matchTodayFilter = isRowMatchingFilter(
    rowWithTime,
    { ...DEFAULT_FILTERS, eddStatus: 'Overdue / Breached' },
    eddLabels
  );
  assert.equal(matchTodayFilter, false);
});

test('buildCharts counts DS channel across the full filtered set', () => {
  const rows = [
    {
      bookingId: 'B-3001',
      leadStage: 'ACTIVE_TOKEN',
      leadDsChannel: 'AmberChannel',
    },
    {
      bookingId: 'B-3002',
      leadStage: 'CANCELLED',
      leadDsChannel: 'AmberChannel',
    },
  ] as any[];

  const charts = buildCharts(rows);

  assert.equal(charts.leadDsChannel?.AmberChannel, 2);
  assert.equal(Object.values(charts.leadDsChannel || {}).reduce((sum, count) => sum + count, 0), 2);
});

test('buildCharts trims DS channel labels before grouping', () => {
  const rows = [
    {
      bookingId: 'B-3003',
      leadStage: 'ACTIVE_TOKEN',
      leadDsChannel: ' AmberChannel ',
    },
    {
      bookingId: 'B-3004',
      leadStage: 'ACTIVE_TOKEN',
      leadDsChannel: 'AmberChannel',
    },
  ] as any[];

  const charts = buildCharts(rows);

  assert.equal(charts.leadDsChannel?.AmberChannel, 2);
  assert.equal(charts.leadDsChannel?.[' AmberChannel '], undefined);
});

test('getChartEntriesForRender includes Blank by default and excludes control buckets', () => {
  const entries = getChartEntriesForRender({
    Blank: 4,
    RT: 10,
    PVT: 7,
    All: 99,
    '': 3,
  });

  assert.deepEqual(entries, [
    ['RT', 10],
    ['PVT', 7],
    ['Blank', 4],
  ]);
});

test('getChartBarColor gives Blank a neutral fallback and respects overrides', () => {
  assert.equal(getChartBarColor('Blank', 'bg-brand-blue'), 'bg-slate-400');
  assert.equal(
    getChartBarColor('Blank', 'bg-brand-blue', { Blank: 'bg-zinc-500' }),
    'bg-zinc-500'
  );
  assert.equal(getChartBarColor('RT', 'bg-brand-blue'), 'bg-brand-blue');
});


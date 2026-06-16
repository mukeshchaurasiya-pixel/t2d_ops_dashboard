import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFilterState, isActiveTokenFastPath } from './dashboardQuery';
import { DEFAULT_FILTERS, getConfidenceTrendStatus, isRowMatchingFilter, buildEddLabels } from './dashboardFilters';
import { applyReturnedLeadStage } from '../data/caseRowSchema.js';

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

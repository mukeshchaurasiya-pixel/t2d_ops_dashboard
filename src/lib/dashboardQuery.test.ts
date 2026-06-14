import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFilterState, isActiveTokenFastPath } from './dashboardQuery';
import { DEFAULT_FILTERS } from './dashboardFilters';

test('normalizeFilterState converts multi-select filters into arrays', () => {
  const normalized = normalizeFilterState({
    ...DEFAULT_FILTERS,
    city: 'Delhi|||Mumbai',
    leadStage: 'ACTIVE_TOKEN',
    paymentType: 'Blank|||PMAX',
    onDemandStatus: 'ASSIGNED|||DELIVERING',
  });

  assert.deepEqual(normalized.city, ['Delhi', 'Mumbai']);
  assert.deepEqual(normalized.leadStage, ['ACTIVE_TOKEN']);
  assert.deepEqual(normalized.paymentType, ['Blank', 'PMAX']);
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
  assert.equal(isActiveTokenFastPath({ leadStage: ['ACTIVE_TOKEN', 'DELIVERED'] }), false);
  assert.equal(isActiveTokenFastPath({ city: ['Delhi'] }), false);
});

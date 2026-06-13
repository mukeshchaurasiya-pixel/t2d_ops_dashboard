/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { CaseRow } from '../types';

/**
 * Fetches all cases cached in the Supabase PostgreSQL table.
 */
export async function getCasesFromDb(): Promise<CaseRow[]> {
  const allCases: CaseRow[] = [];
  let start = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('dashboard_cases')
      .select('row_data')
      .order('updated_at', { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) {
      console.error('Failed to fetch cases from Supabase DB:', error.message);
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allCases.push(...data.map((r: any) => r.row_data as CaseRow));
      start += pageSize;
      if (data.length < pageSize) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allCases;
}

/**
 * Batch upserts case rows from Google Sheet into the Supabase table.
 */
export async function upsertCasesToDb(rows: CaseRow[]): Promise<void> {
  if (rows.length === 0) return;

  // Deduplicate by bookingId to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time" postgres error
  const uniqueRowsMap = new Map<string, CaseRow>();
  rows.forEach(row => {
    if (row.bookingId) {
      uniqueRowsMap.set(row.bookingId, row);
    }
  });
  const uniqueRows = Array.from(uniqueRowsMap.values());

  const payload = uniqueRows.map(row => ({
    booking_id: row.bookingId,
    row_data: row,
    updated_at: new Date().toISOString()
  }));

  // Perform bulk upsert in chunks to avoid URL size or payload limitations if the dataset is huge
  const chunkSize = 200;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('dashboard_cases')
      .upsert(chunk, { onConflict: 'booking_id' });

    if (error) {
      console.error('Failed to bulk upsert cases into Supabase DB:', error.message);
      throw new Error(error.message);
    }
  }
}

/**
 * Updates a single case record in the Supabase table.
 */
export async function updateSingleCaseInDb(
  bookingId: string,
  updatedRow: CaseRow
): Promise<void> {
  const { error } = await supabase
    .from('dashboard_cases')
    .upsert({
      booking_id: bookingId,
      row_data: updatedRow,
      updated_at: new Date().toISOString()
    }, { onConflict: 'booking_id' });

  if (error) {
    console.error(`Failed to update case ${bookingId} in Supabase DB:`, error.message);
    throw new Error(error.message);
  }
}

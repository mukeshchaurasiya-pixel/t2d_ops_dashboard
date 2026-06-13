/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { CaseRow, AuditLog, UserSession } from '../types';

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

async function getExistingCasesByBookingIds(bookingIds: string[]): Promise<Map<string, CaseRow>> {
  const existingRows = new Map<string, CaseRow>();
  const uniqueBookingIds = Array.from(
    new Set(
      bookingIds
        .map(id => String(id || '').trim())
        .filter(Boolean)
    )
  );

  const chunkSize = 500;
  for (let i = 0; i < uniqueBookingIds.length; i += chunkSize) {
    const chunk = uniqueBookingIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('dashboard_cases')
      .select('booking_id,row_data')
      .in('booking_id', chunk);

    if (error) {
      console.error('Failed to fetch existing cases for targeted diff:', error.message);
      throw new Error(error.message);
    }

    (data || []).forEach((record: any) => {
      const cleanId = String(record.booking_id || '').trim().toLowerCase();
      if (cleanId) {
        existingRows.set(cleanId, record.row_data as CaseRow);
      }
    });
  }

  return existingRows;
}

/**
 * Detects changes between oldRow and newRow for a list of audited columns.
 */
function detectChanges(
  oldRow: CaseRow,
  newRow: CaseRow,
  changedBy: string
): Omit<AuditLog, 'id' | 'changed_at'>[] {
  const auditedColumns: (keyof CaseRow)[] = [
    'readyToDeliver',
    'expectedOdCompletionDate',
    'eddReviewerDate',
    'reviewerRemarks',
    'onDemandStatus',
    'expectedDeliveryDate',
    'paymentPercentage',
    'sheetFinalStatus',
    'formFinalStatus',
    'confidenceScore',
    'leadStage',
    'dealStatus',
    'allocatedRm',
    'assignedDc',
    'deliveryStatus',
    'taskBucket'
  ];

  const logs: Omit<AuditLog, 'id' | 'changed_at'>[] = [];
  auditedColumns.forEach(col => {
    const oldValRaw = oldRow[col];
    const newValRaw = newRow[col];

    const oldVal = oldValRaw !== undefined && oldValRaw !== null ? String(oldValRaw).trim() : '';
    const newVal = newValRaw !== undefined && newValRaw !== null ? String(newValRaw).trim() : '';

    if (oldVal !== newVal) {
      logs.push({
        booking_id: newRow.bookingId,
        changed_by: changedBy,
        column_name: col,
        old_value: oldVal || null,
        new_value: newVal || null
      });
    }
  });
  return logs;
}

/**
 * Batch upserts case rows from Google Sheet into the Supabase table.
 */
export async function upsertCasesToDb(
  rows: CaseRow[],
  changedByEmail?: string
): Promise<void> {
  if (rows.length === 0) return;

  // Deduplicate by normalized lowercase bookingId to prevent "ON CONFLICT DO UPDATE" target errors
  const uniqueRowsMap = new Map<string, CaseRow>();
  rows.forEach(row => {
    if (row.bookingId) {
      const cleanId = String(row.bookingId).trim().toLowerCase();
      if (cleanId) {
        uniqueRowsMap.set(cleanId, row);
      }
    }
  });
  const uniqueRows = Array.from(uniqueRowsMap.values());

  // 1. Fetch existing rows from database to compare
  const bookingIds = uniqueRows.map(row => String(row.bookingId || '').trim()).filter(Boolean);
  let existingRowsMap = new Map<string, CaseRow>();
  try {
    existingRowsMap = await getExistingCasesByBookingIds(bookingIds);
  } catch (err) {
    console.warn('Could not fetch existing cases for batch auditing:', err);
  }

  // 2. Perform bulk upsert in chunks to avoid URL size or payload limitations if the dataset is huge
  const payload = uniqueRows.map(row => ({
    booking_id: String(row.bookingId).trim(),
    row_data: row,
    updated_at: new Date().toISOString()
  }));

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

  // 3. Detect changes and write audit logs in background/after upsert
  const changedBy = changedByEmail || 'system_sync';
  const logsToInsert: Omit<AuditLog, 'id' | 'changed_at'>[] = [];
  
  uniqueRows.forEach(row => {
    if (!row.bookingId) return;
    const cleanId = String(row.bookingId).trim().toLowerCase();
    const oldRow = existingRowsMap.get(cleanId);
    if (oldRow) {
      const rowLogs = detectChanges(oldRow, row, changedBy);
      logsToInsert.push(...rowLogs);
    }
  });

  if (logsToInsert.length > 0) {
    try {
      await writeAuditLogs(logsToInsert);
    } catch (logErr) {
      console.warn('Failed to write batch audit logs:', logErr);
    }
  }
}

/**
 * Updates a single case record in the Supabase table.
 */
export async function updateSingleCaseInDb(
  bookingId: string,
  updatedRow: CaseRow,
  changedByEmail?: string
): Promise<void> {
  // 1. Fetch old row for comparison
  let oldRow: CaseRow | null = null;
  try {
    const { data } = await supabase
      .from('dashboard_cases')
      .select('row_data')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (data) {
      oldRow = data.row_data as CaseRow;
    }
  } catch (err) {
    console.warn(`Could not fetch existing row for bookingId ${bookingId}:`, err);
  }

  // 2. Perform the update
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

  // 3. Detect and write audit logs
  if (oldRow) {
    const logs = detectChanges(oldRow, updatedRow, changedByEmail || 'unknown_user');
    if (logs.length > 0) {
      try {
        await writeAuditLogs(logs);
      } catch (logErr) {
        console.warn(`Failed to write audit logs for bookingId ${bookingId}:`, logErr);
      }
    }
  }
}

/**
 * Writes audit log entries for changes to Supabase table.
 */
export async function writeAuditLogs(
  logs: Omit<AuditLog, 'id' | 'changed_at'>[]
): Promise<void> {
  if (logs.length === 0) return;

  const { error } = await supabase
    .from('audit_logs')
    .insert(logs);

  if (error) {
    console.error('Failed to write audit logs to Supabase DB:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Fetches audit logs for a specific Booking ID.
 */
export async function getAuditLogs(bookingId: string): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('booking_id', bookingId)
    .order('changed_at', { ascending: false });

  if (error) {
    console.error(`Failed to fetch audit logs for case ${bookingId}:`, error.message);
    throw new Error(error.message);
  }

  return (data || []) as AuditLog[];
}

/**
 * Starts a new user activity tracking session in Supabase DB.
 * Returns the UUID of the created session.
 */
export async function startUserSession(email: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_sessions')
    .insert({
      user_email: email,
      login_time: new Date().toISOString(),
      last_active_time: new Date().toISOString(),
      duration_minutes: 0
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create user session in Supabase:', error.message);
    throw new Error(error.message);
  }

  return data.id;
}

/**
 * Updates user session activity heartbeat, recalculating active minutes.
 */
export async function heartbeatUserSession(sessionId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('user_sessions')
      .select('login_time')
      .eq('id', sessionId)
      .maybeSingle();

    if (data && data.login_time) {
      const loginMs = new Date(data.login_time).getTime();
      const currentMs = Date.now();
      const diffMins = Math.max(1, Math.round((currentMs - loginMs) / 60000));

      await supabase
        .from('user_sessions')
        .update({
          last_active_time: new Date().toISOString(),
          duration_minutes: diffMins
        })
        .eq('id', sessionId);
    }
  } catch (err) {
    console.warn('Failed to update user session heartbeat:', err);
  }
}

/**
 * Retrieves list of user sessions (recent first) for admin metrics.
 */
export async function getUserSessions(): Promise<UserSession[]> {
  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .order('login_time', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to fetch user sessions:', error.message);
    throw new Error(error.message);
  }

  return (data || []) as UserSession[];
}

/**
 * Fetches all audit logs (limit 200) for admin overview.
 */
export async function getAllAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Failed to fetch all audit logs:', error.message);
    throw new Error(error.message);
  }

  return (data || []) as AuditLog[];
}

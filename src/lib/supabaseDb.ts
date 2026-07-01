/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import {
  AuditLog,
  CasePageResult,
  CaseQuery,
  CaseRow,
  DashboardFilterOptions,
  DashboardMatrixResult,
  DashboardSummaryQuery,
  DashboardSummaryResult,
  UserSession,
} from '../types';
import {
  EMPTY_CASE_PAGE,
  EMPTY_DASHBOARD_MATRIX,
  EMPTY_DASHBOARD_SUMMARY,
  EMPTY_FILTER_OPTIONS,
} from './dashboardQuery';
import { parseDateString } from './dateUtils';

type DashboardCaseRecord = {
  booking_id: string;
  row_data: CaseRow;
  updated_at: string;
  token_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  cancel_req_date: string | null;
  last_payment_date: string | null;
  latest_remark_date: string | null;
  expected_od_completion_date: string | null;
  edd_reviewer_date: string | null;
  gmail_pendency_date: string | null;
  city: string | null;
  hub_name: string | null;
  allocated_rm: string | null;
  assigned_dc: string | null;
  lead_stage: string | null;
  deal_status: string | null;
  task_bucket: string | null;
  payment_type: string | null;
  token_type: string | null;
  token_type_with_nrt: string | null;
  sheet_final_status: string | null;
  form_final_status: string | null;
  gmail_pendency_status: string | null;
  ready_to_deliver: string | null;
  cancel_reason: string | null;
  lead_ds_channel: string | null;
  total_listing_days: number | null;
  payment_percentage: number | null;
  customer_key: string | null;
};

export type DashboardCacheImportStats = {
  sourceRows: number;
  uniqueBookingIds: number;
  blankBookingIdRows: number;
  duplicateBookingIdRows: number;
};

const ACTIVE_TOKEN_FETCH_LIMIT = 1000;
const AUDIT_LOG_CHUNK_SIZE = 500;

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned === '' ? null : cleaned;
}

function toDateOnly(value: unknown): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = parseDateString(cleaned);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimestamp(value: unknown): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = parseDateString(cleaned);
  return parsed ? parsed.toISOString() : null;
}

function toNumeric(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildCaseRecord(row: CaseRow): DashboardCaseRecord {
  return {
    booking_id: String(row.bookingId).trim(),
    row_data: row,
    updated_at: new Date().toISOString(),
    token_date: toDateOnly(row.tokenDate),
    expected_delivery_date: toDateOnly(row.expectedDeliveryTime) || toDateOnly(row.expectedDeliveryDate),
    actual_delivery_date: toDateOnly(row.actualDeliveryDate),
    cancel_req_date: toDateOnly(row.cancelReqDate),
    last_payment_date: toDateOnly(row.lastPaymentDate),
    latest_remark_date: toTimestamp(row.latestRemarkDate),
    expected_od_completion_date: toDateOnly(row.expectedOdCompletionDate),
    edd_reviewer_date: toDateOnly(row.eddReviewerDate),
    gmail_pendency_date: toDateOnly(row.gmailPendencyDate),
    city: cleanString(row.city),
    hub_name: cleanString(row.hubName),
    allocated_rm: cleanString(row.allocatedRm),
    assigned_dc: cleanString(row.assignedDc),
    lead_stage: cleanString(row.leadStage),
    deal_status: cleanString(row.dealStatus),
    task_bucket: cleanString(row.taskBucket),
    payment_type: cleanString(row.paymentType),
    token_type: cleanString(row.tokenType),
    token_type_with_nrt: cleanString(row.tokenTypeWithNrt),
    sheet_final_status: cleanString(row.sheetFinalStatus),
    form_final_status: cleanString(row.formFinalStatus),
    gmail_pendency_status: cleanString(row.gmailPendencyStatus),
    ready_to_deliver: cleanString(row.readyToDeliver),
    cancel_reason: cleanString(row.cancelReason),
    lead_ds_channel: cleanString(row.leadDsChannel),
    total_listing_days: toNumeric(row.totalListingDays),
    payment_percentage: toNumeric(row.paymentPercentage),
    customer_key: cleanString(row.userId),
  };
}

function parseRpcResult<T>(data: unknown, fallback: T): T {
  if (data === null || data === undefined) return fallback;
  if (Array.isArray(data) && data.length === 1) {
    return (data[0] as T) ?? fallback;
  }
  return data as T;
}

/**
 * Fetches one server-paginated page of cases from Supabase.
 */
export async function getCasesPageFromDb(query: CaseQuery): Promise<CasePageResult> {
  const { data, error } = await supabase.rpc('get_dashboard_case_page', {
    input_filters: query.filters,
    input_sort_field: String(query.sortField || 'tokenDate'),
    input_sort_direction: query.sortDirection,
    input_page: query.page,
    input_page_size: query.pageSize,
  });

  if (error) {
    console.error('Failed to fetch paginated cases from Supabase DB:', error.message);
    throw new Error(error.message);
  }

  return parseRpcResult<CasePageResult>(data, {
    ...EMPTY_CASE_PAGE,
    page: query.page,
    pageSize: query.pageSize,
  });
}

/**
 * Backward-compatible wrapper used by older callers that only need the first page.
 */
export async function getCasesFromDb(): Promise<CaseRow[]> {
  const page = await getCasesPageFromDb({
    page: 1,
    pageSize: 15,
    sortField: 'tokenDate',
    sortDirection: 'desc',
    filters: {},
  });
  return page.rows;
}

/**
 * Loads the sub-1k ACTIVE_TOKEN working set into the browser for low-latency ops actions.
 */
export async function getActiveTokenCasesFromDb(limit: number = ACTIVE_TOKEN_FETCH_LIMIT): Promise<CaseRow[]> {
  const { data, error } = await supabase.rpc('get_active_token_cases', { input_limit: limit });

  if (error) {
    console.error('Failed to fetch ACTIVE_TOKEN working set from Supabase DB:', error.message);
    throw new Error(error.message);
  }

  const list = data as { row_data: CaseRow }[] | null;
  return (list || []).map(record => record.row_data);
}

export async function getDashboardSummaryFromDb(query: DashboardSummaryQuery): Promise<DashboardSummaryResult> {
  const { data, error } = await supabase.rpc('get_dashboard_summary', {
    input_filters: query.filters,
  });

  if (error) {
    console.error('Failed to fetch dashboard summary from Supabase DB:', error.message);
    throw new Error(error.message);
  }

  return parseRpcResult<DashboardSummaryResult>(data, EMPTY_DASHBOARD_SUMMARY);
}

export async function getDashboardMatrixFromDb(query: DashboardSummaryQuery): Promise<DashboardMatrixResult> {
  const { data, error } = await supabase.rpc('get_dashboard_matrix_summary', {
    input_filters: query.filters,
  });

  if (error) {
    console.error('Failed to fetch dashboard matrix summary from Supabase DB:', error.message);
    throw new Error(error.message);
  }

  return parseRpcResult<DashboardMatrixResult>(data, EMPTY_DASHBOARD_MATRIX);
}

export async function getDashboardFilterOptionsFromDb(): Promise<DashboardFilterOptions> {
  const { data, error } = await supabase.rpc('get_dashboard_filter_options');

  if (error) {
    console.error('Failed to fetch dashboard filter options from Supabase DB:', error.message);
    throw new Error(error.message);
  }

  return parseRpcResult<DashboardFilterOptions>(data, EMPTY_FILTER_OPTIONS);
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
    'cancelReqDate',
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
): Promise<DashboardCacheImportStats> {
  if (rows.length === 0) {
    return {
      sourceRows: 0,
      uniqueBookingIds: 0,
      blankBookingIdRows: 0,
      duplicateBookingIdRows: 0,
    };
  }

  // Deduplicate by normalized lowercase bookingId to prevent "ON CONFLICT DO UPDATE" target errors
  const uniqueRowsMap = new Map<string, CaseRow>();
  let blankBookingIdRows = 0;
  let duplicateBookingIdRows = 0;

  rows.forEach(row => {
    const cleanId = String(row.bookingId || '').trim().toLowerCase();
    if (!cleanId) {
      blankBookingIdRows += 1;
      return;
    }

    if (uniqueRowsMap.has(cleanId)) {
      duplicateBookingIdRows += 1;
    }

    uniqueRowsMap.set(cleanId, row);
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
  const payload = uniqueRows.map(row => buildCaseRecord(row));

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

  return {
    sourceRows: rows.length,
    uniqueBookingIds: uniqueRows.length,
    blankBookingIdRows,
    duplicateBookingIdRows,
  };
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
    .upsert(buildCaseRecord(updatedRow), { onConflict: 'booking_id' });

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
 * Fetches all cases from Supabase DB that have a pending sheet sync.
 */
export async function getUnsyncedCasesFromDb(): Promise<CaseRow[]> {
  const { data, error } = await supabase
    .from('dashboard_cases')
    .select('row_data')
    .eq('row_data->>syncPending', 'true');

  if (error) {
    console.error('Failed to fetch unsynced cases from Supabase DB:', error.message);
    throw new Error(error.message);
  }

  return (data || []).map(record => record.row_data as CaseRow);
}

/**
 * Writes audit log entries for changes to Supabase table.
 */
export async function writeAuditLogs(
  logs: Omit<AuditLog, 'id' | 'changed_at'>[]
): Promise<void> {
  if (logs.length === 0) return;

  for (let i = 0; i < logs.length; i += AUDIT_LOG_CHUNK_SIZE) {
    const chunk = logs.slice(i, i + AUDIT_LOG_CHUNK_SIZE);
    const { error } = await supabase
      .from('audit_logs')
      .insert(chunk);

    if (error) {
      console.error('Failed to write audit logs to Supabase DB:', error.message);
      throw new Error(error.message);
    }
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

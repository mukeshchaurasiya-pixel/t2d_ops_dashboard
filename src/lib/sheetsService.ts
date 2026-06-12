/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseCsvRaw, mapCsvRows } from '../data/csvParser';
import { CaseRow } from '../types';

/**
 * Extracts and cleans Spreadsheet ID if a full URL is pasted
 */
export function getCleanSpreadsheetId(sheetId: string): string {
  let cleanId = sheetId.trim();
  if (cleanId.includes('/d/')) {
    const parts = cleanId.split('/d/');
    if (parts[1]) {
      cleanId = parts[1].split('/')[0];
    }
  }
  return cleanId;
}

/**
 * Normalizes cells by converting to string and stripping unicode / double spaces safely.
 */
export function normalizeCellStr(cell: any): string {
  if (cell === null || cell === undefined) return '';
  return String(cell)
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')
    .replace(/  +/g, ' ');
}

/**
 * Cleans header names by removing leading/trailing spaces, converting newlines/tabs to space,
 * and collapsing multiple spaces to a single space, then lowercasing.
 */
export function cleanHeaderStr(h: any): string {
  if (h === null || h === undefined) return '';
  return String(h)
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Direct fetch-and-parse handler for Google Sheet columns.
 * Supports secure Oauth 2.0 API V4 when accessToken is provided,
 * otherwise falls back to the public GViz CSV export endpoint.
 */
export async function fetchSheetDataDirect(
  sheetId: string,
  sheetName: string,
  accessToken: string | null = null,
  activeUserEmail?: string | null
): Promise<CaseRow[]> {
  if (!sheetId) {
    throw new Error('Please enter a valid Google Spreadsheet ID or URL.');
  }

  const cleanId = getCleanSpreadsheetId(sheetId);
  const targetTab = sheetName || 'Sheet1';

  if (accessToken) {
    // Option A: Active OAuth Token exists. Fetch secure dataset directly from Google Sheets API v4
    const apiKey = (import.meta as any).env.VITE_FIREBASE_API_KEY || '';
    const sheetsApiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetTab)}${apiKey ? `?key=${apiKey}` : ''}`;
    
    const response = await fetch(sheetsApiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          `Google Sheets API returned Forbidden (403). Make sure your logged-in Google Account (${activeUserEmail || 'session owner'}) has been granted "Viewer" or "Editor" permissions on this specific Google Sheet.`
        );
      } else if (response.status === 401) {
        throw new Error('Your active Google session has expired. Please sign in again or click "Reconnect Session" to establish fresh credentials.');
      } else {
        throw new Error(`Google API request failed with status: ${response.status}. Verify the Spreadsheet ID and Tab name are correct.`);
      }
    }

    const data = await response.json();
    if (!data.values || data.values.length < 2) {
      throw new Error('Specific sheet ranges did not return target rows. Check if tab is empty.');
    }

    const stringifiedValues: string[][] = data.values.map((rowArr: any[]) =>
      rowArr.map(normalizeCellStr)
    );

    const mapped = mapCsvRows(stringifiedValues);
    return mapped;
  } else {
    // Option B: Anonymous access fallback (GViz tq CSV endpoint)
    const targetUrl = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(targetTab)}`;
    
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Public retrieval failed (Status ${response.status}). Private spreadsheets require authorization.`);
    }

    const text = await response.text();
    const parsed = parseCsvRaw(text);
    if (parsed.length < 2) {
      throw new Error('Spreadsheet returned empty content or is missing headers.');
    }

    const mapped = mapCsvRows(parsed);
    return mapped;
  }
}

/**
 * Converts a 0-based column index to an A-Z/AA/AB spreadsheet column letter
 */
export function getColumnLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Writes updated actionable fields directly back to the specified row in the Google Sheet.
 * Looks up row headers on line 1, maps fields to indices, and triggers a v4 batchUpdate.
 */
export async function writeActionablesToSheet(
  sheetId: string,
  sheetName: string,
  accessToken: string,
  rowNumber: number,
  updatedFields: {
    readyToDeliver?: string;
    expectedOdCompletionDate?: string;
    eddReviewerDate?: string;
    reviewerRemarks?: string;
    updatedAt?: string;
  }
): Promise<void> {
  if (!sheetId) throw new Error('Spreadsheet ID is required to write changes.');
  if (!accessToken) throw new Error('Authorization is required to write to this Google Sheet.');
  if (!rowNumber || rowNumber < 2) throw new Error('Invalid row number to overwrite on Google Sheets.');

  const cleanId = getCleanSpreadsheetId(sheetId);
  const targetTab = sheetName || 'Sheet1';

  // 1. Fetch header row dynamically to find exact column indices
  const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetTab)}!1:1`;
  const hRes = await fetch(headersUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!hRes.ok) {
    if (hRes.status === 403) {
      throw new Error('Google Sheets API returned Forbidden (403). Make sure your account has Editor/Viewer permission.');
    }
    throw new Error(`Failed to read header row for column mapping. Status: ${hRes.status}`);
  }

  const hData = await hRes.json();
  const rawHeaders: string[] = hData.values?.[0] || [];
  if (rawHeaders.length === 0) {
    throw new Error('Could not read the header row (first line) of the Google Sheet.');
  }
  const headers = rawHeaders.map(cleanHeaderStr);

  // Helper mapping dictionary
  const mappingTable: Record<string, string[]> = {
    readyToDeliver: ['ready to deliver?', 'ready_to_deliver', 'readytodeliver'],
    expectedOdCompletionDate: ['expected od completion date', 'expected_od_completion_date', 'expectedodcompletiondate'],
    eddReviewerDate: ['edd date (reviewer)', 'edd_reviewer_date', 'eddreviewerdate', 'edddatereviewer'],
    reviewerRemarks: ['remarks - everyone (tl/rm/fs/hh)', 'remarks', 'reviewer_remarks', 'reviewerremarks', 'remarkseveryonetlrmfshh'],
    updatedAt: ['updated_at', 'updatedAt', 'updatedat']
  };

  const dataToUpdate: { range: string; values: string[][] }[] = [];

  // Match each field to its column and add to the updates payload
  Object.entries(updatedFields).forEach(([fieldKey, value]) => {
    if (value === undefined || value === null) return;
    
    // Find the matching index in the sheet header list
    let matchedColIndex = -1;
    const aliases = (mappingTable[fieldKey] || [fieldKey]).map(alias => cleanHeaderStr(alias));

    for (let c = 0; c < headers.length; c++) {
      const headerText = headers[c].replace(/[\s_?]/g, '');
      const hasAlias = aliases.some(alias => 
        alias.replace(/[\s_?]/g, '') === headerText
      );
      if (hasAlias) {
        matchedColIndex = c;
        break;
      }
    }

    if (matchedColIndex !== -1) {
      const colLetter = getColumnLetter(matchedColIndex);
      // E.g. TabName!U5
      const range = `${targetTab}!${colLetter}${rowNumber}`;
      dataToUpdate.push({
        range,
        values: [[String(value)]]
      });
    } else {
      console.warn(`Field "${fieldKey}" could not be mapped to any header column index in the sheet.`);
    }
  });

  if (dataToUpdate.length === 0) {
    console.warn('No updated fields mapped to spreadsheet columns. Skipping Sheets API push.');
    return;
  }

  // 2. Push non-contiguous batchUpdate to the Sheets API
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchUpdate`;
  const response = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: dataToUpdate
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Sheets API update failed. status: ${response.status}, details: ${errText}`);
  }
}

/**
 * Fetches the absolute latest values for a single row from Google Sheet
 */
export async function fetchSingleRowLatest(
  sheetId: string,
  sheetName: string,
  accessToken: string,
  rowNumber: number
): Promise<Partial<CaseRow>> {
  if (!sheetId || !accessToken || !rowNumber || rowNumber < 2) {
    throw new Error('Missing parameters to fetch single row.');
  }

  const cleanId = getCleanSpreadsheetId(sheetId);
  const targetTab = sheetName || 'Sheet1';

  // Fetch both the header row and the active row
  const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetTab)}!1:1`;
  const rowUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetTab)}!${rowNumber}:${rowNumber}`;

  // Run in parallel for extreme speed
  const [hRes, rRes] = await Promise.all([
    fetch(headersUrl, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } }),
    fetch(rowUrl, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } })
  ]);

  if (!hRes.ok || !rRes.ok) {
    throw new Error('Failed to retrieve fresh row values from Google Sheets.');
  }

  const hData = await hRes.json();
  const rData = await rRes.json();

  const rawHeaders: string[] = hData.values?.[0] || [];
  if (rawHeaders.length === 0) {
    throw new Error('Google Sheet headers are empty.');
  }
  const headers = rawHeaders.map(cleanHeaderStr);
  const rowCells: string[] = (rData.values?.[0] || []).map(normalizeCellStr);

  // Same mapping keys as mapCsvRows
  const mappingTable: Record<string, keyof CaseRow> = {
    'booking_id': 'bookingId',
    'bookingid': 'bookingId',
    'booking': 'bookingId',
    'uid': 'uid',
    'lead_id': 'leadId',
    'leadid': 'leadId',
    'user_id': 'userId',
    'userid': 'userId',
    'loan_id': 'loanId',
    'loanid': 'loanId',
    'appointmentid': 'appointmentId',
    'appointment_id': 'appointmentId',
    'car_reg_no': 'carRegNo',
    'carregno': 'carRegNo',
    'hub_code': 'hubCode',
    'hubname': 'hubName',
    'hub_name': 'hubName',
    'city': 'city',
    'allocated_rm': 'allocatedRm',
    'allocatedrm': 'allocatedRm',
    'assigned_rm': 'allocatedRm',
    'assignedrm': 'allocatedRm',
    'assigned_dc': 'assignedDc',
    'assigneddc': 'assignedDc',
    'lead_stage': 'leadStage',
    'leadstage': 'leadStage',
    'deal_status': 'dealStatus',
    'dealstatus': 'dealStatus',
    'token_type': 'tokenType',
    'tokentype': 'tokenType',
    'payment_type': 'paymentType',
    'paymenttype': 'paymentType',
    'funnel_stage': 'funnelStage',
    'funnelstage': 'funnelStage',
    'token_date': 'tokenDate',
    'expected_delivery_date': 'expectedDeliveryDate',
    'actual_delivery_date': 'actualDeliveryDate',
    'amount_collected': 'amountCollected',
    'amount_pending': 'amountPending',
    'total_expected_amount': 'totalExpectedAmount',
    'payment_percentage': 'paymentPercentage',
    'ready to deliver?': 'readyToDeliver',
    'ready_to_deliver': 'readyToDeliver',
    'expected od completion date': 'expectedOdCompletionDate',
    'expected_od_completion_date': 'expectedOdCompletionDate',
    'edd date (reviewer)': 'eddReviewerDate',
    'edd_reviewer_date': 'eddReviewerDate',
    'remarks - everyone (tl/rm/fs/hh)': 'reviewerRemarks',
    'remarks': 'reviewerRemarks',
    'reviewer_remarks': 'reviewerRemarks',
    'make': 'make',
    'model': 'model',
    'variant': 'variant',
    'task_bucket': 'taskBucket',
    'taskbucket': 'taskBucket',
    'reason & data pointer': 'reasonPointer',
    'reason_pointer': 'reasonPointer',

    // Sheet Status mappings
    'sheetloginpartner': 'sheetLoginPartner',
    'sheet_login_partner': 'sheetLoginPartner',
    'sheetfinalstatus': 'sheetFinalStatus',
    'sheet_final_status': 'sheetFinalStatus',
    'sheetyardname': 'sheetYardName',
    'sheet_yard_name': 'sheetYardName',
    'sheetyardcity': 'sheetYardCity',
    'sheet_yard_city': 'sheetYardCity',
    'sheetdetailedremarks': 'sheetDetailedRemarks',
    'sheet_detailed_remarks': 'sheetDetailedRemarks',
    'sheetlastdisbursalactivity': 'sheetLastDisbursalActivity',
    'sheet_last_disbursal_activity': 'sheetLastDisbursalActivity',
    'sheetlogintimestamp': 'sheetLoginTimestamp',
    'sheet_login_timestamp': 'sheetLoginTimestamp',

    // Form Status mappings
    'formriskbucket': 'formRiskBucket',
    'form_risk_bucket': 'formRiskBucket',
    'formfinalstatus': 'formFinalStatus',
    'form_final_status': 'formFinalStatus',
    'formcasestage': 'formCaseStage',
    'form_case_stage': 'formCaseStage',
    'formfinalremarks': 'formFinalRemarks',
    'form_final_remarks': 'formFinalRemarks',
    'formdeviationrequired': 'formDeviationRequired',
    'form_deviation_required': 'formDeviationRequired',
    'formdetailedask': 'formDetailedAsk',
    'form_detailed_ask': 'formDetailedAsk',

    // Gmail pendency status
    'gmail_summary': 'gmailSummary',
    'gmailsummary': 'gmailSummary',
    'gmail_pendency_status': 'gmailPendencyStatus',
    'gmailpendencystatus': 'gmailPendencyStatus',
    'gmail_pendency_reason': 'gmailPendencyReason',
    'gmailpendencyreason': 'gmailPendencyReason',
    'gmail_next_action': 'gmailNextAction',
    'gmailnextaction': 'gmailNextAction',
    'gmail_pendency_source': 'gmailPendencySource',
    'gmailpendencysource': 'gmailPendencySource',
    'gmail_pendency_date': 'gmailPendencyDate',
    'gmailpendencydate': 'gmailPendencyDate',
    'confidence_score': 'confidenceScore',
    'confidencescore': 'confidenceScore',
    'ml_estimated_delivery_date': 'mlEstimatedDeliveryDate',
    'mlestimateddeliverydate': 'mlEstimatedDeliveryDate',
    'latest_remark': 'latestRemark',
    'latestremark': 'latestRemark',
    'latest_remark_by': 'latestRemarkBy',
    'latestremarkby': 'latestRemarkBy',
    'latest_remark_date': 'latestRemarkDate',
    'latestremarkdate': 'latestRemarkDate',
    'total_listing_days': 'totalListingDays',
    'totallistingdays': 'totalListingDays',

    // Underwriting / Credit Risk / Safety Flags
    'rc_case_type': 'rcCaseType',
    'rccasetype': 'rcCaseType',
    'income_source': 'incomeSource',
    'incomesource': 'incomeSource',
    'ogl_pincode_flag': 'oglPincodeFlag',
    'oglpincodeflag': 'oglPincodeFlag',
    'ogl_pincode_check': 'oglPincodeFlag',
    'credit_ltv': 'creditLtv',
    'creditltv': 'creditLtv',
    'ltv': 'creditLtv',
    'last_risk_bucket': 'lastRiskBucket',
    'lastriskbucket': 'lastRiskBucket',
    'ds_roi': 'dsRoi',
    'dsroi': 'dsRoi',
    'final_roi': 'finalRoi',
    'finalroi': 'finalRoi',
    'credit_rejection_reason': 'creditRejectionReason',
    'creditrejectionreason': 'creditRejectionReason',
    'credit_rejection_sub_reason': 'creditRejectionSubReason',
    'creditrejectionsubreason': 'creditRejectionSubReason',
    'diligence_rejection_reason': 'diligenceRejectionReason',
    'diligencerejectionreason': 'diligenceRejectionReason',
    'diligence_rejection_sub_reason': 'diligenceRejectionSubReason',
    'diligencerejectionsubreason': 'diligenceRejectionSubReason',
    'red_channel_reason': 'redChannelReason',
    'redchannelreason': 'redChannelReason',
    'soft_derog_flag': 'softDerogFlag',
    'softderogflag': 'softDerogFlag',
    'hard_derog_flag': 'hardDerogFlag',
    'hardderogflag': 'hardDerogFlag',
    'non_ogl': 'nonOgl',
    'nonogl': 'nonOgl',
    'contact_number': 'contactNumber',
    'contactnumber': 'contactNumber',
    'red_channel_flag': 'redChannelFlag',
    'redchannelflag': 'redChannelFlag',
    'tof_rejected_flag': 'tofRejectedFlag',
    'tofrejectedflag': 'tofRejectedFlag',
    'deviation_mitigation_comment': 'deviationMitigationComment',
    'deviationmitigationcomment': 'deviationMitigationComment',
    'bajaj_segment': 'bajajSegment',
    'bajajsegment': 'bajajSegment',
    'company_name': 'companyName',
    'companyname': 'companyName',
    'lead_ds_channel': 'leadDsChannel',
    'leaddschannel': 'leadDsChannel',
    'foir': 'foir',

    // Milestones / Journey timestamps
    'latest_lead_creation_timestamp': 'latestLeadCreationTimestamp',
    'latestleadcreationtimestamp': 'latestLeadCreationTimestamp',
    'latest_login_time': 'latestLoginTime',
    'latestlogintime': 'latestLoginTime',
    'latest_credit_assessed_timestamp': 'latestCreditAssessedTimestamp',
    'latestcreditassessedtimestamp': 'latestCreditAssessedTimestamp',
    'latest_diligence_assessed_timestamp': 'latestDiligenceAssessedTimestamp',
    'latestdiligenceassessedtimestamp': 'latestDiligenceAssessedTimestamp',
    'latest_fcu_assessed_timestamp': 'latestFcuAssessedTimestamp',
    'latestfcuassessedtimestamp': 'latestFcuAssessedTimestamp',
    'tnc_generated_date': 'tncGeneratedDate',
    'tncgenerateddate': 'tncGeneratedDate',
    'tnc_accepted_timestamp': 'tncAcceptedTimestamp',
    'tncacceptedtimestamp': 'tncAcceptedTimestamp',
    'fcu_sent_date': 'fcuSentDate',
    'fcusentdate': 'fcuSentDate',
    'sent_to_rcu_timestamp': 'sentToRcuTimestamp',
    'senttorcutimestamp': 'sentToRcuTimestamp',
    'sent_to_ops_timestamp': 'sentToOpsTimestamp',
    'senttoopstimestamp': 'sentToOpsTimestamp',
    'submit_to_ops_timestamp': 'submitToOpsTimestamp',
    'submittoopstimestamp': 'submitToOpsTimestamp',
    'ops_disbursal_timestamp': 'opsDisbursalTimestamp',
    'opsdisbursaltimestamp': 'opsDisbursalTimestamp',
    'finance_disbursed_timestamp': 'financeDisbursedTimestamp',
    'financedisbursedtimestamp': 'financeDisbursedTimestamp',

    // Calling / CRM Outbound Metrics
    'last_call_at': 'lastCallAt',
    'lastcallat': 'lastCallAt',
    'followup_at': 'followupAt',
    'followupat': 'followupAt',
    'total_call_attempts': 'totalCallAttempts',
    'totalcallattempts': 'totalCallAttempts',
    'agg_total_call_attempts': 'totalCallAttempts',
    'aggtotalcallattempts': 'totalCallAttempts',
    'total_connected_calls': 'totalConnectedCalls',
    'totalconnectedcalls': 'totalConnectedCalls',
    'agg_total_connected_calls': 'totalConnectedCalls',
    'aggtotalconnectedcalls': 'totalConnectedCalls',
    'last_call_connected_sp': 'lastCallConnectedSp',
    'lastcallconnectedsp': 'lastCallConnectedSp',
    'dialed_operator_sp': 'lastCallConnectedSp',
    'dialed_operator': 'lastCallConnectedSp',
    'call_duration': 'callDuration',
    'callduration': 'callDuration',
    'agg_call_duration': 'callDuration',
    'aggcallduration': 'callDuration',
    'latest_call_outcome': 'latestCallOutcome',
    'latestcalloutcome': 'latestCallOutcome',
    'agg_latest_call_outcome': 'latestCallOutcome',
    'agglatestcalloutcome': 'latestCallOutcome',
    'last_disposition': 'lastDisposition',
    'lastdisposition': 'lastDisposition',
    'agg_last_disposition': 'lastDisposition',
    'agglastdisposition': 'lastDisposition'
  };

  const updatedFields: Partial<CaseRow> = {};

  rowCells.forEach((cell, cellIndex) => {
    const headerName = headers[cellIndex];
    if (!headerName) return;

    const key = mappingTable[headerName] || mappingTable[headerName.replace(/[\s_?]/g, '')];
    if (key) {
      if (key === 'amountCollected' || key === 'amountPending' || key === 'totalExpectedAmount' || key === 'paymentPercentage' || key === 'totalCallAttempts' || key === 'totalConnectedCalls') {
        const cleanedVal = cell ? String(cell).replace(/[^0-9.-]/g, '') : '';
        (updatedFields as any)[key] = parseFloat(cleanedVal) || 0;
      } else {
        (updatedFields as any)[key] = cell;
      }
    }
  });

  return updatedFields;
}


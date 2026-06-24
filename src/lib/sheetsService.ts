/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseCsvRaw, mapCsvRows } from '../data/csvParser';
import { CaseRow } from '../types';
import {
  applyReturnedLeadStage,
  coerceCaseRowValue,
  resolveCaseRowField,
} from '../data/caseRowSchema.js';

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
    onDemandStatus?: string;
    deliveryStatus?: string;
    expectedOdCompletionDate?: string;
    eddReviewerDate?: string;
    expectedDeliveryDate?: string;
    cancelReqDate?: string;
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
    onDemandStatus: ['on demand status', 'on_demand_status', 'ondemandstatus'],
    deliveryStatus: ['delivery status', 'delivery_status', 'deliverystatus'],
    expectedOdCompletionDate: ['expected od completion date', 'expected_od_completion_date', 'expectedodcompletiondate'],
    eddReviewerDate: ['edd date (reviewer)', 'edd_reviewer_date', 'eddreviewerdate', 'edddatereviewer'],
    expectedDeliveryDate: ['expected delivery date', 'expected_delivery_date', 'expecteddeliverydate'],
    cancelReqDate: ['cancel req date', 'cancel_req_date', 'cancelreqdate'],
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

  const updatedFields: Partial<CaseRow> = {};

  rowCells.forEach((cell, cellIndex) => {
    const headerName = headers[cellIndex];
    if (!headerName) return;

    const key = resolveCaseRowField(headerName) as keyof CaseRow | undefined;
    if (key) {
      (updatedFields as any)[key] = coerceCaseRowValue(key, cell);
    }
  });

  return applyReturnedLeadStage(updatedFields) as Partial<CaseRow>;
}

/**
 * Verifies if the Google Access Token has read permission on the Google Sheet.
 */
export async function verifySheetAccess(sheetId: string, accessToken: string): Promise<boolean> {
  try {
    const cleanId = getCleanSpreadsheetId(sheetId);
    const verifyUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=spreadsheetId`;
    
    const res = await fetch(verifyUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    return res.ok;
  } catch (err) {
    console.error('Error verifying sheet access:', err);
    return false;
  }
}

export const AVAILABLE_ADDITIONAL_COLS: { key: keyof CaseRow; label: string }[] = [
  { key: 'totalListingDays', label: 'Total Listing Days' },
  { key: 'city', label: 'City' },
  { key: 'carRegNo', label: 'Car Registration No' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'variant', label: 'Variant' },
  { key: 'dsRoi', label: 'DS ROI' },
  { key: 'finalRoi', label: 'Final ROI' },
  { key: 'hubCode', label: 'Hub Code' },
  { key: 'cancelReason', label: 'Cancellation Reason' },
  { key: 'leadDsChannel', label: 'DS Channel' },
  { key: 'sheetFinalStatus', label: 'Sheet Final Status' },
  { key: 'formFinalStatus', label: 'Form Final Status' },
  { key: 'deviationMitigationComment', label: 'Deviation Comments' },
  { key: 'creditLtv', label: 'Credit LTV' },
  { key: 'contactNumber', label: 'Contact Number' },
  // Date parameter fields requested for export selection
  { key: 'tokenDateTime', label: 'Token Date & Time' },
  { key: 'bookingDate', label: 'Booking Date' },
  { key: 'expectedDeliveryTime', label: 'Expected Delivery Time' },
  { key: 'actualDeliveryDate', label: 'Actual Delivery Date' },
  { key: 'eddReviewerDate', label: 'EDD Date (Reviewer)' },
  { key: 'cancelReqDate', label: 'Cancellation Req Date' },
  { key: 'cancellationDate', label: 'Cancellation Date' },
  { key: 'tokenAutoCancellationExtendedDate', label: 'Auto Cancel Ext Date' },
  { key: 'dealStatusUpdatedAt', label: 'Deal Status Update Date' },
  { key: 'latestRemarkDate', label: 'Latest Remark Date' },
  { key: 'updatedAt', label: 'System Update Date' },
  { key: 'lastCallAt', label: 'Last Call Date' },
  { key: 'followupAt', label: 'Followup Date' },
  { key: 'gmailPendencyDate', label: 'Gmail Pendency Date' },
  { key: 'latestLeadCreationTimestamp', label: 'Lead Creation Date' },
  { key: 'latestLoginTime', label: 'Login Time' },
  { key: 'latestCreditAssessedTimestamp', label: 'Credit Assessed Date' },
  { key: 'latestDiligenceAssessedTimestamp', label: 'Diligence Assessed Date' },
  { key: 'latestFcuAssessedTimestamp', label: 'FCU Assessed Date' },
  { key: 'tncGeneratedDate', label: 'TnC Generated Date' },
  { key: 'tncAcceptedTimestamp', label: 'TnC Accepted Date' },
  { key: 'fcuSentDate', label: 'FCU Sent Date' },
  { key: 'sentToRcuTimestamp', label: 'Sent to RCU Date' },
  { key: 'sentToOpsTimestamp', label: 'Sent to Ops Date' },
  { key: 'submitToOpsTimestamp', label: 'Submit to Ops Date' },
  { key: 'opsDisbursalTimestamp', label: 'Ops Disbursal Date' },
  { key: 'financeDisbursedTimestamp', label: 'Finance Disbursed Date' }
];

/**
 * Creates a brand new Google Spreadsheet and writes all provided rows to its default first sheet.
 */
export async function exportFilteredRowsToGoogleSheet(
  accessToken: string,
  rows: CaseRow[],
  additionalColumns: string[] = []
): Promise<{ title: string; url: string }> {
  if (!accessToken) throw new Error('Authorization token is required.');

  const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const newSheetTitle = `CARS24 Ops Export ${timestampStr}`;

  // 1. Create a brand new Spreadsheet
  const createUrl = `https://sheets.googleapis.com/v4/spreadsheets`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: newSheetTitle
      }
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create new Google Spreadsheet: ${errText}`);
  }

  const createData = await createRes.json();
  const newSpreadsheetId = createData.spreadsheetId;
  const newSpreadsheetUrl = createData.spreadsheetUrl;
  
  // Find the first sheet's title (typically "Sheet1")
  const targetTab = createData.sheets?.[0]?.properties?.title || 'Sheet1';

  // 2. Prepare headers and values
  const standardHeader = ["Booking ID", "Loan ID", "Token Date", "Hub", "RM", "TokenType", "PaymentType", "LeadStage", "Tasks", "ExpectedDelivery", "Ready", "ODCompletion", "Remarks"];

  const additionalHeaders = AVAILABLE_ADDITIONAL_COLS
    .filter(col => additionalColumns.includes(col.key))
    .map(col => col.label);

  const headerRow = [...standardHeader, ...additionalHeaders];

  const dataRows = rows.map(row => {
    const standardVals = [
      row.bookingId || '',
      row.loanId || '',
      row.tokenDate || '',
      row.hubName || '',
      row.allocatedRm || '',
      row.tokenType || '',
      row.paymentType || '',
      row.leadStage || '',
      row.taskBucket || '',
      row.expectedDeliveryDate || '',
      row.readyToDeliver || '',
      row.expectedOdCompletionDate || '',
      row.reviewerRemarks || ''
    ];

    const additionalVals = AVAILABLE_ADDITIONAL_COLS
      .filter(col => additionalColumns.includes(col.key))
      .map(col => {
        const val = row[col.key as keyof CaseRow];
        return val !== undefined && val !== null ? String(val) : '';
      });

    return [...standardVals, ...additionalVals];
  });

  const allValues = [headerRow, ...dataRows];

  // 3. Write data to the first sheet of the new spreadsheet
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${newSpreadsheetId}/values/${encodeURIComponent(targetTab)}!A1?valueInputOption=USER_ENTERED`;
  const writeRes = await fetch(writeUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      range: `${targetTab}!A1`,
      majorDimension: 'ROWS',
      values: allValues
    })
  });

  if (!writeRes.ok) {
    const errText = await writeRes.text();
    throw new Error(`Failed to write values to new Google Spreadsheet: ${errText}`);
  }

  return {
    title: newSheetTitle,
    url: newSpreadsheetUrl
  };
}

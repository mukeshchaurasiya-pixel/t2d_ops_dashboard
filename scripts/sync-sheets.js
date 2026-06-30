/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * background sync script: pulls private Google Sheets data using a
 * Google service account, parses it, and updates the Supabase DB cache.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  applyReturnedLeadStage,
  coerceCaseRowValue,
  createBaseCaseRow,
  normalizeHeaderKey,
  resolveCaseRowField,
} from '../src/data/caseRowSchema.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const googleServiceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const googleServiceAccountPrivateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.log('Skipping background sync: Supabase worker credentials are not configured.');
  process.exit(0);
}

if (!googleServiceAccountEmail || !googleServiceAccountPrivateKey) {
  console.log('Skipping background sync: Google service account credentials are not configured.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function normalizeStr(val) {
  return val
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/g, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/g, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')
    .replace(/  +/g, ' ');
}

function normalizePrivateKey(rawValue) {
  if (!rawValue) return '';
  return String(rawValue).replace(/\\n/g, '\n').trim();
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getGoogleSheetsAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const jwtClaimSet = {
    iss: googleServiceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(jwtHeader))}.${base64UrlEncode(JSON.stringify(jwtClaimSet))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer
    .sign(googleServiceAccountPrivateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const signedJwt = `${unsignedToken}.${signature}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    })
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed (${tokenResponse.status}): ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('Google OAuth token exchange succeeded but no access_token was returned.');
  }

  return tokenData.access_token;
}

async function fetchPrivateSheetValues(sheetId, sheetName, accessToken) {
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}`;
  const response = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets API fetch failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const values = Array.isArray(data.values) ? data.values : [];
  return values.map(row => row.map(cell => normalizeStr(String(cell ?? ''))));
}

function parseDateStringInternal(str) {
  const yyyymmddRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+|T)?(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
  const matchY = str.match(yyyymmddRegex);
  if (matchY) {
    const year = parseInt(matchY[1], 10);
    const month = parseInt(matchY[2], 10) - 1;
    const day = parseInt(matchY[3], 10);
    const hour = matchY[4] ? parseInt(matchY[4], 10) : 0;
    const minute = matchY[5] ? parseInt(matchY[5], 10) : 0;
    const second = matchY[6] ? parseInt(matchY[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  const ddmmyyyyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/;
  const matchD = str.match(ddmmyyyyRegex);
  if (matchD) {
    const day = parseInt(matchD[1], 10);
    const month = parseInt(matchD[2], 10) - 1;
    let year = parseInt(matchD[3], 10);
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    const hour = matchD[4] ? parseInt(matchD[4], 10) : 0;
    const minute = matchD[5] ? parseInt(matchD[5], 10) : 0;
    const second = matchD[6] ? parseInt(matchD[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return null;
}

const dateCache = new Map();
function parseDateString(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  const cached = dateCache.get(str);
  if (cached !== undefined) {
    return cached === -1 ? null : new Date(cached);
  }

  const result = parseDateStringInternal(str);
  if (result) {
    dateCache.set(str, result.getTime());
  } else {
    dateCache.set(str, -1);
  }
  return result;
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned === '' ? null : cleaned;
}

function toDateOnly(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = parseDateString(cleaned);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimestamp(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const parsed = parseDateString(cleaned);
  return parsed ? parsed.toISOString() : null;
}

function toNumeric(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildCaseRecord(row) {
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
    final_payment_type: cleanString(row.finalPaymentType),
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
    customer_key: cleanString(row.userId || row.uid || row.leadId),
  };
}

async function runSync() {
  console.log('--- STARTING BACKGROUND SHEET SYNC ---');

  // 1. Fetch configured sheet config from Supabase
  const { data: config, error: configErr } = await supabase
    .from('shared_config')
    .select('*')
    .eq('id', 'shared')
    .maybeSingle();

  if (configErr) {
    console.error('Failed to load shared config from database:', configErr.message);
    process.exit(1);
  }

  if (!config || !config.sheet_id) {
    console.error('No configuration found in shared_config table.');
    process.exit(1);
  }

  const sheetId = config.sheet_id;
  const sheetName = config.sheet_name || 'Sheet1';
  console.log(`Configured Google Sheet ID: ${sheetId}, Tab: ${sheetName}`);

  // 2. Query private sheet via authenticated Google Sheets API
  console.log('Requesting Google Sheets access token...');
  const googleAccessToken = await getGoogleSheetsAccessToken();
  console.log('Querying private Sheets API endpoint...');

  const parsed = await fetchPrivateSheetValues(sheetId, sheetName, googleAccessToken);
  if (parsed.length < 2) {
    console.error('Google Sheets API returned empty sheet or missing headers.');
    process.exit(1);
  }

  const rawHeaders = parsed[0].map(normalizeHeaderKey);

  const mappedRows = [];
  for (let i = 1; i < parsed.length; i++) {
    const line = parsed[i];
    if (line.every(cell => !cell.trim())) continue;

    const rowObj = createBaseCaseRow(i + 1);

    line.forEach((cell, cellIndex) => {
      const headerName = rawHeaders[cellIndex];
      if (!headerName) return;

      const key = resolveCaseRowField(headerName);
      if (key) {
        const rawVal = normalizeStr(cell.trim());
        rowObj[key] = coerceCaseRowValue(key, rawVal);
      }
    });

    mappedRows.push(applyReturnedLeadStage(rowObj));
  }

  console.log(`Parsed ${mappedRows.length} rows. De-duplicating by bookingId...`);

  // Deduplicate case-insensitively
  const uniqueRowsMap = new Map();
  mappedRows.forEach(row => {
    if (row.bookingId) {
      const cleanId = String(row.bookingId).trim().toLowerCase();
      if (cleanId) {
        uniqueRowsMap.set(cleanId, row);
      }
    }
  });
  const uniqueRows = Array.from(uniqueRowsMap.values());
  console.log(`De-duplicated to ${uniqueRows.length} unique cases.`);

  // 3. Upsert to Supabase
  const payload = uniqueRows.map(row => buildCaseRecord(row));

  console.log(`Upserting payloads to Supabase dashboard_cases table...`);
  const chunkSize = 200;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error: upsertErr } = await supabase
      .from('dashboard_cases')
      .upsert(chunk, { onConflict: 'booking_id' });

    if (upsertErr) {
      console.error(`Failed to upsert chunk starting at index ${i}:`, upsertErr.message);
      process.exit(1);
    }
  }

  console.log('--- BACKGROUND SYNC COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

runSync().catch(err => {
  console.error('Unexpected error in sync script:', err);
  process.exit(1);
});

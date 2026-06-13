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
  const payload = uniqueRows.map(row => ({
    booking_id: String(row.bookingId).trim(),
    row_data: row,
    updated_at: new Date().toISOString()
  }));

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

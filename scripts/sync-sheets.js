/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * background sync script: pulls Google Sheets data anonymously, 
 * parses it, and updates the Supabase DB cache.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  applyReturnedLeadStage,
  coerceCaseRowValue,
  createBaseCaseRow,
  normalizeHeaderKey,
  resolveCaseRowField,
} from '../src/data/caseRowSchema.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env variables must be set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Robust client-side CSV parser
function parseCsvRaw(text) {
  const lines = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

function normalizeStr(val) {
  return val
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/g, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/g, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')
    .replace(/  +/g, ' ');
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

  // 2. Query public CSV GViz url
  const targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  console.log(`Querying Sheets endpoint...`);
  
  const response = await fetch(targetUrl);
  if (!response.ok) {
    console.error(`Sheets API fetch failed. Status: ${response.status}`);
    process.exit(1);
  }

  const csvText = await response.text();
  const parsed = parseCsvRaw(csvText);
  if (parsed.length < 2) {
    console.error('GViz returned empty sheet or missing headers.');
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

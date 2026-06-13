/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseRow } from '../types';
import {
  applyReturnedLeadStage,
  coerceCaseRowValue,
  createBaseCaseRow,
  normalizeHeaderKey,
  resolveCaseRowField,
} from './caseRowSchema.js';

// Robust client-side CSV parser that handles quotes, line-breaks, and commas correctly
export function parseCsvRaw(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [''];
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


/**
 * Strips ALL whitespace — including non-breaking spaces (\u00A0), zero-width spaces (\u200B),
 * and other unicode whitespace that JS .trim() misses.
 */
function normalizeStr(val: string): string {
  return val
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/g, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/g, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')  // replace mid-string invisible chars with regular space
    .replace(/  +/g, ' ');  // collapse double spaces
}

export function mapCsvRows(parsed: string[][]): CaseRow[] {
  if (parsed.length < 2) {
    throw new Error('Dataset must contain a header row and at least one data row.');
  }

  const rawHeaders = parsed[0].map(normalizeHeaderKey);

  const result: CaseRow[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const line = parsed[i];
    if (line.every(cell => !cell.trim())) continue; // Skip blank lines

    // Create standard empty row object
    const rowObj: Record<string, any> = createBaseCaseRow(i + 1);

    // Map values dynamically
    line.forEach((cell, cellIndex) => {
      const headerName = rawHeaders[cellIndex];
      if (!headerName) return;

      const key = resolveCaseRowField(headerName) as keyof CaseRow | undefined;
      if (key) {
        const rawVal = normalizeStr(cell.trim());
        rowObj[key] = coerceCaseRowValue(key, rawVal);
      }
    });

    result.push(applyReturnedLeadStage(rowObj) as CaseRow);
  }

  return result;
}

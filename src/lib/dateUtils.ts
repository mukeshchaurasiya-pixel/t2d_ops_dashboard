/**
 * Safe date parser that handles multiple date string formats.
 * - Handles DD/MM/YYYY (common in spreadsheet exports / Indian locale)
 * - Handles YYYY-MM-DD (standard ISO date format)
 * - Safely handles times (e.g. HH:MM or HH:MM:SS) if appended.
 */
const dateCache = new Map<string, number>();

export function parseDateString(dateStr: string): Date | null {
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

function parseDateStringInternal(str: string): Date | null {

  // 1. Check for YYYY-MM-DD or YYYY-MM-DD HH:MM:SS (hyphen-separated with 4-digit year first)
  const yyyymmddRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+|T)?(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?/;
  const matchY = str.match(yyyymmddRegex);
  if (matchY) {
    const year = parseInt(matchY[1], 10);
    const month = parseInt(matchY[2], 10) - 1; // 0-indexed month
    const day = parseInt(matchY[3], 10);
    const hour = matchY[4] ? parseInt(matchY[4], 10) : 0;
    const minute = matchY[5] ? parseInt(matchY[5], 10) : 0;
    const second = matchY[6] ? parseInt(matchY[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  // 2. Check for DD/MM/YYYY or DD-MM-YYYY (slash or hyphen separated with 2 or 4 digit year last)
  const ddmmyyyyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/;
  const matchD = str.match(ddmmyyyyRegex);
  if (matchD) {
    const day = parseInt(matchD[1], 10);
    const month = parseInt(matchD[2], 10) - 1; // 0-indexed month
    let year = parseInt(matchD[3], 10);
    if (year < 100) {
      year += year < 50 ? 2000 : 1900; // handle 2-digit years
    }
    const hour = matchD[4] ? parseInt(matchD[4], 10) : 0;
    const minute = matchD[5] ? parseInt(matchD[5], 10) : 0;
    const second = matchD[6] ? parseInt(matchD[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }

  // 3. Fallback to default JavaScript parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

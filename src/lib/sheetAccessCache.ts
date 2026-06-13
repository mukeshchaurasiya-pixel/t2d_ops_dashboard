export function getSheetAccessCacheKeys(activeSheetId: string, activeUserEmail?: string | null) {
  const emailKey = String(activeUserEmail || 'anonymous').trim().toLowerCase();
  const suffix = `${emailKey}_${activeSheetId}`;

  return {
    verifiedKey: `cars24_sheet_access_verified_${suffix}`,
    timeKey: `cars24_sheet_access_time_${suffix}`,
    legacyVerifiedKey: `cars24_sheet_access_verified_${activeSheetId}`,
    legacyTimeKey: `cars24_sheet_access_time_${activeSheetId}`,
  };
}

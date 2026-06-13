import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { CaseRow } from '../types';

type SyncCasesArgs = {
  accessToken: string;
  sheetId: string;
  sheetName: string;
  userEmail?: string | null;
  replaceRowsOnEmpty?: boolean;
  updateTimestampOnEmpty?: boolean;
};

export function useCaseData(
  setRows: Dispatch<SetStateAction<CaseRow[]>>,
  updateLastSynced: (date: Date) => void
) {
  const [syncing, setSyncing] = useState<boolean>(false);

  const loadCachedRows = useCallback(async () => {
    const { getCasesFromDb } = await import('../lib/supabaseDb');
    const dbRows = await getCasesFromDb();

    if (dbRows.length > 0) {
      setRows(dbRows);
      if (!localStorage.getItem('cars24_lastSynced')) {
        updateLastSynced(new Date());
      }
    }

    return dbRows;
  }, [setRows, updateLastSynced]);

  const syncCasesFromSheets = useCallback(async ({
    accessToken,
    sheetId,
    sheetName,
    userEmail,
    replaceRowsOnEmpty = false,
    updateTimestampOnEmpty = false,
  }: SyncCasesArgs) => {
    setSyncing(true);

    try {
      const { fetchSheetDataDirect } = await import('../lib/sheetsService');
      const { upsertCasesToDb } = await import('../lib/supabaseDb');

      const sheetRows = await fetchSheetDataDirect(sheetId, sheetName, accessToken, userEmail);

      if (sheetRows.length > 0) {
        await upsertCasesToDb(sheetRows, userEmail || 'system_sync');
        setRows(sheetRows);
        updateLastSynced(new Date());
      } else {
        if (replaceRowsOnEmpty) {
          setRows(sheetRows);
        }
        if (updateTimestampOnEmpty) {
          updateLastSynced(new Date());
        }
      }

      return sheetRows;
    } finally {
      setSyncing(false);
    }
  }, [setRows, updateLastSynced]);

  return {
    syncing,
    loadCachedRows,
    syncCasesFromSheets,
  };
}

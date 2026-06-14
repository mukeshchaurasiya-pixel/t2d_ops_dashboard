import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { CaseRow } from '../types';
import type { DashboardCacheImportStats } from '../lib/supabaseDb';

type SyncCasesArgs = {
  accessToken: string;
  sheetId: string;
  sheetName: string;
  userEmail?: string | null;
  replaceRowsOnEmpty?: boolean;
  updateTimestampOnEmpty?: boolean;
};

type SyncCasesResult = {
  sheetRows: CaseRow[];
  importStats: DashboardCacheImportStats | null;
};

export function useCaseData(
  setRows: Dispatch<SetStateAction<CaseRow[]>>,
  updateLastSynced: (date: Date) => void
) {
  const [syncing, setSyncing] = useState<boolean>(false);

  const loadCachedRows = useCallback(async () => {
    const { getCasesPageFromDb } = await import('../lib/supabaseDb');
    const dbPage = await getCasesPageFromDb({
      page: 1,
      pageSize: 15,
      sortField: 'tokenDate',
      sortDirection: 'desc',
      filters: {},
    });
    const dbRows = dbPage.rows;

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
  }: SyncCasesArgs): Promise<SyncCasesResult> => {
    setSyncing(true);

    try {
      const { fetchSheetDataDirect } = await import('../lib/sheetsService');
      const { upsertCasesToDb } = await import('../lib/supabaseDb');

      const sheetRows = await fetchSheetDataDirect(sheetId, sheetName, accessToken, userEmail);

      if (sheetRows.length > 0) {
        const importStats = await upsertCasesToDb(sheetRows, userEmail || 'system_sync');
        updateLastSynced(new Date());
        return {
          sheetRows,
          importStats,
        };
      } else {
        if (replaceRowsOnEmpty) {
          setRows(sheetRows);
        }
        if (updateTimestampOnEmpty) {
          updateLastSynced(new Date());
        }
        return {
          sheetRows,
          importStats: null,
        };
      }
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

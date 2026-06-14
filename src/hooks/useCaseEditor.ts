import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { AppUser } from '../lib/firebaseAuth';
import { AuditLog, CaseEditorDraft, CaseRow } from '../types';

type UseCaseEditorArgs = {
  accessToken: string | null;
  rows: CaseRow[];
  setRows: Dispatch<SetStateAction<CaseRow[]>>;
  sheetId: string;
  sheetName: string;
  user: AppUser | null;
  onAfterSave?: () => void | Promise<void>;
};

function buildInitialDraft(row: CaseRow): CaseEditorDraft {
  return {
    readyToDeliver: row.readyToDeliver || '',
    expectedOdCompletionDate: row.expectedOdCompletionDate || '',
    eddReviewerDate: row.eddReviewerDate || '',
    reviewerRemarks: row.reviewerRemarks || '',
    latestRemark: row.latestRemark || '',
    latestRemarkBy: row.latestRemarkBy || '',
    latestRemarkDate: row.latestRemarkDate || '',
    newRemarkAddition: '',
  };
}

export function useCaseEditor({
  accessToken,
  rows,
  setRows,
  sheetId,
  sheetName,
  user,
  onAfterSave,
}: UseCaseEditorArgs) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [tempRowData, setTempRowData] = useState<CaseEditorDraft>({});
  const [savingRow, setSavingRow] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fetchingLatestRow, setFetchingLatestRow] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  const selectedRow = selectedBookingId
    ? rows.find(row => row.bookingId === selectedBookingId) ?? null
    : null;

  useEffect(() => {
    if (!selectedRow?.bookingId) {
      setAuditLogs([]);
      return;
    }

    const fetchLogs = async () => {
      setLoadingAuditLogs(true);
      try {
        const { getAuditLogs } = await import('../lib/supabaseDb');
        const logs = await getAuditLogs(selectedRow.bookingId);
        setAuditLogs(logs);
      } catch (err) {
        console.warn('Failed to fetch audit logs for booking:', err);
      } finally {
        setLoadingAuditLogs(false);
      }
    };

    void fetchLogs();
  }, [selectedRow?.bookingId]);

  const closeEditor = useCallback(() => {
    setSelectedBookingId(null);
  }, []);

  const handleEditRowClick = useCallback(async (bookingId: string) => {
    const originalRow = rows.find(row => row.bookingId === bookingId);
    if (!originalRow) return;

    setSelectedBookingId(originalRow.bookingId);
    setTempRowData(buildInitialDraft(originalRow));

    if (!accessToken) {
      return;
    }

    setFetchingLatestRow(true);
    try {
      const { fetchSingleRowLatest } = await import('../lib/sheetsService');
      const latestFields = await fetchSingleRowLatest(sheetId, sheetName, accessToken, originalRow._rowNumber);

      setTempRowData(prev => ({
        ...prev,
        readyToDeliver: latestFields.readyToDeliver !== undefined ? (latestFields.readyToDeliver || '') : prev.readyToDeliver,
        expectedOdCompletionDate: latestFields.expectedOdCompletionDate !== undefined ? (latestFields.expectedOdCompletionDate || '') : prev.expectedOdCompletionDate,
        eddReviewerDate: latestFields.eddReviewerDate !== undefined ? (latestFields.eddReviewerDate || '') : prev.eddReviewerDate,
        reviewerRemarks: latestFields.reviewerRemarks !== undefined ? (latestFields.reviewerRemarks || '') : prev.reviewerRemarks,
        latestRemark: latestFields.latestRemark !== undefined ? (latestFields.latestRemark || '') : prev.latestRemark,
        latestRemarkBy: latestFields.latestRemarkBy !== undefined ? (latestFields.latestRemarkBy || '') : prev.latestRemarkBy,
        latestRemarkDate: latestFields.latestRemarkDate !== undefined ? (latestFields.latestRemarkDate || '') : prev.latestRemarkDate,
      }));

      setRows(prevRows => prevRows.map(row => {
        if (row.bookingId === originalRow.bookingId) {
          return {
            ...row,
            ...latestFields,
          };
        }
        return row;
      }));
    } catch (err) {
      console.warn('Failed to retrieve latest single-row data:', err);
    } finally {
      setFetchingLatestRow(false);
    }
  }, [accessToken, rows, setRows, sheetId, sheetName]);

  const handleSaveActionables = useCallback(async () => {
    if (!selectedRow) return;
    if (!user) {
      alert('Please connect your Google Account to edit actionables.');
      return;
    }

    const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const originalRemarks = tempRowData.reviewerRemarks || '';
    const newAddition = tempRowData.newRemarkAddition || '';

    let combinedRemarks = originalRemarks;
    if (newAddition.trim()) {
      const emailSuffix = user.email ? ` (${user.email.split('@')[0]})` : '';
      const dateStr = new Date().toISOString().slice(0, 10);
      combinedRemarks = originalRemarks
        ? `${originalRemarks}\n\n[${dateStr}${emailSuffix}]: ${newAddition.trim()}`
        : `[${dateStr}${emailSuffix}]: ${newAddition.trim()}`;
    }

    setSavingRow(true);
    try {
      const updatedRowBase: CaseRow = {
        ...selectedRow,
        ...tempRowData,
        reviewerRemarks: combinedRemarks,
        updatedAt: timestampStr,
      };

      delete (updatedRowBase as CaseEditorDraft).newRemarkAddition;

      const { updateSingleCaseInDb } = await import('../lib/supabaseDb');
      await updateSingleCaseInDb(selectedRow.bookingId, updatedRowBase, user.email || 'unknown_user');

      if (accessToken) {
        const { writeActionablesToSheet } = await import('../lib/sheetsService');
        await writeActionablesToSheet(sheetId, sheetName, accessToken, selectedRow._rowNumber, {
          readyToDeliver: updatedRowBase.readyToDeliver,
          expectedOdCompletionDate: updatedRowBase.expectedOdCompletionDate,
          eddReviewerDate: updatedRowBase.eddReviewerDate,
          reviewerRemarks: updatedRowBase.reviewerRemarks,
          updatedAt: updatedRowBase.updatedAt,
        });
      }

      setRows(prevRows => prevRows.map(row => row.bookingId === selectedRow.bookingId ? updatedRowBase : row));
      setSaveSuccess(true);
      setSelectedBookingId(null);
      if (onAfterSave) {
        await onAfterSave();
      }
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error('Failed to save to database or Google Sheet:', err);
      alert(`Failed to save: ${err.message || err}\n\nYour changes are saved locally in this session.`);

      const fallbackRow: CaseRow = {
        ...selectedRow,
        ...tempRowData,
        reviewerRemarks: combinedRemarks,
        updatedAt: timestampStr,
      };
      delete (fallbackRow as CaseEditorDraft).newRemarkAddition;

      setRows(prevRows => prevRows.map(row => row.bookingId === selectedRow.bookingId ? fallbackRow : row));
      setSelectedBookingId(null);
    } finally {
      setSavingRow(false);
    }
  }, [accessToken, onAfterSave, selectedRow, setRows, sheetId, sheetName, tempRowData, user]);

  return {
    selectedBookingId,
    selectedRow,
    tempRowData,
    setTempRowData,
    savingRow,
    saveSuccess,
    fetchingLatestRow,
    auditLogs,
    loadingAuditLogs,
    closeEditor,
    handleEditRowClick,
    handleSaveActionables,
  };
}

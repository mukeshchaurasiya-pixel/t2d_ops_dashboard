import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { AppUser } from '../lib/firebaseAuth';
import { AuditLog, CaseEditorDraft, CaseRow } from '../types';
import { toInputDateFormat, toSheetDateFormat } from '../lib/dateUtils';

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
    onDemandStatus: row.onDemandStatus || '',
    deliveryStatus: row.deliveryStatus || '',
    expectedOdCompletionDate: toInputDateFormat(row.expectedOdCompletionDate),
    eddReviewerDate: toInputDateFormat(row.eddReviewerDate),
    expectedDeliveryDate: toInputDateFormat(row.expectedDeliveryDate),
    cancelReqDate: toInputDateFormat(row.cancelReqDate),
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
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
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
        onDemandStatus: latestFields.onDemandStatus !== undefined ? (latestFields.onDemandStatus || '') : prev.onDemandStatus,
        deliveryStatus: latestFields.deliveryStatus !== undefined ? (latestFields.deliveryStatus || '') : prev.deliveryStatus,
        expectedOdCompletionDate: latestFields.expectedOdCompletionDate !== undefined ? toInputDateFormat(latestFields.expectedOdCompletionDate) : prev.expectedOdCompletionDate,
        eddReviewerDate: latestFields.eddReviewerDate !== undefined ? toInputDateFormat(latestFields.eddReviewerDate) : prev.eddReviewerDate,
        expectedDeliveryDate: latestFields.expectedDeliveryDate !== undefined ? toInputDateFormat(latestFields.expectedDeliveryDate) : prev.expectedDeliveryDate,
        cancelReqDate: latestFields.cancelReqDate !== undefined ? toInputDateFormat(latestFields.cancelReqDate) : prev.cancelReqDate,
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
      alert('Please sign in to edit actionables.');
      return;
    }

    const timestampStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const originalRemarks = tempRowData.reviewerRemarks || '';
    const newAddition = tempRowData.newRemarkAddition || '';

    const formattedExpectedOd = toSheetDateFormat(tempRowData.expectedOdCompletionDate);
    const formattedEddReviewer = toSheetDateFormat(tempRowData.eddReviewerDate);
    const formattedExpectedDelivery = toSheetDateFormat(tempRowData.expectedDeliveryDate);
    const formattedCancelReq = toSheetDateFormat(tempRowData.cancelReqDate);

    let combinedRemarks = originalRemarks;
    if (newAddition.trim()) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const dateStr = `${dd}/${mm}/${yyyy}`;
      const username = user.email ? user.email.split('@')[0] : 'user';
      const remarkLine = `\n[${dateStr}] ${username}: ${newAddition.trim()}`;
      combinedRemarks = originalRemarks
        ? `${originalRemarks}${remarkLine}`
        : remarkLine.trim();
    }

    setSavingRow(true);
    try {
      const updatedRowBase: CaseRow = {
        ...selectedRow,
        ...tempRowData,
        expectedOdCompletionDate: formattedExpectedOd,
        eddReviewerDate: formattedEddReviewer,
        expectedDeliveryDate: formattedExpectedDelivery,
        cancelReqDate: formattedCancelReq,
        reviewerRemarks: combinedRemarks,
        updatedAt: timestampStr,
        syncPending: !accessToken,
      };

      delete (updatedRowBase as CaseEditorDraft).newRemarkAddition;

      const { updateSingleCaseInDb } = await import('../lib/supabaseDb');
      await updateSingleCaseInDb(selectedRow.bookingId, updatedRowBase, user.email || 'unknown_user');

      if (accessToken) {
        const { writeActionablesToSheet } = await import('../lib/sheetsService');
        await writeActionablesToSheet(sheetId, sheetName, accessToken, selectedRow._rowNumber, {
          readyToDeliver: updatedRowBase.readyToDeliver,
          onDemandStatus: updatedRowBase.onDemandStatus,
          deliveryStatus: updatedRowBase.deliveryStatus,
          expectedOdCompletionDate: updatedRowBase.expectedOdCompletionDate,
          eddReviewerDate: updatedRowBase.eddReviewerDate,
          expectedDeliveryDate: updatedRowBase.expectedDeliveryDate,
          cancelReqDate: updatedRowBase.cancelReqDate,
          reviewerRemarks: updatedRowBase.reviewerRemarks,
          updatedAt: updatedRowBase.updatedAt,
        });
      } else {
        setSaveFeedback("Saved offline to DB. Edits will sync back to Google Sheets once connected.");
      }

      setRows(prevRows => prevRows.map(row => row.bookingId === selectedRow.bookingId ? updatedRowBase : row));
      setSaveSuccess(true);
      if (accessToken) {
        setSaveFeedback("Updated and synced to Google Sheets successfully.");
      }
      if (onAfterSave) {
        await onAfterSave();
      }
      setTimeout(() => {
        setSaveSuccess(false);
        setSaveFeedback(null);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to save to database or Google Sheet:', err);
      setSaveFeedback(`Failed to save: ${err.message || err}`);
      setTimeout(() => setSaveFeedback(null), 5000);

      const fallbackRow: CaseRow = {
        ...selectedRow,
        ...tempRowData,
        reviewerRemarks: combinedRemarks,
        updatedAt: timestampStr,
      };
      delete (fallbackRow as CaseEditorDraft).newRemarkAddition;

      setRows(prevRows => prevRows.map(row => row.bookingId === selectedRow.bookingId ? fallbackRow : row));
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
    saveFeedback,
    fetchingLatestRow,
    auditLogs,
    loadingAuditLogs,
    closeEditor,
    handleEditRowClick,
    handleSaveActionables,
  };
}

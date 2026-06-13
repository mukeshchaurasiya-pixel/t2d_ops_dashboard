import { useEffect, useState } from 'react';

const DEFAULT_SHEET_ID = '1ARJ8AzOwNxqdTZA7bd7zPAacabIoBImXqReqzSTrIy4';
const DEFAULT_SHEET_NAME = 'Sheet1';
const SHEET_ID_STORAGE_KEY = 'cars24_sheetId';
const SHEET_NAME_STORAGE_KEY = 'cars24_sheetName';

export function useSheetConfig() {
  const [sheetId, setSheetId] = useState<string>(() => localStorage.getItem(SHEET_ID_STORAGE_KEY) || DEFAULT_SHEET_ID);
  const [sheetName, setSheetName] = useState<string>(() => localStorage.getItem(SHEET_NAME_STORAGE_KEY) || DEFAULT_SHEET_NAME);
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [tempSheetId, setTempSheetId] = useState<string>(() => localStorage.getItem(SHEET_ID_STORAGE_KEY) || DEFAULT_SHEET_ID);
  const [tempSheetName, setTempSheetName] = useState<string>(() => localStorage.getItem(SHEET_NAME_STORAGE_KEY) || DEFAULT_SHEET_NAME);

  useEffect(() => {
    localStorage.setItem(SHEET_ID_STORAGE_KEY, sheetId);
  }, [sheetId]);

  useEffect(() => {
    localStorage.setItem(SHEET_NAME_STORAGE_KEY, sheetName);
  }, [sheetName]);

  return {
    sheetId,
    setSheetId,
    sheetName,
    setSheetName,
    showConfigPanel,
    setShowConfigPanel,
    tempSheetId,
    setTempSheetId,
    tempSheetName,
    setTempSheetName,
  };
}

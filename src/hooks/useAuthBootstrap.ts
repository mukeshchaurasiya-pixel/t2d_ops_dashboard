import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { CaseRow } from '../types';
import { AppUser, initAuth } from '../lib/firebaseAuth';
import { getSheetAccessCacheKeys } from '../lib/sheetAccessCache';

type SyncCasesFromSheets = (args: {
  accessToken: string;
  sheetId: string;
  sheetName: string;
  userEmail?: string | null;
}) => Promise<CaseRow[]>;

type UseAuthBootstrapArgs = {
  sheetId: string;
  sheetName: string;
  setSheetId: Dispatch<SetStateAction<string>>;
  setSheetName: Dispatch<SetStateAction<string>>;
  setRows: Dispatch<SetStateAction<CaseRow[]>>;
  loadCachedRows: () => Promise<CaseRow[]>;
  syncCasesFromSheets: SyncCasesFromSheets;
};

async function resolveSharedSheetConfig(
  sheetId: string,
  sheetName: string,
  setSheetId: Dispatch<SetStateAction<string>>,
  setSheetName: Dispatch<SetStateAction<string>>,
  authedUser?: AppUser | null
) {
  let activeSheetId = sheetId;
  let activeSheetName = sheetName;

  try {
    const { getSharedConfig, saveSharedConfig } = await import('../lib/firebaseAuth');
    const sharedConfig = await getSharedConfig();

    if (sharedConfig?.sheetId) {
      activeSheetId = sharedConfig.sheetId;
      activeSheetName = sharedConfig.sheetName;
      setSheetId(sharedConfig.sheetId);
      setSheetName(sharedConfig.sheetName);
    } else if (sheetId && authedUser) {
      try {
        await saveSharedConfig(sheetId, sheetName, authedUser.email || '');
      } catch (persistError) {
        console.warn('Could not auto-sync config on auth restore:', persistError);
      }
    }
  } catch (sharedConfigError) {
    console.warn('Failed to retrieve shared workspace config:', sharedConfigError);
  }

  return { activeSheetId, activeSheetName };
}

export function useAuthBootstrap({
  sheetId,
  sheetName,
  setSheetId,
  setSheetName,
  setRows,
  loadCachedRows,
  syncCasesFromSheets,
}: UseAuthBootstrapArgs) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const loadInitialCache = async () => {
      setRestoreLoading(true);
      try {
        await loadCachedRows();
      } catch (err) {
        console.warn('Could not load initial cached cases from Supabase DB:', err);
      } finally {
        setRestoreLoading(false);
      }
    };

    void loadInitialCache();
  }, [loadCachedRows]);

  useEffect(() => {
    const unsubscribe = initAuth(
      async (authedUser, token) => {
        setRestoreLoading(true);
        setLoginError(null);

        const { activeSheetId, activeSheetName } = await resolveSharedSheetConfig(
          sheetId,
          sheetName,
          setSheetId,
          setSheetName,
          authedUser
        );

        const cacheKeys = getSheetAccessCacheKeys(activeSheetId, authedUser.email);
        const cachedVerified = localStorage.getItem(cacheKeys.verifiedKey) === 'true';
        const cachedTime = Number(localStorage.getItem(cacheKeys.timeKey) || 0);
        const isCacheValid = Date.now() - cachedTime < 7 * 24 * 60 * 60 * 1000;

        if (cachedVerified && isCacheValid) {
          setUser(authedUser);
          setAccessToken(token);
          setRestoreLoading(false);

          if (token) {
            void syncCasesFromSheets({
              accessToken: token,
              sheetId: activeSheetId,
              sheetName: activeSheetName,
              userEmail: authedUser.email,
            }).catch(err => console.warn('Background auto-sync failed:', err));
          }

          return;
        }

        if (token) {
          try {
            const { verifySheetAccess } = await import('../lib/sheetsService');
            const hasAccess = await verifySheetAccess(activeSheetId, token);

            if (hasAccess) {
              localStorage.setItem(cacheKeys.verifiedKey, 'true');
              localStorage.setItem(cacheKeys.timeKey, String(Date.now()));
              localStorage.removeItem(cacheKeys.legacyVerifiedKey);
              localStorage.removeItem(cacheKeys.legacyTimeKey);
              setUser(authedUser);
              setAccessToken(token);
              void syncCasesFromSheets({
                accessToken: token,
                sheetId: activeSheetId,
                sheetName: activeSheetName,
                userEmail: authedUser.email,
              }).catch(err => console.warn('Background auto-sync failed:', err));
            } else {
              setLoginError('Restricted Access: Your Google account does not have view permission on the configured Google Sheet.');
              setUser(authedUser);
              setAccessToken(null);
              setRows([]);
              localStorage.removeItem(cacheKeys.verifiedKey);
              localStorage.removeItem(cacheKeys.timeKey);
              localStorage.removeItem(cacheKeys.legacyVerifiedKey);
              localStorage.removeItem(cacheKeys.legacyTimeKey);
            }
          } catch (err: any) {
            console.error('Access verification error:', err);
            setLoginError(`Verification failed: ${err.message || err}`);
          }
        } else {
          setLoginError('Google authentication expired. Please sign in again to verify sheet access permissions.');
          setUser(null);
          setAccessToken(null);
        }

        setRestoreLoading(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, [sheetId, sheetName, setSheetId, setSheetName, setRows, syncCasesFromSheets]);

  return {
    user,
    setUser,
    accessToken,
    setAccessToken,
    restoreLoading,
    setRestoreLoading,
    demoMode,
    setDemoMode,
    loginError,
    setLoginError,
  };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Building, RefreshCcw, LogOut, AlertCircle, FileSpreadsheet, Lock, HelpCircle, Settings, Database, Save, ExternalLink, Clock, ArrowLeft, History, RefreshCw
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import { CaseRow, UserSession, AuditLog } from './types';
import { SEED_CASE_ROWS } from './data/mockData';
import { initAuth, logout, AppUser } from './lib/firebaseAuth';
import { getCleanSpreadsheetId } from './lib/sheetsService';

export default function App() {
  const [rows, setRows] = useState<CaseRow[]>(SEED_CASE_ROWS);

  // Sync state tracking
  const [lastSynced, setLastSynced] = useState<Date | null>(() => {
    const val = localStorage.getItem('cars24_lastSynced');
    return val ? new Date(val) : null;
  });
  const [syncStatusText, setSyncStatusText] = useState<string>('Never synced');

  const updateLastSynced = (date: Date) => {
    setLastSynced(date);
    localStorage.setItem('cars24_lastSynced', date.toISOString());
  };

  // Relative time helper
  const getRelativeTimeString = (date: Date | null) => {
    if (!date) return 'Never synced';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) {
      return 'Just now';
    }
    if (diffMins < 60) {
      return `Last synced: ${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `Last synced: ${diffHours}h ago`;
    }
    return `Last synced: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  useEffect(() => {
    const updateText = () => {
      setSyncStatusText(getRelativeTimeString(lastSynced));
    };
    updateText();
    const interval = setInterval(updateText, 10000);
    return () => clearInterval(interval);
  }, [lastSynced]);

  // Spreadsheet Settings State - Persistent locally in browser storage
  const [sheetId, setSheetId] = useState<string>(() => localStorage.getItem('cars24_sheetId') || '1ARJ8AzOwNxqdTZA7bd7zPAacabIoBImXqReqzSTrIy4');
  const [sheetName, setSheetName] = useState<string>(() => localStorage.getItem('cars24_sheetName') || 'Sheet1');
  const [appTitle, setAppTitle] = useState<string>('CARS24 T2D Ops Dashboard');

  // Admin configuration state (accessible by Mukesh only)
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [tempSheetId, setTempSheetId] = useState<string>(() => localStorage.getItem('cars24_sheetId') || '1ARJ8AzOwNxqdTZA7bd7zPAacabIoBImXqReqzSTrIy4');
  const [tempSheetName, setTempSheetName] = useState<string>(() => localStorage.getItem('cars24_sheetName') || 'Sheet1');

  // Authentication & State Preservation Loader/Control States
  const [user, setUser] = useState<AppUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Routing and View States
  const [viewMode, setViewMode] = useState<'dashboard' | 'admin'>('dashboard');
  const [adminTab, setAdminTab] = useState<'settings' | 'sessions' | 'audits'>('settings');

  // Session tracking & active minutes states
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
  const [globalAuditLogs, setGlobalAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudits, setLoadingAudits] = useState<boolean>(false);

  // Check if current user is an admin
  const isAdmin = useMemo(() => {
    if (!user || !user.email) return false;
    const emailLower = user.email.toLowerCase().trim();
    return emailLower === 'mukesh.chaurasiya@cars24.com' || emailLower === 'chourasiyamukesh008@gmail.com';
  }, [user]);

  // Fetch session history and audit logs
  const fetchAdminData = async () => {
    if (!isAdmin) return;
    setLoadingSessions(true);
    setLoadingAudits(true);
    try {
      const { getUserSessions, getAllAuditLogs } = await import('./lib/supabaseDb');
      
      const sessionPromise = getUserSessions()
        .then(res => setUserSessions(res))
        .catch(err => console.warn(err));

      const auditPromise = getAllAuditLogs()
        .then(res => setGlobalAuditLogs(res))
        .catch(err => console.warn(err));

      await Promise.all([sessionPromise, auditPromise]);
    } catch (err) {
      console.warn("Failed to load admin logs:", err);
    } finally {
      setLoadingSessions(false);
      setLoadingAudits(false);
    }
  };

  // User Session Heartbeat Activity Tracking
  useEffect(() => {
    if (!user || !user.email || demoMode) {
      setActiveSessionId(null);
      return;
    }

    let sessionId: string | null = null;
    let heartbeatInterval: any = null;

    const initSession = async () => {
      try {
        const { startUserSession, heartbeatUserSession } = await import('./lib/supabaseDb');
        sessionId = await startUserSession(user.email!);
        setActiveSessionId(sessionId);

        // Run heartbeat every 1 minute (60,000 ms)
        heartbeatInterval = setInterval(async () => {
          if (sessionId) {
            await heartbeatUserSession(sessionId);
          }
        }, 60000);
      } catch (err) {
        console.warn("Could not track user session activity:", err);
      }
    };

    initSession();

    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [user?.email, demoMode]);

  // Fetch session history and audit logs for admin when toggled
  useEffect(() => {
    if (viewMode === 'admin' && isAdmin) {
      fetchAdminData();
    }
  }, [viewMode, isAdmin]);

  // Handler to persist settings and re-query spreadsheet automatically
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = getCleanSpreadsheetId(tempSheetId);
    setSheetId(cleanId);
    setSheetName(tempSheetName);
    setShowConfigPanel(false);
    
    // Instantly trigger re-sync and write to Firestore if authenticated
    if (user) {
      setRestoreLoading(true);
      try {
        const { saveSharedConfig } = await import('./lib/firebaseAuth');
        await saveSharedConfig(cleanId, tempSheetName, user.email || '');

        if (accessToken) {
          const { fetchSheetDataDirect } = await import('./lib/sheetsService');
          const sheetRows = await fetchSheetDataDirect(cleanId, tempSheetName, accessToken, user.email);
          setRows(sheetRows);
          updateLastSynced(new Date());
          setLoginError(null);
          alert("Configuration saved and globally synchronized!");
        } else {
          alert("Configuration saved and globally synced! Please log in to visualize spreadsheet rows.");
        }
      } catch (err: any) {
        console.error("Failed to save and sync spreadsheet config:", err);
        alert(`Configuration updated locally, but we could not read from Google Sheets:\n${err.message || err}\n\nPlease check your Sheet ID or permissions.`);
        setLoginError(err.message || err);
        setRows([]); // Data will be only loaded who has access to sheet
      } finally {
        setRestoreLoading(false);
      }
    } else {
      alert("Offline configuration updated successfully.");
    }
  };

  // Synchronize spreadsheet parameters with localStorage
  useEffect(() => {
    localStorage.setItem('cars24_sheetId', sheetId);
  }, [sheetId]);

  useEffect(() => {
    localStorage.setItem('cars24_sheetName', sheetName);
  }, [sheetName]);

  // Load initial data snapshot from Supabase DB on mount
  useEffect(() => {
    const loadCache = async () => {
      setRestoreLoading(true);
      try {
        const { getCasesFromDb } = await import('./lib/supabaseDb');
        const dbRows = await getCasesFromDb();
        if (dbRows && dbRows.length > 0) {
          setRows(dbRows);
          if (!localStorage.getItem('cars24_lastSynced')) {
            updateLastSynced(new Date());
          }
        }
      } catch (err) {
        console.warn("Could not load initial cached cases from Supabase DB:", err);
      } finally {
        setRestoreLoading(false);
      }
    };
    loadCache();
  }, []);

  const triggerAutoSync = async (activeToken: string, activeSheetId: string, activeSheetName: string, userEmail: string | null) => {
    setSyncing(true);
    try {
      const { fetchSheetDataDirect } = await import('./lib/sheetsService');
      const { upsertCasesToDb } = await import('./lib/supabaseDb');
      
      const sheetRows = await fetchSheetDataDirect(activeSheetId, activeSheetName, activeToken, userEmail);
      if (sheetRows && sheetRows.length > 0) {
        await upsertCasesToDb(sheetRows, userEmail || 'system_sync');
        setRows(sheetRows);
        updateLastSynced(new Date());
        console.log(`Auto-synchronized ${sheetRows.length} rows from Google Sheets.`);
      }
    } catch (err) {
      console.warn("Background auto-sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  // Auth subscriber to auto-load saved state on boot or login
  useEffect(() => {
    const unsubscribe = initAuth(
      async (authedUser, token) => {
        let activeSheetId = sheetId;
        let activeSheetName = sheetName;

        setRestoreLoading(true);
        setLoginError(null);

        try {
          // Fetch the globally synced spreadsheet configurations from Firestore first
          const { getSharedConfig, saveSharedConfig } = await import('./lib/firebaseAuth');
          const sharedConfig = await getSharedConfig();
          if (sharedConfig?.sheetId) {
            activeSheetId = sharedConfig.sheetId;
            activeSheetName = sharedConfig.sheetName;
            setSheetId(sharedConfig.sheetId);
            setSheetName(sharedConfig.sheetName);
          } else if (sheetId && authedUser) {
            // Seed Firestore with the active config so state persists for someone else who logs in
            try {
              await saveSharedConfig(sheetId, sheetName, authedUser.email || '');
            } catch (pErr) {
              console.warn("Could not auto-sync config to Firestore on auth listener:", pErr);
            }
          }
        } catch (dbErr) {
          console.warn("Failed to retrieve global Firestore workspace config:", dbErr);
        }

        // --- SHEET ACCESS SECURITY CHECK ---
        const cacheKey = `cars24_sheet_access_verified_${activeSheetId}`;
        const cacheTimeKey = `cars24_sheet_access_time_${activeSheetId}`;
        
        const cachedVerified = localStorage.getItem(cacheKey) === 'true';
        const cachedTime = Number(localStorage.getItem(cacheTimeKey) || 0);
        const isCacheValid = Date.now() - cachedTime < 7 * 24 * 60 * 60 * 1000; // 7 days cache validity

        if (cachedVerified && isCacheValid) {
          // Access is already verified recently, load immediately from DB cache without forcing Google re-login!
          setUser(authedUser);
          setAccessToken(token);
          setRestoreLoading(false);
          if (token) {
            triggerAutoSync(token, activeSheetId, activeSheetName, authedUser.email);
          }
          return;
        }

        if (token) {
          // Verify access using active Google token
          try {
            const { verifySheetAccess } = await import('./lib/sheetsService');
            const hasAccess = await verifySheetAccess(activeSheetId, token);
            if (hasAccess) {
              localStorage.setItem(cacheKey, 'true');
              localStorage.setItem(cacheTimeKey, String(Date.now()));
              setUser(authedUser);
              setAccessToken(token);
              triggerAutoSync(token, activeSheetId, activeSheetName, authedUser.email);
            } else {
              console.warn("Google Sheet access verification failed.");
              setLoginError("Restricted Access: Your Google account does not have view permission on the configured Google Sheet.");
              setUser(authedUser);
              setAccessToken(null);
              setRows([]);
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(cacheTimeKey);
            }
          } catch (err: any) {
            console.error("Access verification error:", err);
            setLoginError(`Verification failed: ${err.message || err}`);
          }
        } else {
          // No active token and cache is expired/missing
          console.warn("No active Google token to verify sheet access.");
          setLoginError("Google authentication expired. Please sign in again to verify sheet access permissions.");
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
  }, [sheetId, sheetName]);

  // Dynamically analyze rows to provide filter options for Dashboard
  const filterOptions = useMemo(() => {
    const citiesSet = new Set<string>();
    const hubsSet = new Set<string>();
    const tokenTypeSet = new Set<string>();
    const tokenTypeWithNrtSet = new Set<string>();
    const rmSet = new Set<string>();
    const dcSet = new Set<string>();
    const paymentSet = new Set<string>();
    const stagesSet = new Set<string>();
    const dealSet = new Set<string>();
    const funnelSet = new Set<string>();
    const sheetFinalSet = new Set<string>();
    const formFinalSet = new Set<string>();
    const gmailPendencySet = new Set<string>();

    rows.forEach(row => {
      if (row.city) citiesSet.add(row.city);
      if (row.hubName) hubsSet.add(row.hubName);
      if (row.tokenType) tokenTypeSet.add(row.tokenType);
      if (row.tokenTypeWithNrt) tokenTypeWithNrtSet.add(row.tokenTypeWithNrt);
      if (row.allocatedRm) rmSet.add(row.allocatedRm);
      if (row.assignedDc) dcSet.add(row.assignedDc);
      if (row.paymentType) paymentSet.add(row.paymentType);
      if (row.leadStage) stagesSet.add(row.leadStage);
      if (row.dealStatus) dealSet.add(row.dealStatus);
      if (row.funnelStage) funnelSet.add(row.funnelStage);
      if (row.sheetFinalStatus) sheetFinalSet.add(row.sheetFinalStatus);
      if (row.formFinalStatus) formFinalSet.add(row.formFinalStatus);
      if (row.gmailPendencyStatus) gmailPendencySet.add(row.gmailPendencyStatus);
    });

    return {
      cities: Array.from(citiesSet).sort(),
      hubs: Array.from(hubsSet).sort(),
      tokenTypes: Array.from(tokenTypeSet).sort(),
      tokenTypesWithNrt: Array.from(tokenTypeWithNrtSet).sort(),
      rms: Array.from(rmSet).sort(),
      dcs: Array.from(dcSet).sort(),
      paymentTypes: Array.from(paymentSet).sort(),
      leadStages: Array.from(stagesSet).sort(),
      dealStatuses: Array.from(dealSet).sort(),
      funnelStages: Array.from(funnelSet).sort(),
      sheetFinalStatuses: Array.from(sheetFinalSet).sort(),
      formFinalStatuses: Array.from(formFinalSet).sort(),
      gmailPendencyStatuses: Array.from(gmailPendencySet).sort(),
    };
  }, [rows]);

  const handleSignIn = async () => {
    setRestoreLoading(true);
    setLoginError(null);
    try {
      const { googleSignIn, getSharedConfig, saveSharedConfig } = await import('./lib/firebaseAuth');
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        
        let activeSheetId = sheetId;
        let activeSheetName = sheetName;

        // Fetch shared configuration from Firestore first
        try {
          const sharedConfig = await getSharedConfig();
          if (sharedConfig?.sheetId) {
            activeSheetId = sharedConfig.sheetId;
            activeSheetName = sharedConfig.sheetName;
            setSheetId(sharedConfig.sheetId);
            setSheetName(sharedConfig.sheetName);
          } else {
            try {
              await saveSharedConfig(activeSheetId, activeSheetName, res.user.email || '');
            } catch (err) {
              console.warn("Could not auto-save settings to Firestore on login:", err);
            }
          }
        } catch (dbErr) {
          console.warn("Error looking up shared Firestore config on login:", dbErr);
        }
        
        if (activeSheetId) {
          try {
            const { fetchSheetDataDirect } = await import('./lib/sheetsService');
            const { upsertCasesToDb } = await import('./lib/supabaseDb');
            const sheetRows = await fetchSheetDataDirect(activeSheetId, activeSheetName, res.accessToken, res.user.email);
            if (sheetRows && sheetRows.length > 0) {
              await upsertCasesToDb(sheetRows, res.user.email || 'system_sync');
              setRows(sheetRows);
              updateLastSynced(new Date());
            }
          } catch (sheetErr: any) {
            console.warn("Could not sync spreadsheet on sign in:", sheetErr);
            setLoginError(`Signed in, but Google Sheets API sync failed. Using cached database snapshot instead.`);
          }
        }
      }
    } catch (err: any) {
      console.error("Sign-in from page failed:", err);
      setLoginError(err.message || "Failed to authenticate or authorization popup was closed.");
    } finally {
      setRestoreLoading(false);
    }
  };

  const [syncing, setSyncing] = useState<boolean>(false);

  const handleSyncFromSheets = async (forcedToken?: string | null) => {
    const activeToken = forcedToken !== undefined ? forcedToken : accessToken;
    if (!sheetId) {
      alert("Please configure a Google Sheet ID first.");
      return;
    }

    // If no Google token is available, trigger Google OAuth re-authentication/login
    if (!activeToken) {
      const { googleSignIn } = await import('./lib/firebaseAuth');
      alert("Connecting to Google for synchronization...");
      await googleSignIn(); // Redirects page to get token
      return;
    }

    setSyncing(true);
    try {
      const { fetchSheetDataDirect } = await import('./lib/sheetsService');
      const { upsertCasesToDb } = await import('./lib/supabaseDb');
      
      const sheetRows = await fetchSheetDataDirect(sheetId, sheetName, activeToken, user?.email);
      if (sheetRows && sheetRows.length > 0) {
        await upsertCasesToDb(sheetRows, user?.email || 'system_sync');
        setRows(sheetRows);
        updateLastSynced(new Date());
        alert(`Successfully synchronized ${sheetRows.length} rows from Google Sheets!`);
      } else {
        alert("Spreadsheet sync returned empty content.");
      }
    } catch (err: any) {
      console.error("Manual Google Sheets sync failed:", err);
      alert(`Sync failed: ${err.message || err}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    setRestoreLoading(true);
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setDemoMode(false);
      setLoginError(null);
      localStorage.removeItem(`cars24_sheet_access_verified_${sheetId}`);
      localStorage.removeItem(`cars24_sheet_access_time_${sheetId}`);
      // Reload DB cache rows so they are clean
      const { getCasesFromDb } = await import('./lib/supabaseDb');
      const dbRows = await getCasesFromDb();
      if (dbRows && dbRows.length > 0) {
        setRows(dbRows);
      }
    } catch (err) {
      console.error("Log out failed:", err);
    } finally {
      setRestoreLoading(false);
    }
  };

  // Render Login page if not signed in and not bypassed with offline demo mode
  if (!user && !demoMode) {
    return (
      <LoginPage
        sheetId={sheetId}
        setSheetId={setSheetId}
        sheetName={sheetName}
        setSheetName={setSheetName}
        onSignIn={handleSignIn}
        onDemoMode={() => setDemoMode(true)}
        loading={restoreLoading}
        error={loginError}
      />
    );
  }

  // Render Restricted Access page if signed in but Sheets API failed and no live rows loaded, and not in demo mode
  if (user && loginError && rows.length === 0 && !demoMode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-slate-100">
        {/* Decorative ambient background glows */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-brand-orange/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand-blue/10 blur-[130px] pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-xl z-10"
        >
          {/* Branding header */}
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-blue shadow-lg shadow-brand-orange/20 mb-3 flex items-center justify-center">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              CARS24 T2D <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-orange to-brand-blue">Access Restricted</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
              Your account is authenticated, but we encountered an error connecting to your Google Spreadsheet database.
            </p>
          </div>

          {/* Primary Login Card */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-orange to-brand-blue" />
            
            <div className="space-y-6">
              {/* Error Message */}
              <div className="p-3.5 bg-red-950/50 border border-red-900/60 rounded-xl text-xs text-red-300 leading-relaxed font-mono font-bold">
                {loginError}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDemoMode(true);
                    setRows(SEED_CASE_ROWS);
                    setLoginError(null);
                  }}
                  className="w-full p-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-orange to-brand-blue hover:from-brand-orange/90 hover:to-brand-blue/90 text-white font-bold transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-brand-orange/10 cursor-pointer text-xs uppercase tracking-wider active:scale-[0.98]"
                >
                  Explore with Seed Offline Dataset
                </button>

                <div className="flex items-center my-1 text-slate-600">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="px-3 text-[10px] uppercase font-bold tracking-widest text-slate-500">OR</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:text-slate-100"
                >
                  Sign Out / Switch Account
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-800 bg-slate-50/50 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      
      {/* Prime Ops Portal Header */}
      <header className="bg-slate-900 text-white shadow-md relative overflow-hidden shrink-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-orange to-brand-blue" />
        
        <div className="max-w-7xl mx-auto px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-orange to-brand-blue text-white shadow-md flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white font-sans sm:text-lg">
                  {appTitle}
                </h1>
                <span className="p-0.5 px-2 bg-slate-800 text-slate-400 font-mono text-[9px] uppercase tracking-wider font-extrabold rounded-md border border-slate-700">
                  {user && !demoMode ? "GSync Mode" : "Demo Mode"}
                </span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-2 flex-wrap">
                <a
                  href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-orange hover:text-brand-orange/80 font-medium underline flex items-center gap-1.5 transition-colors"
                  title="Open live synchronized spreadsheet directly"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Active Spreadsheet &bull; Tab: <span className="font-bold">{sheetName}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400 inline" />
                </a>
                {user && (
                  <>
                    <span className="text-slate-600">|</span>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setViewMode(prev => prev === 'admin' ? 'dashboard' : 'admin')}
                        className="ml-1 p-1.5 px-3 rounded-xl bg-gradient-to-r from-brand-orange to-brand-blue hover:from-brand-orange/90 hover:to-brand-blue/90 text-white font-bold transition-all cursor-pointer flex items-center gap-1.5 text-[10px] uppercase tracking-wider shadow-sm active:scale-[0.98]"
                        title="Open Dedicated Admin Console Page"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {viewMode === 'admin' ? 'Dashboard View' : 'Admin Console'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowConfigPanel(p => !p)}
                        className="ml-1 p-1 px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[9px] uppercase tracking-wider font-extrabold"
                        title="Configure Google Spreadsheet Settings"
                      >
                        <Settings className="w-3 h-3 text-brand-orange" />
                        Configure ID
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Sync & Connection Status Widget */}
            <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 p-1.5 pl-3 pr-2.5 rounded-2xl shadow-inner select-none text-xs">
              {/* Badge indicator */}
              <div className="flex items-center gap-2">
                {syncing ? (
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-450 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                  </div>
                ) : (demoMode || !user) ? (
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-450 opacity-50"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
                  </div>
                ) : (
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-[pulse_2s_infinite] absolute inline-flex h-full w-full rounded-full bg-emerald-450 opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                  </div>
                )}
                
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-200 leading-tight">
                    {syncing ? "Syncing..." : (demoMode || !user) ? "Offline" : "Synced"}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium leading-none mt-0.5 whitespace-nowrap">
                    {syncStatusText}
                  </span>
                </div>
              </div>

              {/* Silent Sync Now Action */}
              {user && !demoMode && (
                <button
                  onClick={() => handleSyncFromSheets()}
                  disabled={syncing}
                  title="Force refresh from Google Sheets"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin text-blue-400' : ''}`} />
                </button>
              )}
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                {/* User badge */}
                <div className="p-1 px-3 h-[38px] rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center gap-2.5 shadow-sm text-xs max-w-[200px] truncate">
                  <div className="w-5.5 h-5.5 rounded-full bg-brand-orange text-white flex items-center justify-center font-bold text-[10px] shrink-0 font-mono select-none">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      user.email?.[0].toUpperCase() || 'U'
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-200 truncate font-bold leading-tight">{user.displayName || 'Operator'}</p>
                    <p className="text-[9px] text-slate-400 truncate tracking-wide font-mono leading-none mt-0.5">
                      {user.email}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  title="Disconnect and Change Sheet ID"
                  className="p-2 h-[38px] w-[38px] rounded-2xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 text-slate-350 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSignOut}
                  className="p-2 px-4 h-[38px] rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-all active:scale-[0.98]"
                >
                  <Lock className="w-3.5 h-3.5 text-brand-orange" /> Sign In & Sync
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-5 flex flex-col gap-6">
        {viewMode === 'admin' && user && isAdmin ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col gap-6"
          >
            {/* Admin Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border rounded-3xl p-6 shadow-xl" style={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}>
              <div>
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Settings className="w-6 h-6 text-amber-500 animate-[spin_4s_linear_infinite]" /> CARS24 T2D Admin Console
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage spreadsheet parameters, track active session minutes, and view system-wide revisions timeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode('dashboard')}
                className="self-start sm:self-auto flex items-center gap-2 p-2.5 px-5 rounded-2xl text-slate-200 hover:text-white font-bold text-xs transition-all cursor-pointer border shadow-sm active:scale-98"
                style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
              </button>
            </div>

            {/* Admin Tabs Selector */}
            <div className="flex gap-2 border-b border-slate-200 pb-px font-sans select-none">
              <button
                type="button"
                onClick={() => setAdminTab('settings')}
                className={`p-3 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  adminTab === 'settings'
                    ? 'border-brand-orange text-slate-900 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-650'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" /> Spreadsheet Rules
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('sessions')}
                className={`p-3 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  adminTab === 'sessions'
                    ? 'border-brand-orange text-slate-900 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-650'
                }`}
              >
                <Clock className="w-4 h-4" /> Operator Sessions
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('audits')}
                className={`p-3 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  adminTab === 'audits'
                    ? 'border-brand-orange text-slate-900 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-655'
                }`}
              >
                <History className="w-4 h-4" /> Revision Feed
              </button>
            </div>

            {/* Admin Tab Content */}
            <div className="flex-1">
              {adminTab === 'settings' && (
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl space-y-6">
                  <div className="flex items-center gap-2 text-amber-500">
                    <Database className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white">Google Spreadsheet DB Rules</h3>
                  </div>

                  <form onSubmit={handleSaveSettings} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-2">
                          Spreadsheet ID or full edit URL
                        </label>
                        <input
                          type="text"
                          value={tempSheetId}
                          onChange={(e) => setTempSheetId(e.target.value)}
                          placeholder="Paste Spreadsheet ID or full Google Sheets URL..."
                          className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                        />
                        {tempSheetId && getCleanSpreadsheetId(tempSheetId) !== tempSheetId && (
                          <p className="text-[9px] text-amber-500 font-mono mt-1">
                            Cleaned Extracted ID: {getCleanSpreadsheetId(tempSheetId)}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-2">
                          Tab Worksheet Name
                        </label>
                        <input
                          type="text"
                          value={tempSheetName}
                          onChange={(e) => setTempSheetName(e.target.value)}
                          placeholder="Defaults to Sheet1"
                          className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3">
                      <button
                        type="submit"
                        className="p-3 px-6 rounded-xl bg-gradient-to-r from-brand-orange to-brand-blue text-white font-bold hover:from-brand-orange/90 hover:to-brand-blue/90 transition-all text-xs flex items-center gap-2 cursor-pointer shadow-md shadow-brand-orange/10 active:scale-98 font-semibold uppercase tracking-wider"
                      >
                        <Save className="w-4 h-4" /> Save Rules
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSyncFromSheets()}
                        className="p-3 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-2 cursor-pointer border border-slate-700 active:scale-98 font-semibold uppercase tracking-wider"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-amber-500' : ''}`} /> Sync Sheet
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {adminTab === 'sessions' && (
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between text-amber-500 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">Active Operator Logins</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={fetchAdminData}
                      className="text-[10px] font-bold uppercase text-amber-400 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh List
                    </button>
                  </div>

                  {loadingSessions ? (
                    <div className="text-center py-12 text-xs text-slate-400 font-mono animate-pulse">
                      Fetching operator session records...
                    </div>
                  ) : userSessions.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-500 italic">
                      No operator session history recorded.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950 text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800 select-none">
                            <th className="p-4">Operator</th>
                            <th className="p-4">Login Timestamp</th>
                            <th className="p-4">Last Heartbeat Active</th>
                            <th className="p-4 text-right">Total Session Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 text-slate-300">
                          {userSessions.map((sess) => {
                            const loginTimeStr = sess.login_time 
                              ? new Date(sess.login_time).toLocaleString() 
                              : '-';
                            const lastActiveStr = sess.last_active_time 
                              ? new Date(sess.last_active_time).toLocaleTimeString() 
                              : '-';
                            return (
                              <tr key={sess.id} className="hover:bg-slate-900/40">
                                <td className="p-4 font-semibold text-slate-200 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
                                  {sess.user_email}
                                </td>
                                <td className="p-4 font-mono text-slate-400">{loginTimeStr}</td>
                                <td className="p-4 font-mono text-slate-400">{lastActiveStr}</td>
                                <td className="p-4 text-right font-bold text-amber-400 font-mono">
                                  {sess.duration_minutes} min{sess.duration_minutes !== 1 ? 's' : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {adminTab === 'audits' && (
                <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl space-y-4">
                  <div className="flex items-center justify-between text-amber-500 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-amber-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-white">System Audit logs (Global Change Feed)</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={fetchAdminData}
                      className="text-[10px] font-bold uppercase text-amber-400 hover:text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh Feed
                    </button>
                  </div>

                  {loadingAudits ? (
                    <div className="text-center py-12 text-xs text-slate-400 font-mono animate-pulse">
                      Fetching system audit feed...
                    </div>
                  ) : globalAuditLogs.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-500 italic">
                      No system revision logs found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/40">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950 text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800 select-none">
                            <th className="p-4">Case Booking ID</th>
                            <th className="p-4">Operator</th>
                            <th className="p-4">Modified Variable</th>
                            <th className="p-4">Previous Value</th>
                            <th className="p-4">New Updated Value</th>
                            <th className="p-4 text-right">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 text-slate-350">
                          {globalAuditLogs.map((log) => {
                            const columnLabels = {
                              readyToDeliver: "Ready to Deliver?",
                              expectedOdCompletionDate: "Expected OD Date",
                              eddReviewerDate: "Reviewer EDD",
                              reviewerRemarks: "Reviewer Remarks",
                              onDemandStatus: "On Demand Status",
                              expectedDeliveryDate: "Expected Delivery Date",
                              paymentPercentage: "Payment Percentage",
                              sheetFinalStatus: "Sheet Final Status",
                              formFinalStatus: "Form Final Status",
                              confidenceScore: "Confidence Score",
                              leadStage: "Lead Stage",
                              dealStatus: "Deal Status",
                              allocatedRm: "Allocated RM",
                              assignedDc: "Assigned DC",
                              deliveryStatus: "Delivery Status",
                              taskBucket: "Task Bucket"
                            };
                            const friendlyCol = (columnLabels as any)[log.column_name] || log.column_name;
                            const formattedDate = log.changed_at 
                              ? new Date(log.changed_at).toLocaleString() 
                              : '-';

                            return (
                              <tr key={log.id} className="hover:bg-slate-900/40">
                                <td className="p-4 font-bold text-slate-200">{log.booking_id}</td>
                                <td className="p-4 font-semibold text-slate-300">{log.changed_by.split('@')[0]}</td>
                                <td className="p-4 font-medium text-amber-500">{friendlyCol}</td>
                                <td className="p-4 text-rose-500 font-mono max-w-[150px] truncate" title={log.old_value || ''}>
                                  {log.old_value || 'Empty'}
                                </td>
                                <td className="p-4 text-emerald-400 font-mono max-w-[150px] truncate" title={log.new_value || ''}>
                                  {log.new_value || 'Empty'}
                                </td>
                                <td className="p-4 text-right font-mono text-slate-400">{formattedDate}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <>
            {/* Configuration Settings Pane - Shared with all operators */}
            {showConfigPanel && user && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4"
              >
                <div className="flex items-center gap-2 text-amber-500">
                  <Settings className="w-5 h-5" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Google Spreadsheet Database Rules</h3>
                </div>
                
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1.5">
                        Spreadsheet ID or full edit URL
                      </label>
                      <input
                        type="text"
                        value={tempSheetId}
                        onChange={(e) => setTempSheetId(e.target.value)}
                        placeholder="Paste Spreadsheet ID or full Google Sheets URL..."
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                      />
                      {tempSheetId && getCleanSpreadsheetId(tempSheetId) !== tempSheetId && (
                        <p className="text-[9px] text-amber-500 font-mono mt-1">
                          Cleaned Extracted ID: {getCleanSpreadsheetId(tempSheetId)}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1.5">
                        Tab Worksheet Name
                      </label>
                      <input
                        type="text"
                        value={tempSheetName}
                        onChange={(e) => setTempSheetName(e.target.value)}
                        placeholder="Defaults to Sheet1"
                        className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-brand-orange focus:outline-none focus:ring-1 focus:ring-brand-orange"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1.5">
                    <button
                      type="submit"
                      className="p-2 px-4 rounded-xl bg-gradient-to-r from-brand-orange to-brand-blue text-white font-bold hover:from-brand-orange/90 hover:to-brand-blue/90 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-4 h-4" /> Save and Query Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempSheetId(sheetId);
                        setTempSheetName(sheetName);
                        setShowConfigPanel(false);
                      }}
                      className="p-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Offline notice bar if in demo mode */}
            {demoMode && (
              <div className="p-4 bg-amber-50 border border-amber-200/60 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start sm:items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                  <div>
                    <span className="font-bold">Viewing Live Cached Dataset (Read-Only)</span> • Connect your Google Account to edit actionables or trigger a sync.
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-1.5 px-3 self-start sm:self-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg cursor-pointer transition-colors shrink-0"
                >
                  Connect Google Account
                </button>
              </div>
            )}

            {/* Dashboard Renderer - Single screen interface */}
            <div className="flex-1">
              <Dashboard 
                rows={rows} 
                setRows={setRows} 
                filterOptions={filterOptions} 
                sheetId={sheetId}
                sheetName={sheetName}
                accessToken={demoMode ? null : accessToken}
                user={user}
                onSyncFromSheets={handleSyncFromSheets}
                isSyncing={syncing}
              />
            </div>
          </>
        )}
      </main>

      {/* Modern, elegant production credit footer */}
      <footer className="shrink-0 p-4 border-t border-slate-200/60 bg-white text-center text-[10px] text-slate-400 select-none">
        CARS24 Operations &bull; Direct Google Sheets Integration v4 &bull; Built in 2026 for secure tracking.
      </footer>
    </div>
  );
}

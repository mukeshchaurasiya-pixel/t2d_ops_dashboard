/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Building, RefreshCcw, LogOut, AlertCircle, FileSpreadsheet, Lock, HelpCircle, Settings, Database, Save, ExternalLink
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import { CaseRow } from './types';
import { SEED_CASE_ROWS } from './data/mockData';
import { initAuth, logout, AppUser } from './lib/firebaseAuth';
import { getCleanSpreadsheetId } from './lib/sheetsService';

export default function App() {
  const [rows, setRows] = useState<CaseRow[]>(SEED_CASE_ROWS);

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

  // Check if current user is an admin
  const isAdmin = useMemo(() => {
    if (!user || !user.email) return false;
    const emailLower = user.email.toLowerCase().trim();
    return emailLower === 'mukesh.chaurasiya@cars24.com' || emailLower === 'chourasiyamukesh008@gmail.com';
  }, [user]);

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
        }
      } catch (err) {
        console.warn("Could not load initial cached cases from Supabase DB:", err);
      } finally {
        setRestoreLoading(false);
      }
    };
    loadCache();
  }, []);

  // Auth subscriber to auto-load saved state on boot or login
  useEffect(() => {
    const unsubscribe = initAuth(
      async (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);

        let activeSheetId = sheetId;
        let activeSheetName = sheetName;

        setRestoreLoading(true);
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
        } finally {
          setRestoreLoading(false);
        }
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
              await upsertCasesToDb(sheetRows);
              setRows(sheetRows);
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
        await upsertCasesToDb(sheetRows);
        setRows(sheetRows);
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
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-orange-600/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-600/10 blur-[130px] pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-xl z-10"
        >
          {/* Branding header */}
          <div className="text-center mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20 mb-3 flex items-center justify-center">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              CARS24 T2D <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-amber-400 to-amber-500">Access Restricted</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
              Your account is authenticated, but we encountered an error connecting to your Google Spreadsheet database.
            </p>
          </div>

          {/* Primary Login Card */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
            
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
                  className="w-full p-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-orange-500/10 cursor-pointer text-xs uppercase tracking-wider active:scale-[0.98]"
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
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-indigo-600" />
        
        <div className="max-w-7xl mx-auto px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md flex items-center justify-center">
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
                  className="text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1.5 transition-colors"
                  title="Open live synchronized spreadsheet directly"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Active Spreadsheet &bull; Tab: <span className="font-bold">{sheetName}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400 inline" />
                </a>
                {user && (
                  <>
                    <span className="text-slate-600">|</span>
                    <button
                      onClick={() => setShowConfigPanel(p => !p)}
                      className="ml-1 p-1 px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[9px] uppercase tracking-wider font-extrabold"
                      title="Configure Google Spreadsheet Settings"
                    >
                      <Settings className="w-3 h-3 text-orange-500" />
                      Configure ID
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {restoreLoading && (
              <div className="text-xs text-slate-400 animate-pulse flex items-center gap-1.5 font-mono">
                <RefreshCcw className="w-3.5 h-3.5 animate-spin text-amber-500" /> Re-syncing...
              </div>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                {/* User badge */}
                <div className="p-1 px-3 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center gap-2.5 shadow-sm text-xs max-w-[240px] truncate">
                  <div className="w-5 h-5 rounded-full bg-amber-500 text-slate-900 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono select-none">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      user.email?.[0].toUpperCase() || 'U'
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-300 truncate font-semibold leading-tight">{user.displayName || 'Operator'}</p>
                    <p className="text-[9px] text-emerald-400 truncate tracking-wide font-mono leading-none">
                      {demoMode ? "Offline Demo Session" : "Synced with Sheets API"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  title="Disconnect and Change Sheet ID"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="p-1 px-2 text-[10px] bg-amber-950/50 text-amber-400 rounded-lg font-bold border border-amber-905/30 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Offline Demo Session
                </div>
                
                <button
                  onClick={handleSignOut}
                  className="p-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Lock className="w-3.5 h-3.5" /> Sign In & Sync
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-5 flex flex-col gap-6">
        
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
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1.5">
                <button
                  type="submit"
                  className="p-2 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-bold hover:from-orange-600 hover:to-amber-600 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
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
      </main>

      {/* Modern, elegant production credit footer */}
      <footer className="shrink-0 p-4 border-t border-slate-200/60 bg-white text-center text-[10px] text-slate-400 select-none">
        CARS24 Operations &bull; Direct Google Sheets Integration v4 &bull; Built in 2026 for secure tracking.
      </footer>
    </div>
  );
}

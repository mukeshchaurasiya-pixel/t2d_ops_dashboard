/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Building, RefreshCcw, LogOut, AlertCircle, FileSpreadsheet, Lock, HelpCircle, Settings, Database, Save, ExternalLink, Clock, ArrowLeft, History, RefreshCw
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import LoginPage from './components/LoginPage';
import { CaseRow } from './types';
import { SEED_CASE_ROWS } from './data/mockData';
import { logout } from './lib/firebaseAuth';
import { getCleanSpreadsheetId } from './lib/sheetsService';
import { getSheetAccessCacheKeys } from './lib/sheetAccessCache';
import { useAdminData } from './hooks/useAdminData';
import { useAuthBootstrap } from './hooks/useAuthBootstrap';
import { useCaseData } from './hooks/useCaseData';
import { useSheetConfig } from './hooks/useSheetConfig';
import { useSyncState } from './hooks/useSyncState';

export default function App() {
  const [rows, setRows] = useState<CaseRow[]>(SEED_CASE_ROWS);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const { syncStatusText, updateLastSynced } = useSyncState();
  const {
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
  } = useSheetConfig();
  const [appTitle, setAppTitle] = useState<string>('CARS24 T2D Ops Dashboard');
  const { syncing, loadCachedRows, syncCasesFromSheets, syncPendingChangesToSheets } = useCaseData(setRows, updateLastSynced);
  const {
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
  } = useAuthBootstrap({
    sheetId,
    sheetName,
    setSheetId,
    setSheetName,
    setRows,
    loadCachedRows,
  });

  // Automatically sync pending offline changes and pull latest data when Google Sign-In is connected
  useEffect(() => {
    if (accessToken && sheetId) {
      const runAutoSync = async () => {
        try {
          const isFreshLogin = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cars24_fresh_login') === 'true';
          
          if (isFreshLogin) {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.removeItem('cars24_fresh_login');
            }
            const lastSyncedStr = localStorage.getItem('cars24_lastSynced');
            const lastSynced = lastSyncedStr ? new Date(lastSyncedStr) : null;
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            const refreshedInLastHour = lastSynced && lastSynced.getTime() > oneHourAgo;

            if (refreshedInLastHour) {
              console.log("Skipping data refresh: already refreshed in the last 1 hour.");
              return;
            }
          }

          const syncedCount = await syncPendingChangesToSheets(accessToken, sheetId, sheetName, user?.email);
          const { sheetRows } = await syncCasesFromSheets({
            accessToken,
            sheetId,
            sheetName,
            userEmail: user?.email,
          });
          if (syncedCount > 0 || sheetRows.length > 0) {
            bumpDashboardRefresh();
          }
        } catch (err) {
          console.error("Automatic post-auth sync failed:", err);
        }
      };
      void runAutoSync();
    }
  }, [accessToken, sheetId, sheetName, user?.email, syncPendingChangesToSheets, syncCasesFromSheets]);

  // Routing and View States
  const [viewMode, setViewMode] = useState<'dashboard' | 'admin'>('dashboard');
  const [adminTab, setAdminTab] = useState<'settings' | 'sessions' | 'audits'>('settings');
  const {
    isAdmin,
    activeSessionId,
    userSessions,
    loadingSessions,
    globalAuditLogs,
    loadingAudits,
    fetchAdminData,
  } = useAdminData({
    userEmail: user?.email,
    demoMode,
    viewMode,
  });

  const bumpDashboardRefresh = () => {
    setDashboardRefreshKey(prev => prev + 1);
  };

  // Persist shared settings only. Manual sync stays a separate explicit action.
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = getCleanSpreadsheetId(tempSheetId);
    setSheetId(cleanId);
    setSheetName(tempSheetName);
    setShowConfigPanel(false);
    
    if (user) {
      setRestoreLoading(true);
      try {
        const { saveSharedConfig } = await import('./lib/firebaseAuth');
        await saveSharedConfig(cleanId, tempSheetName, user.email || '');
        setLoginError(null);
        alert("Configuration saved. Use 'Sync Sheet' only when you want to refresh the Supabase cache from Google Sheets.");
      } catch (err: any) {
        console.error("Failed to save spreadsheet config:", err);
        alert(`Configuration updated locally, but shared config save failed:\n${err.message || err}`);
        setLoginError(err.message || err);
      } finally {
        setRestoreLoading(false);
      }
    } else {
      alert("Offline configuration updated successfully.");
    }
  };

  const handleSignIn = async () => {
    setRestoreLoading(true);
    setLoginError(null);
    try {
      const { googleSignIn } = await import('./lib/firebaseAuth');
      await googleSignIn();
    } catch (err: any) {
      console.error("Sign-in from page failed:", err);
      setLoginError(err.message || "Failed to authenticate or authorization popup was closed.");
    } finally {
      setRestoreLoading(false);
    }
  };

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
      try {
        const result = await googleSignIn();
        if (result?.accessToken) {
          await handleSyncFromSheets(result.accessToken);
        }
      } catch (err: any) {
        console.error("Popup sign-in during sync failed:", err);
        alert(`Authentication failed: ${err.message || err}`);
      }
      return;
    }

    try {
      const { sheetRows, importStats } = await syncCasesFromSheets({
        accessToken: activeToken,
        sheetId,
        sheetName,
        userEmail: user?.email,
      });
      if (sheetRows.length > 0) {
        bumpDashboardRefresh();
        const statsNote = importStats
          ? `\nImported to cache: ${importStats.uniqueBookingIds}` +
            `\nDuplicate booking IDs skipped: ${importStats.duplicateBookingIdRows}` +
            `\nBlank booking IDs skipped: ${importStats.blankBookingIdRows}`
          : '';
        alert(`Successfully synchronized ${sheetRows.length} sheet rows from Google Sheets.${statsNote}`);
      } else {
        alert("Spreadsheet sync returned empty content.");
      }
    } catch (err: any) {
      console.error("Manual Google Sheets sync failed:", err);
      alert(`Sync failed: ${err.message || err}`);
    }
  };

  const handleSignOut = async () => {
    setRestoreLoading(true);
    try {
      const cacheKeys = getSheetAccessCacheKeys(sheetId, user?.email);
      await logout();
      setUser(null);
      setAccessToken(null);
      setDemoMode(false);
      setLoginError(null);
      localStorage.removeItem(cacheKeys.verifiedKey);
      localStorage.removeItem(cacheKeys.timeKey);
      localStorage.removeItem(cacheKeys.legacyVerifiedKey);
      localStorage.removeItem(cacheKeys.legacyTimeKey);
      setRows(SEED_CASE_ROWS);
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
        
        <div className="w-full max-w-none px-4 md:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
      <main className="flex-1 w-full max-w-none px-4 md:px-6 lg:px-8 py-6 flex flex-col gap-6">
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
                              cancelReqDate: "Cancel Request Date",
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
                demoMode={demoMode}
                sheetId={sheetId}
                sheetName={sheetName}
                accessToken={demoMode ? null : accessToken}
                user={user}
                isSyncing={syncing}
                refreshKey={dashboardRefreshKey}
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

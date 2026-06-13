/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, ArrowRight, HelpCircle, Lock, 
  Car, DollarSign, Activity, ArrowLeft,
  Home, LogIn
} from 'lucide-react';
import { getCleanSpreadsheetId } from '../lib/sheetsService';

interface LoginPageProps {
  sheetId: string;
  setSheetId: (val: string) => void;
  sheetName: string;
  setSheetName: (val: string) => void;
  onSignIn: () => Promise<void>;
  onDemoMode: () => void;
  loading: boolean;
  error?: string | null;
}

export default function LoginPage({
  sheetId,
  setSheetId,
  sheetName,
  setSheetName,
  onSignIn,
  onDemoMode,
  loading,
  error
}: LoginPageProps) {
  const [localInput, setLocalInput] = useState(sheetId);
  const [localName, setLocalName] = useState(sheetName);
  const [showUrlHelp, setShowUrlHelp] = useState(false);
  const [showOperatorSignIn, setShowOperatorSignIn] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setLocalInput(rawVal);
    const cleaned = getCleanSpreadsheetId(rawVal);
    setSheetId(cleaned);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nameVal = e.target.value;
    setLocalName(nameVal);
    setSheetName(nameVal || 'Sheet1');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSignIn();
  };

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
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20 mb-3 flex items-center justify-center gap-2">
            <Home className="w-6 h-6 text-white" />
            <Car className="w-6 h-6 text-white/90" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            CARS24 <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-amber-400 to-amber-500">T2D Journey</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Reserve the car, process the loan, visit the hub, and drive home happily.
          </p>
        </div>

        {/* Primary Action Card */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
          
          <AnimatePresence mode="wait">
            {showOperatorSignIn ? (
              /* Google Sheets Configuration Mode */
              <motion.div
                key="operator"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-orange-500" /> Spreadsheet Sync Settings
                  </h3>
                  <button 
                    onClick={() => setShowOperatorSignIn(false)}
                    className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Back
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Google Spreadsheet ID or URL</span>
                        <button
                          type="button"
                          onClick={() => setShowUrlHelp(!showUrlHelp)}
                          className="text-orange-500 hover:text-orange-400 lowercase font-normal flex items-center gap-0.5"
                        >
                          <HelpCircle className="w-3 h-3" /> what is this?
                        </button>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1ARJ8AzOwNxqdTZA..."
                        value={localInput}
                        onChange={handleInputChange}
                        className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-650 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>

                    <AnimatePresence>
                      {showUrlHelp && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-[10px] text-slate-400 leading-relaxed space-y-1.5 overflow-hidden"
                        >
                          <p>
                            You can paste the **entire browser URL** of your Google Sheet. The system automatically extracts the ID.
                          </p>
                          <p className="font-semibold text-slate-300">
                            Spreadsheet must be shared to your Google Account (read/write access) to save changes.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Spreadsheet Tab Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sheet1"
                        value={localName}
                        onChange={handleNameChange}
                        className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-100 placeholder-slate-650 focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full p-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/10 cursor-pointer text-xs uppercase tracking-wider active:scale-[0.98] disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-slate-950" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Signing you in...
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" /> Sign in with Google & Sync Sheet
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              /* Direct Sign-in Landing */
              <motion.div
                key="landing"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.25 }}
                className="space-y-6 text-center"
              >
                {/* Error banner */}
                {error && (
                  <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-300 text-left">
                    {error}
                  </div>
                )}

                <div className="py-3">
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Sign in with your <span className="text-orange-400 font-semibold">CARS24 Google account</span> to access live T2D operations data.
                  </p>
                </div>

                <div className="flex flex-col gap-3 max-w-sm mx-auto">
                  {/* Primary: Google Sign-in */}
                  <button
                    onClick={onSignIn}
                    disabled={loading}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-orange-500/20 cursor-pointer text-sm active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-slate-950" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing you in...
                      </>
                    ) : (
                      <>
                        {/* Google "G" icon */}
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#1a1a1a"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#1a1a1a"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#1a1a1a"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#1a1a1a"/>
                        </svg>
                        Sign in with Google
                        <LogIn className="w-4 h-4" />
                      </>
                    )}
                  </button>


                </div>

                <p className="text-[10px] text-slate-600 max-w-xs mx-auto leading-relaxed">
                  By signing in you agree to CARS24 internal data access policy. Only authorised accounts can view live data.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Feature Cards below */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-900/60 flex items-start gap-3 backdrop-blur-xs">
            <div className="p-1 px-1.5 rounded-lg bg-orange-950 text-orange-400 mt-0.5">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-350">Token Booking</h4>
              <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">
                Reserve customer's selected car instantly.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-900/60 flex items-start gap-3 backdrop-blur-xs">
            <div className="p-1 px-1.5 rounded-lg bg-orange-950 text-orange-400 mt-0.5">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-350">Loan Support</h4>
              <p className="text-[10px] text-slate-455 mt-1 leading-relaxed">
                Track loan processing and approvals.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-900/60 flex items-start gap-3 backdrop-blur-xs">
            <div className="p-1 px-1.5 rounded-lg bg-orange-950 text-orange-400 mt-0.5">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-350">Hub Delivery</h4>
              <p className="text-[10px] text-slate-455 mt-1 leading-relaxed">
                Manage delivery from hub to happy drive.
              </p>
            </div>
          </div>
        </div>

        {/* Operator Toggle Link */}
        <div className="text-center mt-6">
          <button
            onClick={() => setShowOperatorSignIn(!showOperatorSignIn)}
            className="text-[11px] text-slate-500 hover:text-orange-400 font-semibold transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            {showOperatorSignIn ? "Back to Sign In" : "Configure Google Sheets Sync Database"}
          </button>
        </div>

      </motion.div>
    </div>
  );
}

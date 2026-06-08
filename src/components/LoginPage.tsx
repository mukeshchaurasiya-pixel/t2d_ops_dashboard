/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, ShieldCheck, ArrowRight, HelpCircle, FileSpreadsheet, Lock, 
  Car, DollarSign, Activity, CheckCircle, Clock, Sparkles, AlertCircle, ArrowLeft,
  Home
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

  // Journey workflow state: 'landing' | 'journey_steps' | 'success'
  const [journeyState, setJourneyState] = useState<'landing' | 'journey_steps' | 'success'>('landing');

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

                    <button
                      type="button"
                      onClick={onDemoMode}
                      className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:text-slate-100"
                    >
                      Explore with Seed Offline Dataset
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              /* Premium T2D Journey Centered Flow */
              <motion.div
                key="t2d"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                {journeyState === 'landing' && (
                  <div className="space-y-6 text-center">
                    <div className="py-4">
                      <Sparkles className="w-10 h-10 text-amber-400 mx-auto animate-pulse mb-3" />
                      <h2 className="text-xl font-bold text-white tracking-tight">T2D Journey Tracker</h2>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-2 leading-relaxed">
                        Reserve your car, kick off loan processing, and track the handshake process until hub delivery.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 max-w-sm mx-auto">
                      <button
                        onClick={() => setJourneyState('journey_steps')}
                        className="w-full p-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/15 cursor-pointer text-xs uppercase tracking-wider active:scale-[0.98]"
                      >
                        Start T2D Journey
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={onDemoMode}
                        className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-855 hover:border-slate-800 text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:text-slate-100"
                      >
                        View Sample Journey
                      </button>
                    </div>
                  </div>
                )}

                {journeyState === 'journey_steps' && (
                  <div className="space-y-6">
                    <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Operational Delivery Journey
                      </h3>
                      <span className="text-[10px] text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md animate-pulse">
                        Click 2 Pending
                      </span>
                    </div>

                    {/* Step Visuals */}
                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-200">Pay Token Against Car</h4>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-900/60 shrink-0">
                              Token Pending
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            Customer reserves the selected car by paying a token amount.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-200">Loan Processing</h4>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-900/60 shrink-0">
                              In Progress
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            Finance team processes loan documents and approval.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          3
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-200">Hub Visit & Delivery</h4>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-900/60 shrink-0">
                              Ready for Delivery
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            Customer visits hub, collects keys, and drives home happily.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => setJourneyState('success')}
                        className="w-full p-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/15 cursor-pointer text-xs uppercase tracking-wider active:scale-[0.98]"
                      >
                        Confirm Token & Proceed
                      </button>
                    </div>
                  </div>
                )}

                {journeyState === 'success' && (
                  <div className="space-y-6">
                    {/* Success message banner */}
                    <div className="p-4 bg-emerald-955/40 border border-emerald-900/50 rounded-xl flex items-start gap-3">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 animate-bounce" />
                      <div>
                        <h4 className="text-xs font-bold text-emerald-300">Journey Triggered</h4>
                        <p className="text-[10px] text-emerald-400 mt-0.5 leading-relaxed">
                          Token confirmed. Loan processing has started.
                        </p>
                      </div>
                    </div>

                    {/* Updated Step Badges */}
                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          ✓
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-200">Pay Token Against Car</h4>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-450 border border-emerald-900/60 shrink-0">
                              Token Paid
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            Customer reserves the selected car by paying a token amount.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-200">Loan Processing</h4>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-500 border border-amber-900/60 shrink-0">
                              Loan Processing Started
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            Finance team processes loan documents and approval.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-850">
                        <div className="w-8 h-8 rounded-lg bg-slate-800/20 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          3
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-450">Hub Visit & Delivery</h4>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-slate-500 border border-slate-800 shrink-0">
                              Hub Delivery Pending
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                            Customer visits hub, collects keys, and drives home happily.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex flex-col gap-3 border-t border-slate-800/60 mt-6">
                      <button
                        onClick={onSignIn}
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

                      <button
                        type="button"
                        onClick={onDemoMode}
                        className="w-full p-3 rounded-xl bg-slate-950 border border-slate-850 hover:border-slate-800 text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:text-slate-100"
                      >
                        Explore offline Demo Mode
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="pt-2 text-center">
                        <button
                          onClick={() => setJourneyState('landing')}
                          className="text-[11px] text-slate-400 hover:text-orange-400 font-semibold transition-colors flex items-center gap-1.5 mx-auto"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" /> Back to Journey
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
                Reserve customer’s selected car instantly.
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
            {showOperatorSignIn ? "Back to T2D Journey" : "Configure Google Sheets Sync Database"}
          </button>
        </div>

      </motion.div>
    </div>
  );
}

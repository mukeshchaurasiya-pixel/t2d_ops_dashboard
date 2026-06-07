/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Building, Database, ShieldCheck, ArrowRight, HelpCircle, FileSpreadsheet, Lock
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setLocalInput(rawVal);
    
    // Auto-extract Spreadsheet ID if they paste a full Google Sheets URL
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

  const parsedId = getCleanSpreadsheetId(localInput);

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
            <Building className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            CARS24 T2D <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-amber-400 to-amber-500">Ops Portal</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Direct peer-to-peer browser synchronization with Google Sheets API v4. Automated comments & manual overrides.
          </p>
        </div>

        {/* Primary Login Card */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
          
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Error Message */}
            {error && (
              <div className="p-3.5 bg-red-950/50 border border-red-900/60 rounded-xl text-xs text-red-300 leading-relaxed font-mono">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full p-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-orange-500/10 cursor-pointer text-xs uppercase tracking-wider active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
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
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="currentColor"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="currentColor"/>
                    </svg>
                    Sign in with Google & Sync Sheet
                  </>
                )}
              </button>

              <div className="flex items-center my-1 text-slate-600">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="px-3 text-[10px] uppercase font-bold tracking-widest text-slate-500 text-slate-500">OR</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              <button
                type="button"
                onClick={onDemoMode}
                className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:text-slate-100"
              >
                Explore with Seed Offline Dataset
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </form>
        </div>

        {/* Informative Security Pitch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-900 flex items-start gap-3">
            <div className="p-1 px-1.5 rounded-lg bg-orange-950 text-orange-400 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300">Secure Peer Sync</h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Tokens are stored client-side. The dashboard writes updates directly to your sheet columns in real-time.
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-900 flex items-start gap-3">
            <div className="p-1 px-1.5 rounded-lg bg-orange-950 text-orange-400 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300">No Backend DB</h4>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Total data custody. Your sheets are the source-of-truth for logs, checklist items, and workflow overrides.
              </p>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
}

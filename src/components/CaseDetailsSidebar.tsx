/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ExternalLink, RefreshCw, X, ShieldCheck, Clock, Activity, Sparkles, 
  Database, CheckCircle, PhoneCall, AlertCircle, ShieldAlert, 
  Copy, Check, ChevronDown, ChevronUp, MessageSquare, FileSpreadsheet
} from 'lucide-react';
import { CaseRow, AuditLog, CaseEditorDraft } from '../types';
import { splitTasks } from '../data/mockData';

interface CaseDetailsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRow: CaseRow | null;
  fetchingLatestRow: boolean;
  tempRowData: CaseEditorDraft;
  setTempRowData: React.Dispatch<React.SetStateAction<CaseEditorDraft>>;
  saveSuccess: boolean;
  saveFeedback?: string | null;
  isOffline?: boolean;
  savingRow: boolean;
  handleSaveActionables: () => void;
  loadingAuditLogs: boolean;
  auditLogs: AuditLog[];
}

interface ParsedRemark {
  date: string;
  author: string;
  text: string;
}

// Remarks parser according to Regex Engineering Constraint
function parseRemarks(remarksStr: string): ParsedRemark[] {
  if (!remarksStr) return [];
  
  const lines = remarksStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results: ParsedRemark[] = [];

  for (const line of lines) {
    // 1. Try to match custom saved format: [DD/MM/YYYY] username: text or [DD/MM/YYYY (user)]: text
    const ourFormatRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\(([^)]+)\))?\]\s*([^:]+):\s*(.*)$/;
    const matchOur = line.match(ourFormatRegex);
    if (matchOur) {
      const date = matchOur[1];
      const author = matchOur[3].trim();
      const text = matchOur[4].trim();
      results.push({ date, author, text });
      continue;
    }

    const ourFormatRegex2 = /^\[(\d{1,2}\/\d{1,2}\/\d{4})\]\s*([^:]+):\s*(.*)$/;
    const matchOur2 = line.match(ourFormatRegex2);
    if (matchOur2) {
      const date = matchOur2[1];
      const author = matchOur2[2].trim();
      const text = matchOur2[3].trim();
      results.push({ date, author, text });
      continue;
    }

    // 2. Try to match the hyphenated format: - text - user - DD/MM/YYYY HH:MM
    const cleanLine = line.startsWith('-') ? line.slice(1).trim() : line;
    const parts = cleanLine.split(' - ').map(p => p.trim());
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      const secondLastPart = parts[parts.length - 2];
      const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{4})/;
      const matchDate = lastPart.match(dateRegex);
      if (matchDate) {
        const date = matchDate[1];
        const author = secondLastPart;
        const text = parts.slice(0, parts.length - 2).join(' - ');
        results.push({ date, author, text });
        continue;
      }
    }

    // Fallback: Use line itself and extract date if any
    const fallbackDateRegex = /(\d{1,2}\/\d{1,2}\/\d{4})/;
    const matchFallbackDate = line.match(fallbackDateRegex);
    const date = matchFallbackDate ? matchFallbackDate[1] : '';
    results.push({
      date: date || 'System Log',
      author: 'Update',
      text: line
    });
  }

  // Return the 3 most recent entries in reverse (newest first)
  return results.slice(-3).reverse();
}

export const CaseDetailsSidebar: React.FC<CaseDetailsSidebarProps> = ({
  isOpen,
  onClose,
  selectedRow,
  fetchingLatestRow,
  tempRowData,
  setTempRowData,
  saveSuccess,
  saveFeedback = null,
  isOffline = false,
  savingRow,
  handleSaveActionables,
  loadingAuditLogs,
  auditLogs
}) => {
  const [copied, setCopied] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<Record<string, boolean>>({
    crm: true,      // Accordion A: CRM & Journey Health (Default: Open)
    finance: false,  // Accordion B: Finance, Forms & Underwriting (Default: Closed)
    ops: false,      // Accordion C: Ops & Logistics (Default: Closed)
    ai: false,       // Accordion D: AI Co-Pilot & ML (Default: Closed)
    history: false,  // Accordion E: History (Default: Closed)
  });

  // Reset copied status on opening new row
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
    }
  }, [isOpen, selectedRow?.bookingId]);

  if (!isOpen || !selectedRow) return null;

  const toggleAccordion = (key: string) => {
    setOpenAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatCurrencyLocal = (val: number | string | undefined | null) => {
    if (val === undefined || val === null || val === '') return '';
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return 'INR ' + num.toLocaleString('en-IN');
  };

  // Helper for conditional field rendering (Hides label entirely if data is null/blank)
  const renderField = (label: string, value: any, formatter?: (val: any) => string) => {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const displayVal = formatter ? formatter(value) : String(value);
    return (
      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/50 transition-colors">
        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-extrabold font-mono mb-0.5">{label}</span>
        <span className="block text-xs font-bold text-slate-800 break-words">{displayVal}</span>
      </div>
    );
  };

  const renderGrid = (fields: { label: string; value: any; formatter?: (val: any) => string }[]) => {
    const renderedFields = fields.map(f => renderField(f.label, f.value, f.formatter)).filter(Boolean);
    if (renderedFields.length === 0) {
      return (
        <div className="p-3 text-center text-[10px] text-slate-400 italic bg-slate-50 rounded-xl border border-slate-150">
          No data recorded for this section.
        </div>
      );
    }
    return <div className="grid grid-cols-2 gap-2.5">{renderedFields}</div>;
  };

  // Stepper Stages for Lead Milestones
  const stages = [
    { name: 'Lead Created', value: selectedRow.latestLeadCreationTimestamp },
    { name: 'Case Logged In', value: selectedRow.latestLoginTime },
    { name: 'Credit Assessed', value: selectedRow.latestCreditAssessedTimestamp },
    { name: 'Diligence Assessed', value: selectedRow.latestDiligenceAssessedTimestamp },
    { name: 'T&C Accepted', value: selectedRow.tncAcceptedTimestamp },
    { name: 'FCU Checked', value: selectedRow.latestFcuAssessedTimestamp },
    { name: 'Submitted to Ops', value: selectedRow.submitToOpsTimestamp },
    { name: 'Finance Disbursed', value: selectedRow.financeDisbursedTimestamp },
  ];

  const lastActiveIndex = stages.reduce((acc, stage, idx) => stage.value ? idx : acc, -1);

  // Copy Deep Link
  const handleCopyLink = () => {
    const deepLink = `${window.location.origin}/?bookingId=${selectedRow.bookingId}`;
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const contactNo = selectedRow.contactNumber ? String(selectedRow.contactNumber).replace(/[^0-9]/g, '') : '';
  const waUrl = contactNo ? `https://wa.me/${contactNo}` : '#';

  // Math for Financial Progress Bar
  const collected = Number(selectedRow.amountCollected || 0);
  const expected = Number(selectedRow.totalExpectedAmount || 0);
  const pending = Number(selectedRow.amountPending || 0);
  const progressPct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  const isCollectedFull = pending <= 0;

  // Blocker Alerts triggers
  const showCancelAlert = !!selectedRow.cancelReqDate;
  const cancelDisplayReason = selectedRow.cancelReason ? String(selectedRow.cancelReason).trim() : 'System Auto-Cancelled / No Reason Provided';
  const showCreditAlert = !!selectedRow.creditRejectionReason;
  const showDiligenceAlert = !!selectedRow.diligenceRejectionReason;
  const hasBlockers = showCancelAlert || showCreditAlert || showDiligenceAlert;

  // Remarks parsing for Feed
  const parsedRemarksList = parseRemarks(selectedRow.reviewerRemarks || '');

  // AI accordion conditional logic
  const showAiAccordion = !!selectedRow.confidenceScore;
  const pctConfidence = selectedRow.confidenceScore ? Math.round(Number(selectedRow.confidenceScore) * 100) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs"
          />

          {/* Sidebar Slider Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed top-0 right-0 h-screen w-full sm:max-w-xl bg-white shadow-2xl border-l border-slate-100 z-50 overflow-hidden flex flex-col font-sans"
          >
            {/* 1. Sticky Header (Persistent Context) */}
            <div className="p-4 border-b border-slate-800 bg-slate-950 text-white shrink-0">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-wider text-amber-500 uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      Unified Booking record
                    </span>
                    {fetchingLatestRow && (
                      <span className="text-[9px] text-amber-500 font-mono animate-pulse flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" /> syncing...
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold tracking-tight text-white font-mono flex items-center gap-2">
                    <span>{selectedRow.bookingId}</span>
                    {selectedRow.carRegNo && (
                      <>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-300 font-medium">{selectedRow.carRegNo}</span>
                      </>
                    )}
                  </h3>
                  {(selectedRow.make || selectedRow.model || selectedRow.variant) && (
                    <p className="text-xs text-slate-400 font-medium">
                      {[selectedRow.make, selectedRow.model, selectedRow.variant].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Quick Actions Iconography */}
                  {contactNo && (
                    <>
                      <a 
                        href={`tel:${contactNo}`}
                        className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                        title={`Call ${contactNo}`}
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                      </a>
                      <a 
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-emerald-450 hover:text-emerald-400 transition-all cursor-pointer"
                        title="Open WhatsApp chat"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </a>
                    </>
                  )}
                  <button
                    onClick={handleCopyLink}
                    className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer relative"
                    title="Copy Deep Link to Clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Status Badges Row */}
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-900">
                {selectedRow.leadStage && (
                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Stage: {selectedRow.leadStage}
                  </span>
                )}
                {selectedRow.tokenType && (
                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    Token: {selectedRow.tokenType}
                  </span>
                )}
                {selectedRow.leadStatus && (
                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Lead: {selectedRow.leadStatus}
                  </span>
                )}
                {selectedRow.dealStatus && (
                  <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                    selectedRow.dealStatus.includes('Cancel')
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    Deal: {selectedRow.dealStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Vertical Scrollable Panel Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* 2. Critical Blocker Banner (Conditional) */}
              {hasBlockers && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-900 space-y-2.5 animate-fade-in shadow-xs">
                  <h4 className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-700">
                    <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" /> Critical Blockers Detected
                  </h4>
                  
                  <div className="space-y-1.5 text-xs">
                    {showCancelAlert && (
                      <div className="p-2.5 bg-white border border-rose-200/50 rounded-xl">
                        <span className="block text-[9px] font-bold text-rose-600 uppercase tracking-wider mb-0.5">
                          Cancel Requested On: {selectedRow.cancelReqDate}
                        </span>
                        <p className="font-semibold text-rose-900 font-sans">
                          {cancelDisplayReason}
                        </p>
                      </div>
                    )}
                    {showCreditAlert && (
                      <div className="p-2.5 bg-white border border-rose-200/50 rounded-xl">
                        <span className="block text-[9px] font-bold text-rose-600 uppercase tracking-wider mb-0.5">
                          Credit Rejection Alert
                        </span>
                        <p className="font-extrabold text-rose-950 font-sans">
                          {selectedRow.creditRejectionReason}
                          {selectedRow.creditRejectionSubReason && (
                            <span className="block text-[10px] font-semibold text-slate-500 mt-0.5">
                              Sub-reason: {selectedRow.creditRejectionSubReason}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {showDiligenceAlert && (
                      <div className="p-2.5 bg-white border border-rose-200/50 rounded-xl">
                        <span className="block text-[9px] font-bold text-rose-600 uppercase tracking-wider mb-0.5">
                          Diligence Rejection Alert
                        </span>
                        <p className="font-extrabold text-rose-950 font-sans">
                          {selectedRow.diligenceRejectionReason}
                          {selectedRow.diligenceRejectionSubReason && (
                            <span className="block text-[10px] font-semibold text-slate-500 mt-0.5">
                              Sub-reason: {selectedRow.diligenceRejectionSubReason}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. The Action & Execution Zone (Always Expanded) */}
              <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 space-y-4 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-amber-600" />
                <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800">
                  <ShieldCheck className="w-4 h-4 text-amber-500" /> Action &amp; Execution Zone
                </h4>

                {/* A. Immediate Bottleneck & Financials */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Task Bucket info */}
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60 flex flex-col justify-between">
                    <div>
                      <span className="block text-[8px] text-slate-450 uppercase font-mono tracking-wider font-extrabold">Immediate Bottleneck</span>
                      {selectedRow.taskBucket ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {splitTasks(selectedRow.taskBucket).map((t, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-medium italic block mt-1">No immediate task bottleneck.</span>
                      )}
                    </div>
                    {selectedRow.reasonPointer && (
                      <p className="text-[10px] text-slate-400 leading-relaxed font-sans mt-2 border-t border-slate-900 pt-2 break-words">
                        <span className="font-semibold text-slate-300">Pointer:</span> {selectedRow.reasonPointer}
                      </p>
                    )}
                  </div>

                  {/* Financial Health Progress Bar */}
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60 space-y-2">
                    <div className="flex justify-between items-center text-[8px] font-extrabold text-slate-450 font-mono tracking-wider">
                      <span>FINANCIAL HEALTH</span>
                      <span className={isCollectedFull ? 'text-emerald-450' : 'text-amber-500'}>
                        {progressPct}% COLLECTED
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className={`h-full transition-all duration-300 ${isCollectedFull ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                        style={{ width: `${progressPct}%` }} 
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[8.5px] font-mono text-slate-400">
                      <div>Coll: <span className="font-bold text-slate-200">{formatCurrencyLocal(collected)}</span></div>
                      <div className="text-center">Pend: <span className={`font-bold ${pending > 0 ? 'text-amber-550' : 'text-emerald-450'}`}>{formatCurrencyLocal(pending)}</span></div>
                      <div className="text-right">Exp: <span className="font-bold text-slate-200">{formatCurrencyLocal(expected)}</span></div>
                    </div>
                  </div>
                </div>

                {/* B. Current Context Feed (Read-Only) */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60 space-y-2.5">
                  <span className="block text-[8px] text-slate-450 uppercase font-mono tracking-wider font-extrabold">
                    Latest Sheet Context (3 Most Recent Log Entries)
                  </span>

                  {fetchingLatestRow ? (
                    <div className="space-y-1.5 py-1">
                      <div className="h-6 bg-slate-900 animate-pulse rounded-lg" />
                      <div className="h-6 bg-slate-900 animate-pulse rounded-lg" />
                    </div>
                  ) : parsedRemarksList.length > 0 ? (
                    <div className="space-y-2">
                      {parsedRemarksList.map((rem, idx) => (
                        <div key={idx} className="p-2 bg-slate-900 border border-slate-850 rounded-lg text-[10.5px] leading-relaxed">
                          <div className="flex items-center justify-between text-[8px] text-slate-450 font-mono mb-0.5">
                            <span className="font-bold text-amber-500">{rem.author}</span>
                            <span>[{rem.date}]</span>
                          </div>
                          <p className="text-slate-200 font-sans">{rem.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic">No formatted historical logs found in this record.</p>
                  )}
                </div>

                {/* C. The 4 Editable Operations Inputs (Write-Access) */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">
                        Ready to Deliver?
                      </label>
                      <select
                        value={tempRowData.readyToDeliver || ''}
                        onChange={e => setTempRowData((p: any) => ({ ...p, readyToDeliver: e.target.value }))}
                        className="w-full text-xs p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">(Blank)</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">
                        Expected OD Date
                      </label>
                      <input
                        type="date"
                        value={tempRowData.expectedOdCompletionDate || ''}
                        onChange={e => setTempRowData((p: any) => ({ ...p, expectedOdCompletionDate: e.target.value }))}
                        className="w-full text-xs p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 mb-1">
                        EDD Date (Reviewer)
                      </label>
                      <input
                        type="date"
                        value={tempRowData.eddReviewerDate || ''}
                        onChange={e => setTempRowData((p: any) => ({ ...p, eddReviewerDate: e.target.value }))}
                        className="w-full text-xs p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 mb-1 flex justify-between">
                      <span>Add Remark (Append Only)</span>
                      <span className="text-[8px] text-slate-500 font-mono font-normal">will concatenate to remarks timeline</span>
                    </label>
                    <textarea
                      rows={2}
                      value={tempRowData.newRemarkAddition || ''}
                      onChange={e => setTempRowData((p: any) => ({ ...p, newRemarkAddition: e.target.value }))}
                      placeholder="Type remark text here to append..."
                      className="w-full text-xs p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-slate-600"
                    />
                  </div>

                  {/* Save feedback banner */}
                  <AnimatePresence>
                    {saveFeedback && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[10px] font-bold leading-normal ${
                          saveFeedback.includes('Failed')
                            ? 'bg-rose-950/40 border border-rose-900/40 text-rose-300'
                            : saveFeedback.includes('offline') || saveFeedback.includes('Offline')
                            ? 'bg-amber-950/40 border border-amber-900/40 text-amber-300'
                            : 'bg-emerald-950/40 border border-emerald-900/40 text-emerald-300'
                        }`}
                      >
                        {saveFeedback.includes('Failed') ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        ) : saveFeedback.includes('offline') || saveFeedback.includes('Offline') ? (
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        )}
                        <div>{saveFeedback}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Save trigger action */}
                  <button
                    type="button"
                    onClick={handleSaveActionables}
                    disabled={savingRow}
                    className="w-full p-2.5 rounded-lg text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/10"
                  >
                    {savingRow ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        {isOffline ? "Saving locally to DB cache..." : "Syncing to GSheets Layer..."}
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        {isOffline ? "Save Change (Offline)" : "Save & Sync to Spreadsheet"}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 4. Lead Milestones Tracker (Visual Funnel) */}
              <div className="p-4 bg-white border border-slate-100 rounded-2xl space-y-3.5 shadow-xs">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" /> Lead Milestones Tracker
                </h4>
                
                <div className="overflow-x-auto pb-2 -mx-1 px-1">
                  <div className="flex items-center min-w-[640px] justify-between relative py-2">
                    {stages.map((stage, idx) => {
                      const isActive = idx === lastActiveIndex;
                      const isCompleted = idx < lastActiveIndex && !!stage.value;
                      
                      return (
                        <div key={stage.name} className="flex-1 flex flex-col items-center relative z-10">
                          {/* Connecting Line */}
                          {idx > 0 && (
                            <div className={`absolute top-4 -left-1/2 right-1/2 h-0.5 -translate-y-1/2 -z-10 ${
                              idx <= lastActiveIndex ? 'bg-blue-500' : 'bg-slate-200'
                            }`} />
                          )}
                          
                          {/* Circle Icon */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                            isActive 
                              ? 'bg-blue-50 border-blue-500 text-blue-600 ring-4 ring-blue-500/15'
                              : isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}>
                            {isCompleted ? (
                              <CheckCircle className="w-4 h-4 stroke-[3]" />
                            ) : (
                              <span className="text-[10px] font-bold">{idx + 1}</span>
                            )}
                          </div>
                          
                          {/* Label */}
                          <span className={`text-[9px] font-bold mt-1.5 text-center leading-tight max-w-[75px] ${
                            isActive ? 'text-blue-600 font-black' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                          }`}>
                            {stage.name}
                          </span>
                          
                          {/* Subtext Date */}
                          {stage.value && (
                            <span className="text-[7.5px] text-slate-450 font-mono mt-0.5">
                              {stage.value.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 5. Accordion A: CRM & Journey Health (Default: Open) */}
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                <button
                  onClick={() => toggleAccordion('crm')}
                  className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 transition-colors select-none cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wide">
                    <Clock className="w-4 h-4 text-blue-500" /> Accordion A: CRM &amp; Journey Health
                  </span>
                  {openAccordion.crm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openAccordion.crm && (
                  <div className="p-3.5 bg-white border-t border-slate-100">
                    {renderGrid([
                      { 
                        label: 'Attempts / Connected', 
                        value: selectedRow.totalCallAttempts || selectedRow.totalConnectedCalls 
                          ? `${selectedRow.totalCallAttempts || 0} / ${selectedRow.totalConnectedCalls || 0}`
                          : null 
                      },
                      { label: 'Latest Outcome', value: selectedRow.latestCallOutcome },
                      { label: 'Last Call At', value: selectedRow.lastCallAt },
                      { label: 'Funnel Stage', value: selectedRow.funnelStage },
                    ])}
                  </div>
                )}
              </div>

              {/* 6. Accordion B: Finance, Forms & Underwriting (Default: Closed) */}
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                <button
                  onClick={() => toggleAccordion('finance')}
                  className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 transition-colors select-none cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wide">
                    <Database className="w-4 h-4 text-emerald-500" /> Accordion B: Finance &amp; Underwriting
                  </span>
                  {openAccordion.finance ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openAccordion.finance && (
                  <div className="p-3.5 bg-white border-t border-slate-100 space-y-4">
                    <div>
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Commercials &amp; Loan Details</h5>
                      {renderGrid([
                        { label: 'Payment Type', value: selectedRow.paymentType },
                        { label: 'Credit LTV', value: selectedRow.creditLtv },
                        { label: 'Final ROI', value: selectedRow.finalRoi ? `${selectedRow.finalRoi}%` : null },
                        { label: 'DS ROI', value: selectedRow.dsRoi ? `${selectedRow.dsRoi}%` : null },
                        { label: 'Sales Price', value: selectedRow.agreedSalesPrice, formatter: formatCurrencyLocal },
                      ])}
                    </div>

                    <div>
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Partner Info</h5>
                      {renderGrid([
                        { label: 'Sheet Login Partner', value: selectedRow.sheetLoginPartner },
                        { label: 'Bajaj Segment', value: selectedRow.bajajSegment },
                      ])}
                    </div>

                    <div>
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Form Assessment</h5>
                      {renderGrid([
                        { label: 'Form Risk Bucket', value: selectedRow.formRiskBucket },
                        { label: 'Form Status', value: selectedRow.formFinalStatus },
                        { label: 'Form Case Stage', value: selectedRow.formCaseStage },
                        { label: 'Form Detailed Ask', value: selectedRow.formDetailedAsk },
                        { label: 'Sheet Status', value: selectedRow.sheetFinalStatus },
                      ])}
                    </div>
                  </div>
                )}
              </div>

              {/* 7. Accordion C: Ops & Logistics (Default: Closed) */}
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                <button
                  onClick={() => toggleAccordion('ops')}
                  className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 transition-colors select-none cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wide">
                    <Activity className="w-4 h-4 text-amber-500" /> Accordion C: Ops &amp; Logistics
                  </span>
                  {openAccordion.ops ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openAccordion.ops && (
                  <div className="p-3.5 bg-white border-t border-slate-100 space-y-4">
                    <div>
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Location &amp; Facility</h5>
                      {renderGrid([
                        { label: 'Hub Name', value: selectedRow.hubName },
                        { label: 'City', value: selectedRow.city },
                        { label: 'Sheet Yard Name', value: selectedRow.sheetYardName },
                      ])}
                    </div>

                    <div>
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Delivery Parameters</h5>
                      {renderGrid([
                        { label: 'Expected Delivery Date', value: selectedRow.expectedDeliveryDate },
                        { label: 'Actual Delivery Date', value: selectedRow.actualDeliveryDate },
                        { label: 'Delivery Segment', value: selectedRow.deliverySegment },
                      ])}
                    </div>

                    <div>
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Condition Flags</h5>
                      {renderGrid([
                        { label: 'On Demand Status', value: selectedRow.onDemandStatus },
                        { label: 'RC Case Type', value: selectedRow.rcCaseType },
                        { label: 'Delivery Status', value: selectedRow.deliveryStatus },
                      ])}
                    </div>
                  </div>
                )}
              </div>

              {/* 8. Accordion D: AI Co-Pilot & ML (Default: Closed, Conditional visibility) */}
              {showAiAccordion && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                  <button
                    onClick={() => toggleAccordion('ai')}
                    className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 transition-colors select-none cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 uppercase tracking-wide text-blue-650">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Accordion D: AI Co-Pilot &amp; ML
                    </span>
                    {openAccordion.ai ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {openAccordion.ai && (
                    <div className="p-3.5 bg-white border-t border-slate-100 space-y-4">
                      {/* circular visual gauge */}
                      <div className="flex items-center gap-4 p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="relative shrink-0">
                          <svg className="w-14 h-14" viewBox="0 0 36 36">
                            <path
                              className="text-slate-200"
                              strokeWidth="3.5"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className="text-blue-600"
                              strokeWidth="3.5"
                              strokeDasharray={`${pctConfidence}, 100`}
                              strokeLinecap="round"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <text x="18" y="20.8" className="text-[8px] font-black text-slate-800 font-mono" textAnchor="middle">
                              {pctConfidence}%
                            </text>
                          </svg>
                        </div>
                        <div>
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold font-mono">Confidence Score</span>
                          <span className="block text-xs font-semibold text-slate-700 mt-0.5 leading-normal">
                            Machine Learning score for delivery timeline health.
                          </span>
                        </div>
                      </div>

                      {renderGrid([
                        { label: 'ML Est Delivery Date', value: selectedRow.mlEstimatedDeliveryDate },
                        { label: 'Gmail Pendency Status', value: selectedRow.gmailPendencyStatus },
                        { label: 'Gmail Pendency Reason', value: selectedRow.gmailPendencyReason },
                      ])}
                    </div>
                  )}
                </div>
              )}

              {/* Accordion E: Revision History (Default: Closed) */}
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                <button
                  onClick={() => toggleAccordion('history')}
                  className="w-full p-3.5 bg-slate-50 hover:bg-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 transition-colors select-none"
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wide">
                    <Clock className="w-4 h-4 text-purple-500" /> Revision History
                  </span>
                  {openAccordion.history ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openAccordion.history && (
                  <div className="p-3.5 bg-white border-t border-slate-100 space-y-4">
                    {loadingAuditLogs ? (
                      <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                        <span className="text-[10px]">Loading audit log timeline...</span>
                      </div>
                    ) : auditLogs.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 italic text-[11px] bg-slate-50 border border-slate-150 rounded-xl">
                        No changes logged for this case.
                      </div>
                    ) : (
                      <div className="relative pl-5 border-l border-slate-100 space-y-4 py-1">
                        {auditLogs.map((log) => {
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
                            : 'Unknown Date';
                          
                          return (
                            <div key={log.id} className="relative text-xs">
                              {/* Timeline bullet dot */}
                              <div className="absolute -left-[25.5px] top-1 w-2 h-2 rounded-full bg-amber-500 border-2 border-white ring-4 ring-amber-500/10 shrink-0" />
                              
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center justify-between text-[8px] text-slate-400 font-mono">
                                  <span className="font-bold text-slate-650">{log.changed_by.split('@')[0]}</span>
                                  <span>{formattedDate}</span>
                                </div>
                                <div className="font-bold text-slate-800">
                                  Modified <span className="text-amber-600 font-extrabold">{friendlyCol}</span>
                                </div>
                                
                                {/* Diff Block */}
                                <div className="mt-1 bg-slate-50 p-2 border border-slate-100 rounded-lg space-y-0.5 font-mono text-[9.5px]">
                                  <div className="text-rose-600 line-through truncate" title={log.old_value || ''}>
                                    - {log.old_value || 'Empty'}
                                  </div>
                                  <div className="text-emerald-700 font-semibold truncate" title={log.new_value || ''}>
                                    + {log.new_value || 'Empty'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

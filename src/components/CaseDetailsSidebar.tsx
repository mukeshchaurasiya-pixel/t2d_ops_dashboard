/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ExternalLink, RefreshCw, X, ShieldCheck, Clock, Activity, Sparkles, 
  Database, CheckCircle, PhoneCall, AlertCircle, Search, ShieldAlert, FileSpreadsheet
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
  const [sidebarTab, setSidebarTab] = useState<'actions' | 'journey' | 'pmax' | 'copilot' | 'raw_data' | 'history'>('actions');
  const [rawSearchQuery, setRawSearchQuery] = useState('');

  // Reset tab and search query when a new row is opened
  useEffect(() => {
    if (isOpen && selectedRow) {
      setSidebarTab('actions');
      setRawSearchQuery('');
    }
  }, [isOpen, selectedRow?.bookingId]);

  if (!isOpen || !selectedRow) return null;

  const keyDates = [
    { label: 'Token Date', value: selectedRow.tokenDate || selectedRow.tokenDateTime, tone: 'slate' },
    { label: 'Latest Login', value: selectedRow.latestLoginTime || selectedRow.sheetLoginTimestamp, tone: 'slate' },
    { label: 'Expected OD', value: selectedRow.expectedOdCompletionDate, tone: 'amber' },
    { label: 'Expected Delivery', value: selectedRow.expectedDeliveryDate, tone: 'brand' },
    { label: 'Cancel Request', value: selectedRow.cancelReqDate, tone: 'rose' },
    { label: 'Actual Delivery', value: selectedRow.actualDeliveryDate, tone: 'emerald' },
  ];

  const actionContext = [
    { label: 'Lead Stage', value: selectedRow.leadStage || '-', tone: 'bg-brand-blue/10 text-brand-blue border-brand-blue/20' },
    { label: 'Deal Status', value: selectedRow.dealStatus || '-', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
    { label: 'Sheet Status', value: selectedRow.sheetFinalStatus || '-', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    { label: 'Form Status', value: selectedRow.formFinalStatus || '-', tone: 'bg-violet-50 text-violet-700 border-violet-100' },
  ];

  const paymentCards = [
    { label: 'Payment %', value: selectedRow.paymentPercentage ? `${(Number(selectedRow.paymentPercentage) * 100).toFixed(2)}%` : '0%' },
    { label: 'Collected', value: selectedRow.amountCollected ? Number(selectedRow.amountCollected).toLocaleString('en-IN') : '0' },
    { label: 'Pending', value: selectedRow.amountPending ? Number(selectedRow.amountPending).toLocaleString('en-IN') : '0' },
    { label: 'Expected', value: selectedRow.totalExpectedAmount ? Number(selectedRow.totalExpectedAmount).toLocaleString('en-IN') : '0' },
  ];

  const timelineEntries = [
    { label: 'Lead Created', value: selectedRow.latestLeadCreationTimestamp },
    { label: 'Token Paid', value: selectedRow.tokenDate || selectedRow.tokenDateTime },
    { label: 'Login / Sheet Entry', value: selectedRow.latestLoginTime || selectedRow.sheetLoginTimestamp },
    { label: 'Last Call', value: selectedRow.lastCallAt },
    { label: 'Follow-up', value: selectedRow.followupAt },
    { label: 'Cancel Request', value: selectedRow.cancelReqDate },
    { label: 'Cancellation', value: selectedRow.cancellationDate },
    { label: 'Actual Delivery', value: selectedRow.actualDeliveryDate },
  ].filter(item => item.value);

  const pmaxSignals = [
    { label: 'Loan ID', value: selectedRow.loanId || '-' },
    { label: 'Payment Type', value: selectedRow.paymentType || '-' },
    { label: 'Sheet Login Partner', value: selectedRow.sheetLoginPartner || '-' },
    { label: 'Sheet Final Status', value: selectedRow.sheetFinalStatus || '-' },
    { label: 'Final ROI', value: selectedRow.finalRoi ? `${selectedRow.finalRoi}%` : '-' },
    { label: 'DS ROI', value: selectedRow.dsRoi ? `${selectedRow.dsRoi}%` : '-' },
    { label: 'Credit LTV', value: selectedRow.creditLtv || '-' },
    { label: 'Agreed Sales Price', value: selectedRow.agreedSalesPrice ? Number(selectedRow.agreedSalesPrice).toLocaleString('en-IN') : '0' },
  ];

  const copilotFlags = [
    { label: 'ML EDD', value: selectedRow.mlEstimatedDeliveryDate || 'N/A' },
    { label: 'Confidence', value: selectedRow.confidenceScore ? `${(parseFloat(selectedRow.confidenceScore) * 100).toFixed(0)}%` : 'N/A' },
    { label: 'Gmail Pendency', value: selectedRow.gmailPendencyStatus || 'None' },
    { label: 'On Demand', value: selectedRow.onDemandStatus || 'Blank' },
  ];

  const rawGroups: Array<{ title: string; keys: (keyof CaseRow)[] }> = [
    { title: 'Case & Ownership', keys: ['bookingId', 'uid', 'leadId', 'userId', 'loanId', 'appointmentId', 'city', 'hubCode', 'hubName', 'allocatedRm', 'assignedDc', 'sm', 'tm', 'rm'] },
    { title: 'Vehicle & Customer', keys: ['carRegNo', 'make', 'model', 'variant', 'manufacturingYear', 'companyName', 'contactNumber'] },
    { title: 'Stage & Delivery', keys: ['leadStage', 'leadStatus', 'dealStatus', 'funnelStage', 'tokenType', 'tokenTypeWithNrt', 'paymentType', 'readyToDeliver', 'onDemandStatus', 'deliveryStatus', 'deliverySegment', 'taskBucket', 'reasonPointer'] },
    { title: 'Payments & Finance', keys: ['paymentPercentage', 'amountCollected', 'amountPending', 'totalExpectedAmount', 'agreedSalesPrice', 'sheetLoginPartner', 'sheetFinalStatus', 'finalRoi', 'dsRoi', 'creditLtv', 'foir'] },
    { title: 'CRM & AI', keys: ['lastCallAt', 'followupAt', 'latestCallOutcome', 'lastDisposition', 'latestRemark', 'latestRemarkBy', 'latestRemarkDate', 'gmailSummary', 'gmailPendencyStatus', 'gmailPendencyReason', 'gmailNextAction', 'gmailPendencySource', 'gmailPendencyDate', 'mlEstimatedDeliveryDate', 'confidenceScore'] },
    { title: 'Dates & Milestones', keys: ['tokenDate', 'tokenDateTime', 'bookingDate', 'expectedOdCompletionDate', 'expectedDeliveryDate', 'actualDeliveryDate', 'cancelReqDate', 'cancellationDate', 'sheetLoginTimestamp', 'submitToOpsTimestamp', 'sentToOpsTimestamp', 'sentToRcuTimestamp', 'financeDisbursedTimestamp', 'opsDisbursalTimestamp'] },
  ];

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
            className="fixed top-0 right-0 h-screen w-full sm:max-w-xl bg-white shadow-2xl border-l border-slate-100 z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="p-1 px-2 bg-brand-orange text-white text-[9px] uppercase tracking-wider font-extrabold rounded-md leading-none">
                    Active Booking Case Record
                  </span>
                  <span className="text-[10px] text-slate-300 font-mono">
                    Row Number: {selectedRow._rowNumber}
                  </span>
                </div>
                <h3 className="text-lg font-sans font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
                  <span>{selectedRow.bookingId}</span>
                  {(selectedRow.userId || selectedRow.uid) && (
                    <a 
                      href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(selectedRow.userId || selectedRow.uid || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-brand-blue hover:bg-brand-blue/90 text-white text-[10px] font-mono font-bold uppercase transition-all"
                      title="Open WMFACT LMS customer detail page"
                    >
                      WMFACT <ExternalLink className="w-2.5 h-2.5 text-white/90" />
                    </a>
                  )}
                  {fetchingLatestRow && (
                    <span className="text-xs text-brand-orange font-mono animate-pulse flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching latest...
                    </span>
                  )}
                </h3>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sticky Tab Selector */}
            <div className="flex border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-500 font-sans shrink-0 select-none overflow-x-auto no-scrollbar scroll-smooth">
              <button
                type="button"
                onClick={() => setSidebarTab('actions')}
                className={`flex-1 min-w-[90px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                  sidebarTab === 'actions'
                    ? 'border-brand-orange text-brand-orange bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>ACTIONS</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('journey')}
                className={`flex-1 min-w-[100px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                  sidebarTab === 'journey'
                    ? 'border-brand-orange text-brand-orange bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>JOURNEY / CRM</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('pmax')}
                className={`flex-1 min-w-[95px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                  sidebarTab === 'pmax'
                    ? 'border-brand-orange text-brand-orange bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>PMAX STATUS</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('copilot')}
                className={`flex-1 min-w-[95px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                  sidebarTab === 'copilot'
                    ? 'border-brand-orange text-brand-orange bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>AI CO-PILOT</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('raw_data')}
                className={`flex-1 min-w-[90px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                  sidebarTab === 'raw_data'
                    ? 'border-brand-orange text-brand-orange bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                }`}
              >
                <Database className="w-4 h-4" />
                <span>RAW DATA</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('history')}
                className={`flex-1 min-w-[90px] py-3 text-center border-b-2 transition-all cursor-pointer flex flex-col items-center gap-1 leading-none ${
                  sidebarTab === 'history'
                    ? 'border-brand-orange text-brand-orange bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>HISTORY</span>
              </button>
            </div>

            {/* Slider Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {sidebarTab === 'actions' && (
                <div className="space-y-5">
                  {/* Micro Actions Block */}
                  <div className="p-4 bg-brand-orange/5 border border-brand-orange/20 rounded-2xl space-y-4">
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-brand-orange mb-1 uppercase tracking-wide border-b border-brand-orange/10 pb-1.5">
                      <ShieldCheck className="w-4 h-4 text-brand-orange" /> Actionable Inputs Layer
                    </h4>

                    <div className="space-y-3.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        {actionContext.map(item => (
                          <div key={item.label} className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">{item.label}</span>
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${item.tone}`}>
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {paymentCards.map(item => (
                          <div key={item.label} className="p-2.5 bg-white border border-slate-200 rounded-xl">
                            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">{item.label}</span>
                            <span className="block mt-1 text-[11px] font-extrabold text-slate-800">{item.value}</span>
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Ready to Deliver?
                        </label>
                        <select
                          value={tempRowData.readyToDeliver || ''}
                          onChange={e => setTempRowData((p: any) => ({ ...p, readyToDeliver: e.target.value }))}
                          className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white"
                        >
                          <option value="">Blank</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            On Demand Status
                          </label>
                          <input
                            type="text"
                            value={tempRowData.onDemandStatus || ''}
                            onChange={e => setTempRowData((p: any) => ({ ...p, onDemandStatus: e.target.value }))}
                            placeholder="e.g. APPROVED / CHECKED_IN"
                            className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Delivery Status
                          </label>
                          <input
                            type="text"
                            value={tempRowData.deliveryStatus || ''}
                            onChange={e => setTempRowData((p: any) => ({ ...p, deliveryStatus: e.target.value }))}
                            placeholder="Current delivery state"
                            className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Expected Delivery Date
                          </label>
                          <input
                            type="date"
                            value={tempRowData.expectedDeliveryDate || ''}
                            onChange={e => setTempRowData((p: any) => ({ ...p, expectedDeliveryDate: e.target.value }))}
                            className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Cancel Request Date
                          </label>
                          <input
                            type="date"
                            value={tempRowData.cancelReqDate || ''}
                            onChange={e => setTempRowData((p: any) => ({ ...p, cancelReqDate: e.target.value }))}
                            className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Expected OD Completion Date
                        </label>
                        <input
                          type="date"
                          value={tempRowData.expectedOdCompletionDate || ''}
                          onChange={e => setTempRowData((p: any) => ({ ...p, expectedOdCompletionDate: e.target.value }))}
                          className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {keyDates.map(item => (
                          <div key={item.label} className={`p-2.5 rounded-xl border ${
                            item.tone === 'rose' ? 'bg-rose-50 border-rose-100' :
                            item.tone === 'amber' ? 'bg-amber-50 border-amber-100' :
                            item.tone === 'brand' ? 'bg-brand-blue/5 border-brand-blue/10' :
                            item.tone === 'emerald' ? 'bg-emerald-50 border-emerald-100' :
                            'bg-slate-50 border-slate-200'
                          }`}>
                            <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">{item.label}</span>
                            <span className="block mt-1 text-[11px] font-bold text-slate-800">{item.value || '-'}</span>
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          EDD Date Reviewer
                        </label>
                        <input
                          type="date"
                          value={tempRowData.eddReviewerDate || ''}
                          onChange={e => setTempRowData((p: any) => ({ ...p, eddReviewerDate: e.target.value }))}
                          className="w-full text-xs p-2 border border-slate-200 focus:border-brand-orange focus:ring-brand-orange rounded-lg bg-white font-mono"
                        />
                      </div>

                      {/* Remarks Everyone (TL/RM/FS/HH) Read-Only Block */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Remarks Everyone (TL/RM/FS/HH) in Sheet
                        </label>
                        {fetchingLatestRow ? (
                          <div className="w-full h-16 bg-brand-orange/5 border border-dashed border-brand-orange/20 rounded-lg animate-pulse flex items-center justify-center text-[10px] text-brand-orange/70 font-mono">
                            Refreshing live remarks from GSheets...
                          </div>
                        ) : (
                          <div className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50/50 text-slate-800 font-sans leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto shadow-inner">
                            {tempRowData.reviewerRemarks ? (
                              tempRowData.reviewerRemarks
                            ) : (
                              <span className="text-slate-400 italic">No existing remarks found in sheet.</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Extra Remark Addition Textarea */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                          <span>Extra Remark Addition</span>
                          <span className="text-[9px] text-slate-400 font-normal">Additions will append dynamically</span>
                        </label>
                        <textarea
                          rows={3}
                          value={tempRowData.newRemarkAddition || ''}
                          onChange={e => setTempRowData((p: any) => ({ ...p, newRemarkAddition: e.target.value }))}
                          placeholder="Type additional feedback here to append..."
                          className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange shadow-sm"
                        />
                      </div>

                      {/* Save & Sync button — directly below Extra Remark */}
                      <AnimatePresence>
                        {saveFeedback && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] font-medium leading-normal ${
                              saveFeedback.includes('Failed')
                                ? 'bg-rose-950/20 border border-rose-900/40 text-rose-300'
                                : saveFeedback.includes('offline') || saveFeedback.includes('Offline')
                                ? 'bg-amber-950/20 border border-amber-900/40 text-amber-300'
                                : 'bg-emerald-950/20 border border-emerald-900/40 text-emerald-300'
                            }`}
                          >
                            {saveFeedback.includes('Failed') ? (
                              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            ) : saveFeedback.includes('offline') || saveFeedback.includes('Offline') ? (
                              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            )}
                            <div>{saveFeedback}</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <button
                        type="button"
                        onClick={handleSaveActionables}
                        disabled={savingRow}
                        className="w-full p-2.5 rounded-xl text-xs font-semibold text-white bg-brand-orange hover:bg-brand-orange/95 disabled:opacity-50 transition-all active:scale-97 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {savingRow ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            {isOffline ? "Saving to database cache..." : "Synchronizing to GSheets Layer..."}
                          </>
                        ) : (
                          isOffline ? "Save Change (Offline)" : "Save & Sync back to Spreadsheet"
                        )}
                      </button>

                      {/* Latest Remark from GSheet Section */}
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 shadow-inner">
                        <div className="flex items-center justify-between">
                          <span className="block text-[10px] uppercase font-bold text-slate-555 tracking-wider">
                            Latest Remark (From Sheet Column)
                          </span>
                          {(tempRowData.latestRemarkBy || tempRowData.latestRemarkDate) && (
                            <span className="text-[9px] font-mono text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                              {tempRowData.latestRemarkBy || 'System'} &bull; {tempRowData.latestRemarkDate || '-'}
                            </span>
                          )}
                        </div>
                        
                        {fetchingLatestRow ? (
                          <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
                        ) : (
                          <p className="text-xs text-slate-700 italic bg-white p-3 rounded-lg border border-slate-200/50 leading-relaxed font-sans whitespace-pre-wrap">
                            {tempRowData.latestRemark ? (
                              tempRowData.latestRemark
                            ) : (
                              <span className="text-slate-400 italic">No live latest_remark recorded in this sheet row.</span>
                            )}
                          </p>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Actionable Task & Context Detail */}
                  <div className="p-4 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl space-y-3">
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-brand-blue uppercase tracking-wider pb-1.5 border-b border-brand-blue/10">
                      <Activity className="w-4 h-4 text-brand-blue" /> Active Operational Target
                    </h4>
                    <div>
                      <span className="block text-[10px] text-slate-450 uppercase font-mono tracking-wider font-semibold">Active Task Bucket</span>
                      {selectedRow.taskBucket ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {splitTasks(selectedRow.taskBucket).map((t, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-blue/10 text-brand-blue border border-brand-blue/20 uppercase font-sans">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic">No immediate task assigned.</span>
                      )}
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-450 uppercase font-mono tracking-wider font-semibold">Reason &amp; Data Pointer</span>
                      <p className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/60 leading-relaxed font-sans mt-1 whitespace-pre-wrap">
                        {selectedRow.reasonPointer || (
                          <span className="text-slate-400 italic">No diagnostic reason pointer provided in datasheet.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Quick Core Details in Actions tab */}
                  <div className="p-4 bg-slate-50 border border-slate-200/40 rounded-2xl grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">Booking ID</span>
                      <span className="font-bold text-slate-800">{selectedRow.bookingId}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">Car Reg No</span>
                      <span className="font-mono font-bold text-slate-800">{selectedRow.carRegNo || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">City</span>
                      <span className="font-semibold text-slate-800">{selectedRow.city || '-'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider">Hub Name</span>
                      <span className="font-semibold text-slate-800">{selectedRow.hubName || '-'}</span>
                    </div>

                    {(selectedRow.userId || selectedRow.uid) && (
                      <div className="col-span-2 border-t border-slate-200/30 pt-3.5 flex flex-col gap-1">
                        <span className="block text-[10px] text-slate-450 uppercase font-mono tracking-wider">WMFACT (LMS Customer Link)</span>
                        <a 
                          href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(selectedRow.userId || selectedRow.uid || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-blue hover:text-brand-blue/80 font-bold underline font-mono text-[11.5px] inline-flex items-center gap-1"
                        >
                          {selectedRow.userId || selectedRow.uid}
                          <ExternalLink className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {sidebarTab === 'journey' && (
                <div className="space-y-6">
                  <div className="p-4 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl space-y-4 shadow-2xs">
                    <h4 className="text-xs font-bold text-brand-blue uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-brand-blue/10">
                      <Clock className="w-4 h-4 text-brand-blue" /> Customer & Ops Timeline
                    </h4>

                    <div className="space-y-3">
                      {timelineEntries.length > 0 ? timelineEntries.map((entry, idx) => (
                        <div key={`${entry.label}-${idx}`} className="flex justify-between items-start gap-3 py-1.5 border-b border-slate-200/40 last:border-b-0">
                          <span className="text-[11px] font-semibold text-slate-600">{entry.label}</span>
                          <span className="text-[11px] font-mono text-slate-800 text-right">{entry.value}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-slate-400 italic">No meaningful CRM or ops timeline markers are available for this case yet.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-white border border-slate-200 rounded-xl p-3">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Latest Call Outcome</span>
                        <span className="block mt-1 font-bold text-slate-800">{selectedRow.latestCallOutcome || '-'}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-3">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Last Disposition</span>
                        <span className="block mt-1 font-bold text-slate-800">{selectedRow.lastDisposition || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Underwriting Credit Risk Profile - Critical Warning Banner at top */}
                  {(() => {
                    const isHighRisk = selectedRow.redChannelFlag === 'Yes' || selectedRow.hardDerogFlag === 'Yes' || !!selectedRow.creditRejectionReason;
                    const isMedRisk = selectedRow.softDerogFlag === 'Yes';
                    
                    return (
                      <div className={`p-4 rounded-2xl border transition-all ${
                        isHighRisk 
                          ? 'bg-rose-50/80 border-rose-200/60 text-rose-800 shadow-xs' 
                          : isMedRisk 
                            ? 'bg-amber-50/80 border-amber-200/60 text-amber-800 shadow-xs' 
                            : 'bg-emerald-50/40 border-emerald-100/80 text-slate-800'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 font-sans">
                            <ShieldAlert className={`w-3.5 h-3.5 ${isHighRisk ? 'text-rose-500 animate-pulse' : isMedRisk ? 'text-amber-500' : 'text-emerald-500'}`} /> 
                            Underwriting Credit Risk Profile
                          </h5>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase font-mono tracking-wide ${
                            isHighRisk 
                              ? 'bg-rose-100 text-rose-700 border border-rose-200/40' 
                              : isMedRisk 
                                ? 'bg-amber-100 text-amber-700 border border-amber-200/40' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/40'
                          }`}>
                            {isHighRisk ? 'High Risk' : isMedRisk ? 'Medium Risk' : 'Clear / Low Risk'}
                          </span>
                        </div>
                        
                        <div className="text-xs space-y-1">
                          {selectedRow.redChannelReason ? (
                            <p className="font-medium text-[11px] leading-relaxed">
                              <span className="font-bold">Red Channel Trigger:</span> {selectedRow.redChannelReason}
                            </p>
                          ) : null}
                          {selectedRow.creditRejectionReason ? (
                            <p className="font-medium text-[11px] leading-relaxed text-rose-700">
                              <span className="font-bold">Credit Rejection Reason:</span> {selectedRow.creditRejectionReason} {selectedRow.creditRejectionSubReason ? `(${selectedRow.creditRejectionSubReason})` : ''}
                            </p>
                          ) : null}
                          {selectedRow.diligenceRejectionReason ? (
                            <p className="font-medium text-[11px] leading-relaxed text-rose-700">
                              <span className="font-bold">Diligence Rejection Reason:</span> {selectedRow.diligenceRejectionReason} {selectedRow.diligenceRejectionSubReason ? `(${selectedRow.diligenceRejectionSubReason})` : ''}
                            </p>
                          ) : null}
                          {!selectedRow.redChannelReason && !selectedRow.creditRejectionReason && !selectedRow.diligenceRejectionReason ? (
                            <p className="text-slate-500 text-[11px] leading-relaxed">
                              Eligible for streamlined processing. No immediate deviations or rejection warnings listed in database checks.
                            </p>
                          ) : null}
                          
                          <div className="grid grid-cols-3 gap-2 text-[10px] font-mono pt-2 border-t border-dashed border-slate-200/60 mt-2">
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-sans font-medium">Hard Derog</span>
                              <span className={`font-bold ${selectedRow.hardDerogFlag === 'Yes' ? 'text-rose-600' : 'text-slate-700'}`}>
                                {selectedRow.hardDerogFlag || 'No'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-sans font-medium">Soft Derog</span>
                              <span className={`font-bold ${selectedRow.softDerogFlag === 'Yes' ? 'text-amber-600' : 'text-slate-700'}`}>
                                {selectedRow.softDerogFlag || 'No'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-sans font-medium">LTV Ratio</span>
                              <span className="font-extrabold text-slate-700">{selectedRow.creditLtv || '-'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Integrated Credit CRM Standard Indicators */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-2xs">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" /> Underwriting &amp; Credit Indicators
                    </h4>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="p-2.5 bg-slate-50 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Hard Derog Flag</span>
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                          selectedRow.hardDerogFlag === 'Yes' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {selectedRow.hardDerogFlag || 'No'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Soft Derog Flag</span>
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                          selectedRow.softDerogFlag === 'Yes' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {selectedRow.softDerogFlag || 'No'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">OGL Pincode Check</span>
                        <span className="font-bold text-slate-800 mt-0.5 block">{selectedRow.oglPincodeFlag || '-'}</span>
                      </div>

                      <div className="p-2.5 bg-slate-50 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Income Source</span>
                        <span className="font-bold text-slate-800 mt-0.5 block truncate" title={selectedRow.incomeSource}>{selectedRow.incomeSource || '-'}</span>
                      </div>
                    </div>

                    {/* LTV check and progress meter */}
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 mb-1.5 font-mono">
                        <span>CREDIT LTV PROGRESS RATIO</span>
                        <span className="text-slate-800 font-extrabold">{selectedRow.creditLtv || '0%'}</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-brand-blue h-full rounded-full"
                          style={{ 
                            width: `${Math.min(100, parseFloat(selectedRow.creditLtv || '0'))}%` 
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <div className="flex justify-between py-1 border-b border-slate-100/50">
                        <strong>Case Type (RC):</strong>
                        <span className="font-semibold text-slate-800">{selectedRow.rcCaseType || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100/50">
                        <strong>Bajaj Segment Category:</strong>
                        <span className="font-semibold text-slate-800">{selectedRow.bajajSegment || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100/50">
                        <strong>Employer / Company:</strong>
                        <span className="font-bold text-slate-800 truncate max-w-[200px]" title={selectedRow.companyName}>{selectedRow.companyName || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <strong>FOIR % Index:</strong>
                        <span className="font-bold text-slate-800">{selectedRow.foir || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* CRM Assessment & Form Status Card */}
                  <div className="p-4 bg-brand-orange/5 border border-brand-orange/15 rounded-2xl space-y-4 shadow-2xs">
                    <h4 className="text-xs font-bold text-brand-orange uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-brand-orange/10">
                      <FileSpreadsheet className="w-4 h-4 text-brand-orange" /> CRM Assessment &amp; Form Status
                    </h4>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Funnel Stage</span>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-brand-blue/10 text-brand-blue border border-brand-blue/20 uppercase tracking-wide">
                          {selectedRow.funnelStage || '-'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Final ROI %</span>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 tracking-wide font-mono">
                          {selectedRow.finalRoi ? `${selectedRow.finalRoi}%` : '-'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Form Risk Bucket</span>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                          selectedRow.formRiskBucket?.toLowerCase() === 'high' 
                            ? 'bg-rose-50 text-rose-700 border-rose-100' 
                            : selectedRow.formRiskBucket?.toLowerCase() === 'medium' 
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : 'bg-slate-50 text-slate-700 border-slate-100'
                        }`}>
                          {selectedRow.formRiskBucket || '-'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Form Case Stage</span>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-100">
                          {selectedRow.formCaseStage || '-'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Form Final Status</span>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-brand-blue/10 text-brand-blue border border-brand-blue/20 uppercase">
                          {selectedRow.formFinalStatus || '-'}
                        </span>
                      </div>

                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">Deviation Required?</span>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-extrabold border uppercase ${
                          selectedRow.formDeviationRequired === 'Yes' 
                            ? 'bg-amber-50 text-amber-700 border-amber-100' 
                            : 'bg-slate-50 text-slate-500 border-slate-100'
                        }`}>
                          {selectedRow.formDeviationRequired || 'No'}
                        </span>
                      </div>
                    </div>

                    {/* Form text columns: Detailed Ask & Remarks */}
                    <div className="space-y-3 pt-2">
                      {selectedRow.formDetailedAsk && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Form Detailed Ask</span>
                          <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 shadow-inner">
                            {selectedRow.formDetailedAsk}
                          </div>
                        </div>
                      )}

                      {selectedRow.formFinalRemarks && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Form Final Remarks</span>
                          <div className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200 shadow-inner leading-relaxed">
                            {selectedRow.formFinalRemarks}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vertical Milestone Progress Tracker */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5 pb-2 border-b border-slate-100">
                      <Activity className="w-4 h-4 text-brand-blue" /> Lead Milestones Tracker
                    </h4>
                    
                    <div className="relative pl-5 border-l-2 border-slate-100 space-y-5 py-1">
                      {[
                        { label: 'Lead Created', date: selectedRow.latestLeadCreationTimestamp },
                        { label: 'Case Logged In', date: selectedRow.latestLoginTime || selectedRow.sheetLoginTimestamp },
                        { label: 'Credit Assessed', date: selectedRow.latestCreditAssessedTimestamp },
                        { label: 'Diligence Assessed', date: selectedRow.latestDiligenceAssessedTimestamp },
                        { label: 'T&C Accepted', date: selectedRow.tncAcceptedTimestamp },
                        { label: 'FCU Checked', date: selectedRow.latestFcuAssessedTimestamp || selectedRow.fcuSentDate },
                        { label: 'Submitted To Ops', date: selectedRow.submitToOpsTimestamp || selectedRow.sentToOpsTimestamp },
                        { label: 'Finance Disbursed', date: selectedRow.financeDisbursedTimestamp || selectedRow.opsDisbursalTimestamp }
                      ].map((m, idx) => {
                        const isDone = !!m.date;
                        return (
                          <div key={idx} className="relative">
                            {/* Bullets */}
                            <div className={`absolute -left-[27px] top-0.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center ${
                              isDone ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-slate-300 bg-slate-50 text-slate-400'
                            }`}>
                              {isDone && <CheckCircle className="w-2.5 h-2.5 fill-brand-blue text-white" />}
                            </div>
                            
                            <div className="flex justify-between items-start">
                              <div>
                                <span className={`text-[11px] font-bold block ${isDone ? 'text-slate-800' : 'text-slate-400 font-medium'}`}>
                                  {m.label}
                                </span>
                                {m.date ? (
                                  <span className="text-[10px] font-mono text-slate-555 leading-none">
                                    {m.date}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-medium text-slate-400/80 uppercase font-mono leading-none tracking-wider">
                                    Pending
                                  </span>
                                )}
                              </div>
                              <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${
                                isDone ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20' : 'bg-slate-100 text-slate-400'
                              }}`}>
                                {isDone ? 'Completed' : 'Queue'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* CRM Outbound Calling metrics */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200/30">
                      <PhoneCall className="w-4 h-4 text-brand-blue" /> CRM Outbound Calling Metrics
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-3 border border-slate-200 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Attempts vs Connections</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-base font-extrabold text-slate-800">{selectedRow.totalConnectedCalls || 0}</span>
                          <span className="text-xs text-slate-400 font-bold">/ {selectedRow.totalCallAttempts || 0}</span>
                        </div>
                        
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                          <div 
                            className="bg-brand-blue h-1.5 rounded-full" 
                            style={{ 
                              width: `${Math.min(100, Math.max(0, 
                                ((selectedRow.totalConnectedCalls || 0) / 
                                (selectedRow.totalCallAttempts || 1)) * 100
                              ))}%` 
                            }}
                          />
                        </div>
                      </div>

                      <div className="bg-white p-3 border border-slate-200 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Last Talk Duration</span>
                        <span className="text-sm font-bold text-slate-800 mt-1 block">
                          {selectedRow.callDuration ? `${selectedRow.callDuration}` : 'No talk time'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs text-slate-600">
                      <div className="flex justify-between py-1 border-b border-slate-200/40">
                        <strong>Last Call At:</strong>
                        <span className="font-mono text-slate-800">{selectedRow.lastCallAt || 'Never'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/40">
                        <strong>Dialed Operator (SP):</strong>
                        <span className="font-semibold text-slate-800">{selectedRow.lastCallConnectedSp || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/40">
                        <strong>Latest Outcome:</strong>
                        <span className="font-bold text-slate-800">{selectedRow.latestCallOutcome || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/40">
                        <strong>Last Disposition:</strong>
                        <span className="font-semibold text-slate-800">{selectedRow.lastDisposition || '-'}</span>
                      </div>
                      {selectedRow.followupAt && (
                        <div className="flex justify-between py-1.5 bg-brand-orange/5 px-2 rounded border border-brand-orange/10">
                          <strong className="text-brand-orange flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled Follow-up:</strong>
                          <span className="font-bold text-brand-orange font-mono">{selectedRow.followupAt}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {sidebarTab === 'pmax' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    {paymentCards.map(item => (
                      <div key={item.label} className="p-3 bg-brand-orange/5 border border-brand-orange/15 rounded-2xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-brand-orange/70 font-semibold font-mono">{item.label}</span>
                        <span className="block mt-1 text-sm font-extrabold text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Header Card */}
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden shadow-md text-white">
                    <div className="absolute right-[-14px] bottom-[-14px] opacity-10">
                      <Database className="w-24 h-24 text-brand-blue" />
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-800 text-brand-blue font-mono">
                      <Database className="w-4 h-4 text-brand-blue" /> Pmax status tracker
                    </h4>
                    <div className="mt-3 text-xs text-slate-300 space-y-2">
                      <div className="flex justify-between">
                        <strong>Login Timestamp:</strong>
                        <span className="font-mono text-white font-semibold">{selectedRow.sheetLoginTimestamp || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <strong>Yard City:</strong>
                        <strong className="text-white">{selectedRow.sheetYardCity || '-'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-2xs">
                    <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                      Commercial & Finance Snapshot
                    </h5>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {pmaxSignals.map(item => (
                        <div key={item.label} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
                          <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">{item.label}</span>
                          <span className="block mt-1 font-bold text-slate-800 break-words">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 border border-amber-200/60 rounded-2xl space-y-2">
                    <h5 className="text-[11px] font-bold text-amber-800 uppercase tracking-wider border-b border-amber-200/50 pb-2">
                      Blocker Signals
                    </h5>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      {selectedRow.reasonPointer || selectedRow.latestRemark || 'No explicit Pmax blocker summary has been captured yet.'}
                    </p>
                  </div>

                  {/* Partner & Yard Operations Details */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-2xs">
                    <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                      Operations &amp; Yard Details
                    </h5>

                    <div className="space-y-3 text-xs text-slate-600">
                      <div className="flex justify-between py-1.5 border-b border-slate-100/60 font-medium">
                        <strong>Login Partner:</strong>
                        <span className="font-bold text-slate-800">{selectedRow.sheetLoginPartner || '-'}</span>
                      </div>
                      
                      <div className="flex justify-between py-1.5 border-b border-slate-100/60 font-medium">
                        <strong>Yard Name:</strong>
                        <span className="font-semibold text-slate-800">{selectedRow.sheetYardName || '-'}</span>
                      </div>

                      <div className="flex justify-between py-1.5 border-b border-slate-100/60 font-medium">
                        <strong>Yard City:</strong>
                        <span className="font-semibold text-slate-800">{selectedRow.sheetYardCity || '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Activity Tracker */}
                  <div className="p-4 bg-brand-blue/5 border border-brand-blue/10 rounded-2xl space-y-4 shadow-2xs">
                    <h5 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                      Pmax Case Lifecycle Status
                    </h5>

                    <div className="grid grid-cols-1 gap-3 text-xs">
                      <div className="p-3 bg-white border border-slate-200 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold font-mono">Sheet Final Status</span>
                        <span className={`inline-block mt-1 px-2.5 py-1 rounded text-[11px] font-extrabold uppercase border ${
                          selectedRow.sheetFinalStatus?.toLowerCase().includes('disburs') 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : selectedRow.sheetFinalStatus?.toLowerCase().includes('reject')
                              ? 'bg-rose-50 text-rose-700 border-rose-100'
                              : 'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                          {selectedRow.sheetFinalStatus || 'Pending Status'}
                        </span>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl">
                        <span className="block text-[10px] text-slate-400 uppercase font-bold font-mono">Last Disbursal Activity</span>
                        <span className="text-xs text-slate-800 font-bold block mt-1 leading-relaxed">
                          {selectedRow.sheetLastDisbursalActivity || 'No active activity logs found.'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Remarks Card */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 pb-5">
                    <strong className="text-[10px] text-slate-500 uppercase tracking-widest block font-mono">Sheet Detailed Remarks</strong>
                    <p className="text-xs text-slate-800 bg-white p-3.5 rounded-xl border border-slate-200/60 leading-relaxed font-sans whitespace-pre-wrap">
                      {selectedRow.sheetDetailedRemarks || (
                        <span className="text-slate-400 italic">No detailed remarks found in Google Sheet layer.</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {sidebarTab === 'copilot' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    {copilotFlags.map(item => (
                      <div key={item.label} className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold font-mono">{item.label}</span>
                        <span className="block mt-1 text-sm font-extrabold text-slate-900 break-words">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Futuristic Predictor cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3.5 bg-slate-900 text-white rounded-2xl relative overflow-hidden border border-slate-800 shadow-lg">
                      <div className="absolute right-[-10px] bottom-[-10px] opacity-10">
                        <Sparkles className="w-24 h-24 text-brand-orange animate-pulse" />
                      </div>
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-brand-orange font-sans">ML Delivery Date</span>
                      <p className="text-base font-extrabold text-white mt-1.5 font-mono">
                        {selectedRow.mlEstimatedDeliveryDate || 'N/A'}
                      </p>
                      <span className="text-[9px] text-slate-400 block mt-1">Estimated delivery by ML parser</span>
                    </div>

                    <div className="p-3.5 bg-gradient-to-br from-brand-orange/5 to-brand-orange/15 border border-brand-orange/20 text-slate-800 rounded-2xl shadow-inner">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-brand-orange">Confidence Match</span>
                      <div className="flex items-baseline gap-1 mt-1.5">
                        <p className="text-xl font-black text-brand-orange font-mono">
                          {selectedRow.confidenceScore ? `${(parseFloat(selectedRow.confidenceScore) * 100).toFixed(0)}%` : '78%'}
                        </p>
                      </div>
                      <span className="text-[9px] text-brand-orange/70 block mt-1">Accuracy parsing precision</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200/30">
                      <Sparkles className="w-4 h-4 text-brand-orange" /> Case Logic & Recommendations
                    </h4>

                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-semibold">Reason Pointer</span>
                      <p className="text-xs text-slate-700 mt-1 font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200/50 whitespace-pre-wrap">
                        {selectedRow.reasonPointer || 'No structured reason pointer available.'}
                      </p>
                    </div>

                    <div>
                      <span className="block text-[10px] text-slate-400 uppercase font-semibold">Recommended Next Move</span>
                      <p className="text-brand-orange font-semibold mt-1 leading-relaxed bg-brand-orange/5 px-2.5 py-2 rounded-lg border border-brand-orange/10">
                        {selectedRow.gmailNextAction || selectedRow.reviewerRemarks || 'Validate OD progress, refresh customer commitment, and align EDD with current payment and quality blockers.'}
                      </p>
                    </div>
                  </div>

                  {/* Gmail Summary Section styled as Chat bubble */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-100">
                      <Sparkles className="w-4 h-4 text-brand-orange" /> Parsed Gmail Case Summary
                    </h4>

                    <div className="p-3.5 rounded-2xl bg-brand-orange/5 border border-brand-orange/10 text-xs leading-relaxed text-slate-700 relative">
                      <span className="absolute top-2 right-3.5 px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange font-bold text-[8px] uppercase tracking-wider font-mono">Mail Engine V2</span>
                      {selectedRow.gmailSummary ? (
                        <div className="space-y-2 whitespace-pre-line text-slate-800 font-sans">
                          {selectedRow.gmailSummary}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic">No incoming diagnostic email summary is linked to this case row.</p>
                      )}
                    </div>
                  </div>

                  {/* Operations pendency analysis */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-200/30">
                      <AlertCircle className="w-4 h-4 text-brand-orange" /> Operational Pendency Analysis
                    </h4>

                    <div className="space-y-4 text-xs text-slate-600">
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Pendency Status</span>
                        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded mt-1 ${
                          selectedRow.gmailPendencyStatus === 'Pending' ? 'bg-brand-orange/10 text-brand-orange font-semibold' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {selectedRow.gmailPendencyStatus || 'No Pending status'}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Reported Pendency Reason</span>
                        <p className="text-slate-700 mt-1 font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200/50">
                          {selectedRow.gmailPendencyReason || 'No registered pendencies extracted.'}
                        </p>
                      </div>

                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Recommended AI Next Action</span>
                        <p className="text-brand-orange font-semibold mt-1 leading-relaxed bg-brand-orange/5 px-2.5 py-2 rounded-lg border border-brand-orange/10">
                          {selectedRow.gmailNextAction || 'Proceed standard processing flow.'}
                        </p>
                      </div>

                      <div className="flex justify-between pt-1 text-[11px] border-t border-slate-200/30 text-slate-500">
                        <span>Source: {selectedRow.gmailPendencySource || 'Gmail Crawler'}</span>
                        <span>Synced: {selectedRow.gmailPendencyDate || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {sidebarTab === 'raw_data' && (
                <div className="space-y-4">
                  {/* Column Search box */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={rawSearchQuery}
                      onChange={e => setRawSearchQuery(e.target.value)}
                      placeholder="Search column names or values..."
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-orange focus:border-brand-orange bg-white"
                    />
                  </div>

                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                    {rawGroups.map(group => {
                      const rows = group.keys
                        .map(key => [key, selectedRow[key]] as const)
                        .filter(([key, val]) => {
                          if (String(key).startsWith('_')) return false;
                          if (val === undefined || val === null || val === '') return false;
                          const prettyKey = String(key).replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                          const strVal = String(val);
                          if (rawSearchQuery.trim()) {
                            const lQuery = rawSearchQuery.toLowerCase();
                            return prettyKey.toLowerCase().includes(lQuery) || strVal.toLowerCase().includes(lQuery);
                          }
                          return true;
                        });

                      if (rows.length === 0) return null;

                      return (
                        <div key={group.title} className="border border-slate-100 rounded-2xl overflow-hidden bg-white text-xs shadow-inner">
                          <div className="bg-slate-50 border-b border-slate-100 px-4 py-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{group.title}</span>
                          </div>
                          <div className="divide-y divide-slate-100 font-sans text-slate-600">
                            {rows.map(([key, val]) => {
                              const prettyKey = String(key).replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                              return (
                                <div key={String(key)} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 p-3 hover:bg-slate-50/50 transition-colors">
                                  <div className="font-semibold text-slate-700">{prettyKey}</div>
                                  <div className="text-slate-600 font-mono text-[11px] break-all whitespace-pre-wrap leading-relaxed">
                                    {(key === 'userId' || key === 'uid' || key === 'leadId') ? (
                                      <a
                                        href={`https://axle.c24.tech/b2c-lms/customer/${encodeURIComponent(String(val))}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-blue hover:text-brand-blue/80 font-bold inline-flex items-center gap-1 leading-none"
                                      >
                                        {String(val)}
                                        <ExternalLink className="w-3.5 h-3.5 text-brand-blue shrink-0" />
                                      </a>
                                    ) : (
                                      String(val)
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {rawGroups.every(group =>
                      group.keys
                        .map(key => [key, selectedRow[key]] as const)
                        .filter(([key, val]) => {
                          if (String(key).startsWith('_')) return false;
                          if (val === undefined || val === null || val === '') return false;
                          const prettyKey = String(key).replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                          const strVal = String(val);
                          if (rawSearchQuery.trim()) {
                            const lQuery = rawSearchQuery.toLowerCase();
                            return prettyKey.toLowerCase().includes(lQuery) || strVal.toLowerCase().includes(lQuery);
                          }
                          return true;
                        }).length === 0
                    ) && (
                      <div className="p-8 text-center text-slate-400 italic border border-slate-100 rounded-2xl bg-white">
                        No matching columns found.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {sidebarTab === 'history' && (
                <div className="space-y-4">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider pb-1.5 border-b border-slate-100">
                    <Clock className="w-4 h-4 text-brand-orange" /> Case Revision History
                  </h4>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Key Event Timeline</h5>
                    <div className="space-y-2">
                      {timelineEntries.length > 0 ? timelineEntries.map((entry, idx) => (
                        <div key={`${entry.label}-${idx}`} className="flex justify-between items-start gap-3 text-xs border-b border-slate-200/40 pb-2 last:border-b-0 last:pb-0">
                          <span className="font-semibold text-slate-600">{entry.label}</span>
                          <span className="font-mono text-slate-800 text-right">{entry.value}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-slate-400 italic">No key dated events are available for this case.</p>
                      )}
                    </div>
                  </div>
                  
                  {loadingAuditLogs ? (
                    <div className="flex flex-col items-center justify-center p-8 text-slate-400 gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-brand-orange" />
                      <span className="text-xs">Loading change timeline...</span>
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic text-xs bg-slate-50 border border-slate-200 rounded-2xl">
                      No changes have been logged for this case yet.
                    </div>
                  ) : (
                    <div className="relative pl-6 border-l border-slate-200 space-y-5 py-2">
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
                            {/* Bullet dot */}
                            <div className="absolute -left-[30.5px] top-1 w-2.5 h-2.5 rounded-full bg-brand-orange border-2 border-white ring-4 ring-brand-orange/10 shrink-0" />
                            
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-[9px] text-slate-450 font-medium">
                                <span className="font-bold text-slate-700">{log.changed_by.split('@')[0]}</span>
                                <span>{formattedDate}</span>
                              </div>
                              <div className="font-semibold text-slate-800">
                                Modified <span className="text-brand-orange font-extrabold">{friendlyCol}</span>
                              </div>
                              
                              {/* Diff Block */}
                              <div className="mt-1 bg-slate-50 p-2.5 border border-slate-200 rounded-xl space-y-1 font-mono text-[10px] leading-relaxed">
                                <div className="text-rose-600 bg-rose-50/50 px-1.5 py-0.5 rounded border border-rose-100/30 line-through truncate" title={log.old_value || ''}>
                                  - {log.old_value || 'Empty'}
                                </div>
                                <div className="text-emerald-700 bg-emerald-50/50 px-1.5 py-0.5 rounded border border-emerald-100/30 truncate" title={log.new_value || ''}>
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

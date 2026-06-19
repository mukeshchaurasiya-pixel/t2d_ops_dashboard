/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Database,
  FileSpreadsheet,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AuditLog, CaseEditorDraft, CaseRow } from '../types';
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

type HumanRemark = {
  date: string;
  author: string;
  text: string;
  raw: string;
  timestampMs: number;
};

type SystemRemark = {
  variableName: string;
  newValue: string;
  author: string;
  timestamp: string;
  raw: string;
};

type ParsedRemarks = {
  human: HumanRemark[];
  system: SystemRemark[];
};

type AuditGroup = {
  columnName: string;
  label: string;
  logs: AuditLog[];
};

const HUMAN_REMARK_REGEX = /^\[(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\(([^)]+)\))?\]\s*([^:]+):\s*(.*)$/;
const SYSTEM_REMARK_REGEX = /^-\s*(.*?)\s-\s(.*?)\s-\s(.*?)\s-\s(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2})$/;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

function formatCurrency(value: number | string | undefined | null): string {
  if (isBlank(value)) return '';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `INR ${num.toLocaleString('en-IN')}`;
}

function parseTimestampMs(dateStr: string): number {
  const [datePart] = String(dateStr || '').trim().split(' ');
  const [d, m, y] = datePart.split('/').map(Number);
  if (!d || !m || !y) return 0;
  return new Date(y, m - 1, d).getTime();
}

function parseRemarks(remarksStr: string): ParsedRemarks {
  if (!remarksStr) return { human: [], system: [] };

  const human: HumanRemark[] = [];
  const system: SystemRemark[] = [];

  String(remarksStr)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const humanMatch = line.match(HUMAN_REMARK_REGEX);
      if (humanMatch) {
        const date = humanMatch[1];
        const author = (humanMatch[3] || '').trim();
        const text = (humanMatch[4] || '').trim();
        human.push({
          date,
          author,
          text,
          raw: line,
          timestampMs: parseTimestampMs(date),
        });
        return;
      }

      const systemMatch = line.match(SYSTEM_REMARK_REGEX);
      if (systemMatch) {
        system.push({
          variableName: (systemMatch[1] || '').trim(),
          newValue: (systemMatch[2] || '').trim(),
          author: (systemMatch[3] || '').trim(),
          timestamp: (systemMatch[4] || '').trim(),
          raw: line,
        });
        return;
      }

      const fallbackDateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      human.push({
        date: fallbackDateMatch ? fallbackDateMatch[1] : '',
        author: 'Update',
        text: line,
        raw: line,
        timestampMs: fallbackDateMatch ? parseTimestampMs(fallbackDateMatch[1]) : 0,
      });
    });

  human.sort((a, b) => a.timestampMs - b.timestampMs);
  return { human, system };
}

function getHumanRemarkFeed(remarks: HumanRemark[], limit = 3): HumanRemark[] {
  return remarks.slice(-limit).reverse();
}

function getLatestHumanRemark(remarks: HumanRemark[]): HumanRemark | null {
  if (remarks.length === 0) return null;
  return remarks[remarks.length - 1] ?? null;
}

function humanizeAuditColumn(columnName: string): string {
  const mapping: Record<string, string> = {
    readyToDeliver: 'Ready to Deliver?',
    cancelReqDate: 'Cancel Request Date',
    expectedOdCompletionDate: 'Expected OD Completion Date',
    eddReviewerDate: 'EDD Date (Reviewer)',
    reviewerRemarks: 'Remarks',
    onDemandStatus: 'On Demand Status',
    expectedDeliveryDate: 'Expected Delivery Date',
    paymentPercentage: 'Payment Percentage',
    sheetFinalStatus: 'Sheet Final Status',
    formFinalStatus: 'Form Final Status',
    confidenceScore: 'Confidence Score',
    leadStage: 'Lead Stage',
    dealStatus: 'Deal Status',
    allocatedRm: 'Allocated RM',
    assignedDc: 'Assigned DC',
    deliveryStatus: 'Delivery Status',
    taskBucket: 'Task Bucket',
  };

  return mapping[columnName] || columnName;
}

function groupAuditLogs(auditLogs: AuditLog[]): AuditGroup[] {
  const groups = new Map<string, AuditLog[]>();

  auditLogs.forEach(log => {
    const key = log.column_name || 'unknown';
    const existing = groups.get(key) || [];
    existing.push(log);
    groups.set(key, existing);
  });

  return Array.from(groups.entries()).map(([columnName, logs]) => ({
    columnName,
    label: humanizeAuditColumn(columnName),
    logs,
  }));
}

function renderEmptyState(text: string) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-[11px] italic text-slate-400">
      {text}
    </div>
  );
}

function renderFieldCard(
  label: string,
  value: unknown,
  formatter?: (val: any) => string
) {
  if (isBlank(value)) return null;
  const displayValue = formatter ? formatter(value) : String(value);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="block break-words text-xs font-semibold text-slate-800">
        {displayValue}
      </span>
    </div>
  );
}

function renderGrid(
  fields: { label: string; value: unknown; formatter?: (val: any) => string }[]
) {
  const rendered = fields.map(field => renderFieldCard(field.label, field.value, field.formatter)).filter(Boolean);
  if (rendered.length === 0) {
    return renderEmptyState('No data recorded for this section.');
  }
  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{rendered}</div>;
}

function DiffRow({ oldValue, newValue }: { oldValue: string | null; newValue: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px]">
      <div className="truncate text-rose-700" title={oldValue || ''}>
        - {oldValue || 'Empty'}
      </div>
      <div className="truncate font-semibold text-emerald-700" title={newValue || ''}>
        + {newValue || 'Empty'}
      </div>
    </div>
  );
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
  auditLogs,
}) => {
  const [copied, setCopied] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<Record<'crm' | 'finance' | 'ops' | 'ai' | 'history', boolean>>({
    crm: true,
    finance: false,
    ops: false,
    ai: false,
    history: false,
  });

  useEffect(() => {
    if (isOpen) setCopied(false);
  }, [isOpen, selectedRow?.bookingId]);

  const parsedRemarks = useMemo(
    () => parseRemarks(selectedRow?.reviewerRemarks || ''),
    [selectedRow?.reviewerRemarks]
  );

  const humanFeed = useMemo(() => getHumanRemarkFeed(parsedRemarks.human, 3), [parsedRemarks.human]);
  const latestHumanRemark = useMemo(() => getLatestHumanRemark(parsedRemarks.human), [parsedRemarks.human]);
  const auditGroups = useMemo(() => groupAuditLogs(auditLogs), [auditLogs]);
  const saveFeedbackLower = saveFeedback?.toLowerCase() || '';

  if (!isOpen || !selectedRow) return null;

  const toggleAccordion = (key: keyof typeof openAccordion) => {
    setOpenAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const contactNo = selectedRow.contactNumber ? String(selectedRow.contactNumber).replace(/[^0-9]/g, '') : '';
  const waUrl = contactNo ? `https://wa.me/${contactNo}` : '#';

  const totalCollected = Number(selectedRow.amountCollected || 0);
  const totalExpected = Number(selectedRow.totalExpectedAmount || 0);
  const totalPending = Number(selectedRow.amountPending || 0);
  const progressPct = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
  const isFullyCollected = totalPending <= 0 && totalExpected > 0;

  const showCancelAlert = !isBlank(selectedRow.cancelReqDate);
  const cancelReason = !isBlank(selectedRow.cancelReason)
    ? String(selectedRow.cancelReason).trim()
    : 'System Auto-Cancelled / No Explicit Reason Logged';
  const showCreditAlert = !isBlank(selectedRow.creditRejectionReason);
  const showDiligenceAlert = !isBlank(selectedRow.diligenceRejectionReason);
  const hasBlockers = showCancelAlert || showCreditAlert || showDiligenceAlert;

  const latestRemarkCard = !isBlank(selectedRow.latestRemark)
    ? String(selectedRow.latestRemark).trim()
    : latestHumanRemark?.text || '';
  const latestRemarkAuthor = !isBlank(selectedRow.latestRemarkBy)
    ? String(selectedRow.latestRemarkBy).trim()
    : latestHumanRemark?.author || '';
  const latestRemarkDate = !isBlank(selectedRow.latestRemarkDate)
    ? String(selectedRow.latestRemarkDate).trim()
    : latestHumanRemark?.date || '';

  const showAiAccordion = !isBlank(selectedRow.confidenceScore);
  const confidencePct = useMemo(() => {
    const raw = Number(selectedRow.confidenceScore || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 1 ? Math.min(100, Math.round(raw)) : Math.min(100, Math.round(raw * 100));
  }, [selectedRow.confidenceScore]);

  const milestoneStages = [
    { label: 'Lead Created', value: selectedRow.latestLeadCreationTimestamp },
    { label: 'Case Logged In', value: selectedRow.latestLoginTime || selectedRow.sheetLoginTimestamp },
    { label: 'Credit Assessed', value: selectedRow.latestCreditAssessedTimestamp },
    { label: 'Diligence Assessed', value: selectedRow.latestDiligenceAssessedTimestamp },
    { label: 'T&C Accepted', value: selectedRow.tncAcceptedTimestamp },
    { label: 'FCU Checked', value: selectedRow.latestFcuAssessedTimestamp },
    { label: 'Submitted to Ops', value: selectedRow.submitToOpsTimestamp },
    { label: 'Finance Disbursed', value: selectedRow.financeDisbursedTimestamp },
  ];

  const lastActiveIndex = milestoneStages.reduce((acc, stage, idx) => (!isBlank(stage.value) ? idx : acc), -1);

  const handleCopyLink = () => {
    const deepLink = `${window.location.origin}/?bookingId=${selectedRow.bookingId}`;
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px]"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed right-0 top-0 z-50 flex h-screen w-full flex-col overflow-hidden border-l border-slate-200 bg-slate-50 text-slate-800 shadow-2xl sm:max-w-2xl"
          >
            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                      Unified Booking record
                    </span>
                    {fetchingLatestRow && (
                      <span className="flex items-center gap-1 text-[9px] font-mono text-amber-600">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        syncing
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black tracking-tight text-slate-900">
                      {selectedRow.bookingId}
                    </h3>
                    {selectedRow.carRegNo && (
                      <span className="text-sm font-semibold text-slate-500">| {selectedRow.carRegNo}</span>
                    )}
                  </div>

                  {(selectedRow.make || selectedRow.model || selectedRow.variant) && (
                    <p className="text-xs font-medium text-slate-500">
                      {[selectedRow.make, selectedRow.model, selectedRow.variant].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {contactNo && (
                    <>
                      <a
                        href={`tel:${contactNo}`}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        title={`Call ${contactNo}`}
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-slate-200 bg-white p-2 text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                        title="Open WhatsApp chat"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    title="Copy record link"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200 pt-3">
                {!isBlank(selectedRow.leadStage) && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                    Lead: {selectedRow.leadStage}
                  </span>
                )}
                {!isBlank(selectedRow.tokenType) && (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700">
                    Token: {selectedRow.tokenType}
                  </span>
                )}
                {!isBlank(selectedRow.leadStatus) && (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700">
                    Status: {selectedRow.leadStatus}
                  </span>
                )}
                {!isBlank(selectedRow.dealStatus) && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      /cancel/i.test(String(selectedRow.dealStatus))
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    Deal: {selectedRow.dealStatus}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {hasBlockers && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-rose-700">
                    <ShieldAlert className="h-4 w-4" />
                    <h4 className="text-[10px] font-black uppercase tracking-wider">Critical Blockers Detected</h4>
                  </div>

                  <div className="mt-3 space-y-2">
                    {showCancelAlert && (
                      <div className="rounded-xl border border-rose-200 bg-white p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-rose-600">
                          Cancel Requested On: {selectedRow.cancelReqDate}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-rose-900">{cancelReason}</p>
                      </div>
                    )}

                    {showCreditAlert && (
                      <div className="rounded-xl border border-rose-200 bg-white p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-rose-600">
                          Credit Rejection Alert
                        </p>
                        <p className="mt-1 text-xs font-semibold text-rose-900">
                          {selectedRow.creditRejectionReason}
                          {!isBlank(selectedRow.creditRejectionSubReason) && (
                            <span className="mt-1 block text-[10px] font-medium text-slate-500">
                              Sub-reason: {selectedRow.creditRejectionSubReason}
                            </span>
                          )}
                        </p>
                      </div>
                    )}

                    {showDiligenceAlert && (
                      <div className="rounded-xl border border-rose-200 bg-white p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-rose-600">
                          Diligence Rejection Alert
                        </p>
                        <p className="mt-1 text-xs font-semibold text-rose-900">
                          {selectedRow.diligenceRejectionReason}
                          {!isBlank(selectedRow.diligenceRejectionSubReason) && (
                            <span className="mt-1 block text-[10px] font-medium text-slate-500">
                              Sub-reason: {selectedRow.diligenceRejectionSubReason}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
                        <ShieldCheck className="h-4 w-4 text-amber-600" />
                        Action & Execution Zone
                      </h4>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Only four write-access controls are editable here.
                      </p>
                    </div>

                    {saveSuccess && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        Saved
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2">
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">
                          Immediate Bottleneck
                        </span>
                        {!isBlank(selectedRow.taskBucket) ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {splitTasks(selectedRow.taskBucket).map((task, idx) => (
                              <span
                                key={`${task}-${idx}`}
                                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                              >
                                {task}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] italic text-slate-500">No immediate task bottleneck.</p>
                        )}
                      </div>

                      {!isBlank(selectedRow.reasonPointer) && (
                        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[10px] text-slate-600">
                          <span className="font-semibold text-slate-800">Pointer:</span> {selectedRow.reasonPointer}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Financial Health</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isFullyCollected ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-500">
                        <div>
                          Collected: <span className="font-semibold text-slate-800">{formatCurrency(totalCollected)}</span>
                        </div>
                        <div className="text-center">
                          Pending: <span className={`font-semibold ${totalPending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatCurrency(totalPending)}</span>
                        </div>
                        <div className="text-right">
                          Expected: <span className="font-semibold text-slate-800">{formatCurrency(totalExpected)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Ready to Deliver?
                      </label>
                      <select
                        value={tempRowData.readyToDeliver || ''}
                        onChange={e => setTempRowData(prev => ({ ...prev, readyToDeliver: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                      >
                        <option value="">(Blank)</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Expected OD Completion Date
                      </label>
                      <input
                        type="date"
                        value={tempRowData.expectedOdCompletionDate || ''}
                        onChange={e => setTempRowData(prev => ({ ...prev, expectedOdCompletionDate: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        EDD Date (Reviewer)
                      </label>
                      <input
                        type="date"
                        value={tempRowData.eddReviewerDate || ''}
                        onChange={e => setTempRowData(prev => ({ ...prev, eddReviewerDate: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Add Remark (Append Only)</span>
                      <span className="font-normal normal-case tracking-normal text-slate-400">
                        appends to remarks timeline
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={tempRowData.newRemarkAddition || ''}
                      onChange={e => setTempRowData(prev => ({ ...prev, newRemarkAddition: e.target.value }))}
                      placeholder="Type a new remark to append..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                    />
                  </div>

                  <AnimatePresence>
                    {saveFeedback && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[10px] font-semibold ${
                          saveFeedbackLower.includes('failed')
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : saveFeedbackLower.includes('offline')
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {saveFeedbackLower.includes('failed') ? (
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : saveFeedbackLower.includes('offline') ? (
                          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <div>{saveFeedback}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={handleSaveActionables}
                    disabled={savingRow}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-xs font-bold text-slate-950 shadow-sm transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingRow ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        {isOffline ? 'Saving locally to DB cache...' : 'Syncing to Sheets...'}
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="h-4 w-4" />
                        {isOffline ? 'Save Change (Offline)' : 'Save & Sync to Spreadsheet'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Latest Sheet Context
                    </h4>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Human remarks only. System field-change strings are excluded.
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    {humanFeed.length} recent
                  </span>
                </div>

                {fetchingLatestRow ? (
                  <div className="space-y-2 py-1">
                    <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                    <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                  </div>
                ) : latestRemarkCard ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500">
                        <span className="font-bold text-amber-700">
                          {latestRemarkAuthor || 'Update'}
                        </span>
                        <span>{latestRemarkDate ? `[${latestRemarkDate}]` : 'Latest remark'}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {latestRemarkCard}
                      </p>
                    </div>

                    {humanFeed.length > 0 ? (
                      <div className="space-y-2">
                        {humanFeed.map((remark, idx) => (
                          <div key={`${remark.raw}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500">
                              <span className="font-bold text-slate-700">{remark.author}</span>
                              <span>[{remark.date}]</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-700">{remark.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      renderEmptyState('No human remarks recorded for this booking.')
                    )}
                  </div>
                ) : (
                  renderEmptyState('No human remarks recorded for this booking.')
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleAccordion('crm')}
                  className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    CRM & Journey Health
                  </span>
                  {openAccordion.crm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {openAccordion.crm && (
                  <div className="space-y-4 p-4">
                    {renderGrid([
                      {
                        label: 'Attempts / Connected',
                        value:
                          !isBlank(selectedRow.totalCallAttempts) || !isBlank(selectedRow.totalConnectedCalls)
                            ? `${selectedRow.totalCallAttempts || 0} / ${selectedRow.totalConnectedCalls || 0}`
                            : null,
                      },
                      { label: 'Latest Outcome', value: selectedRow.latestCallOutcome },
                      { label: 'Last Call At', value: selectedRow.lastCallAt },
                      { label: 'Funnel Stage', value: selectedRow.funnelStage },
                    ])}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleAccordion('finance')}
                  className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-600" />
                    Finance & Underwriting
                  </span>
                  {openAccordion.finance ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {openAccordion.finance && (
                  <div className="space-y-4 p-4">
                    <div>
                      <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Commercials & Loan Details
                      </h5>
                      {renderGrid([
                        { label: 'Payment Type', value: selectedRow.paymentType },
                        { label: 'Credit LTV', value: selectedRow.creditLtv },
                        { label: 'Final ROI', value: !isBlank(selectedRow.finalRoi) ? `${selectedRow.finalRoi}%` : null },
                        { label: 'DS ROI', value: !isBlank(selectedRow.dsRoi) ? `${selectedRow.dsRoi}%` : null },
                        { label: 'Sales Price', value: selectedRow.agreedSalesPrice, formatter: formatCurrency },
                      ])}
                    </div>

                    <div>
                      <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Form Assessment
                      </h5>
                      {renderGrid([
                        { label: 'Form Risk Bucket', value: selectedRow.formRiskBucket },
                        { label: 'Form Final Status', value: selectedRow.formFinalStatus },
                        { label: 'Form Case Stage', value: selectedRow.formCaseStage },
                        { label: 'Form Detailed Ask', value: selectedRow.formDetailedAsk },
                        { label: 'Sheet Final Status', value: selectedRow.sheetFinalStatus },
                        { label: 'Sheet Login Partner', value: selectedRow.sheetLoginPartner },
                      ])}
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleAccordion('ops')}
                  className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-amber-600" />
                    Ops & Logistics
                  </span>
                  {openAccordion.ops ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {openAccordion.ops && (
                  <div className="space-y-4 p-4">
                    <div>
                      <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Location & Facility
                      </h5>
                      {renderGrid([
                        { label: 'Hub Name', value: selectedRow.hubName },
                        { label: 'City', value: selectedRow.city },
                        { label: 'Sheet Yard Name', value: selectedRow.sheetYardName },
                        { label: 'Sheet Yard City', value: selectedRow.sheetYardCity },
                      ])}
                    </div>

                    <div>
                      <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Delivery Parameters
                      </h5>
                      {renderGrid([
                        { label: 'Expected Delivery Date', value: selectedRow.expectedDeliveryDate },
                        { label: 'Actual Delivery Date', value: selectedRow.actualDeliveryDate },
                        { label: 'Delivery Segment', value: selectedRow.deliverySegment },
                        { label: 'Delivery Status', value: selectedRow.deliveryStatus },
                      ])}
                    </div>

                    <div>
                      <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Condition Flags
                      </h5>
                      {renderGrid([
                        { label: 'On Demand Status', value: selectedRow.onDemandStatus },
                        { label: 'RC Case Type', value: selectedRow.rcCaseType },
                      ])}
                    </div>
                  </div>
                )}
              </div>

              {showAiAccordion && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleAccordion('ai')}
                    className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-800"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      AI Co-Pilot & ML
                    </span>
                    {openAccordion.ai ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {openAccordion.ai && (
                    <div className="space-y-4 p-4">
                      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="shrink-0">
                          <svg className="h-14 w-14" viewBox="0 0 36 36">
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
                              strokeDasharray={`${confidencePct}, 100`}
                              strokeLinecap="round"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <text x="18" y="20.8" className="text-[8px] font-black text-slate-800" textAnchor="middle">
                              {confidencePct}%
                            </text>
                          </svg>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            Confidence Score
                          </span>
                          <span className="mt-0.5 block text-xs font-medium text-slate-600">
                            Machine learning score for delivery timeline health.
                          </span>
                        </div>
                      </div>

                      {renderGrid([
                        { label: 'ML Estimated Delivery Date', value: selectedRow.mlEstimatedDeliveryDate },
                        { label: 'Gmail Pendency Status', value: selectedRow.gmailPendencyStatus },
                        { label: 'Gmail Pendency Reason', value: selectedRow.gmailPendencyReason },
                      ])}
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleAccordion('history')}
                  className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-violet-600" />
                    Revision History
                  </span>
                  {openAccordion.history ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {openAccordion.history && (
                  <div className="space-y-6 p-4">
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Human Remarks
                          </h5>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Parsed from the append-only remarks cell.
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          {parsedRemarks.human.length} entries
                        </span>
                      </div>

                      {parsedRemarks.human.length === 0 ? (
                        renderEmptyState('No human remarks recorded for this booking.')
                      ) : (
                        <div className="space-y-2">
                          {parsedRemarks.human.slice().reverse().map((remark, idx) => (
                            <div key={`${remark.raw}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500">
                                <span className="font-bold text-slate-700">{remark.author}</span>
                                <span>[{remark.date}]</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">{remark.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Audit Diffs
                          </h5>
                          <p className="mt-1 text-[10px] text-slate-400">
                            Sourced from `audit_logs` and grouped by field.
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          {auditLogs.length} changes
                        </span>
                      </div>

                      {loadingAuditLogs ? (
                        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-6 text-slate-500">
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin text-amber-600" />
                          <span className="text-[11px]">Loading audit log timeline...</span>
                        </div>
                      ) : auditGroups.length === 0 ? (
                        renderEmptyState('No changes logged for this case.')
                      ) : (
                        <div className="space-y-3">
                          {auditGroups.map(group => (
                            <div key={group.columnName} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                    {group.label}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {group.logs.length} change{group.logs.length === 1 ? '' : 's'}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                {group.logs.map(log => (
                                  <div key={log.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-500">
                                      <span className="font-bold text-slate-700">
                                        {log.changed_by?.split('@')[0] || log.changed_by}
                                      </span>
                                      <span>{log.changed_at ? new Date(log.changed_at).toLocaleString() : 'Unknown Date'}</span>
                                    </div>
                                    <DiffRow oldValue={log.old_value} newValue={log.new_value} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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

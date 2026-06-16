/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseRow, DerivedFlags, DashboardKpis, DashboardCharts } from '../types';
import { parseDateString } from '../lib/dateUtils';

export function getTodayStart(): Date {
  const today = new Date('2026-06-05T00:00:00Z'); // Matches current time in metadata
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseDateSafe(value: string): Date | null {
  return parseDateString(value);
}

export function splitTasks(value: string): string[] {
  return String(value || '')
    .split(/\n|,/)
    .map(task => task.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

export function groupCount(rows: CaseRow[], key: keyof CaseRow): Record<string, number> {
  const result: Record<string, number> = {};
  rows.forEach(row => {
    const rawVal = row[key];
    const value = String(rawVal === undefined || rawVal === null || rawVal === '' ? 'Blank' : rawVal);
    result[value] = (result[value] || 0) + 1;
  });
  return result;
}

export function groupMultiCount(rows: CaseRow[], key: 'taskBucket'): Record<string, number> {
  const result: Record<string, number> = {};
  rows.forEach(row => {
    const rawValue = row[key];
    if (!rawValue) {
      result.Blank = (result.Blank || 0) + 1;
      return;
    }
    splitTasks(rawValue).forEach(task => {
      result[task] = (result[task] || 0) + 1;
    });
  });
  return result;
}

export function topN(objectValue: Record<string, number>, limit: number): Record<string, number> {
  const result: Record<string, number> = {};
  Object.entries(objectValue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .forEach(([key, value]) => {
      result[key] = value;
    });
  return result;
}

export function average(values: number[]): number {
  const validValues = values.filter(v => !isNaN(v) && v > 0);
  if (!validValues.length) return 0;
  const sum = validValues.reduce((a, b) => a + b, 0);
  return sum / validValues.length;
}

export function getDerivedFlags(row: CaseRow): DerivedFlags {
  const today = getTodayStart();
  const leadStage = String(row.leadStage || '').trim();
  const dealStatus = String(row.dealStatus || '').trim();
  const taskBucket = String(row.taskBucket || '').toLowerCase();
  const paymentType = String(row.paymentType || '').toLowerCase();
  const expectedDeliveryDate = row.expectedDeliveryDate;
  const actualDeliveryDate = row.actualDeliveryDate;
  const lastCallAt = row.lastCallAt;
  const paymentPercentage = Number(row.paymentPercentage || 0);
  const amountPending = Number(row.amountPending || 0);
  const amountCollected = Number(row.amountCollected || 0);
  const isAlertVisible = String(row.isAlertVisible || '').toLowerCase();
  const onDemandStatus = row.onDemandStatus;

  const isCancelledCase = leadStage === 'CANCELLED' || leadStage === 'RETURNED' || dealStatus === 'CANCEL';
  
  let isEddBreached = false;
  if (expectedDeliveryDate && !actualDeliveryDate) {
    const edd = parseDateSafe(expectedDeliveryDate);
    if (edd) {
      edd.setHours(0, 0, 0, 0);
      isEddBreached = edd.getTime() < today.getTime();
    }
  }

  let isCustomerConnectPending = taskBucket.includes('customer connect');
  if (!isCustomerConnectPending && lastCallAt) {
    const lastCallDate = parseDateSafe(lastCallAt);
    if (lastCallDate) {
      const diffDays = (today.getTime() - lastCallDate.getTime()) / (1000 * 60 * 60 * 24);
      isCustomerConnectPending = diffDays > 2;
    }
  }

  if (!lastCallAt && leadStage === 'ACTIVE_TOKEN') {
    isCustomerConnectPending = true;
  }

  return {
    isAlertCase: Boolean(row.taskBucket) && isAlertVisible !== 'false',
    isActiveToken: leadStage === 'ACTIVE_TOKEN',
    isDelivered: leadStage === 'DELIVERED',
    isCancelled: isCancelledCase,
    isEddMissing: leadStage === 'ACTIVE_TOKEN' && !expectedDeliveryDate,
    isEddBreached: isEddBreached,
    isPmaxCase: paymentType === 'pmax',
    isPmaxStuck: taskBucket.includes('p_max') || taskBucket.includes('pmax'),
    isCustomerConnectPending: isCustomerConnectPending,
    isHighPaymentPendingDelivery: paymentPercentage >= 0.75 && leadStage !== 'DELIVERED',
    isPaymentPending: amountPending > 0,
    isCancelledAfterPayment: isCancelledCase && amountCollected > 0,
    isOdPending: Boolean(onDemandStatus) && !actualDeliveryDate,
    isBlankPaymentType: !paymentType
  };
}

export function buildKpis(rows: CaseRow[]): DashboardKpis {
  const flagsList = rows.map(r => getDerivedFlags(r));
  
  const totalCollected = rows.reduce((sum, r) => sum + Number(r.amountCollected || 0), 0);
  const totalPending = rows.reduce((sum, r) => sum + Number(r.amountPending || 0), 0);
  
  const bookingsWithTasks = rows.filter(r => splitTasks(r.taskBucket).length > 0).length;
  const totalTaskInstances = rows.reduce((sum, r) => sum + splitTasks(r.taskBucket).length, 0);

  return {
    totalCases: rows.length,
    activeTokens: flagsList.filter(f => f.isActiveToken).length,
    delivered: flagsList.filter(f => f.isDelivered).length,
    cancelled: flagsList.filter(f => f.isCancelled).length,
    bookingsWithTasks,
    totalTaskInstances,
    pmaxCases: flagsList.filter(f => f.isPmaxCase).length,
    paymentPending: flagsList.filter(f => f.isPaymentPending).length,
    totalCollected,
    totalPending,
    avgPaymentPercentage: average(rows.map(r => Number(r.paymentPercentage || 0)))
  };
}

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
}

function formatDateWithSuffix(date: Date): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const day = date.getDate();
  const month = months[date.getMonth()];
  return `${day}${getOrdinalSuffix(day)} ${month}`;
}

function getExpectedDeliveryTimeDate(r: CaseRow): Date | null {
  const timeStr = String(r.expectedDeliveryTime || '').trim();
  if (!timeStr) {
    return r.expectedDeliveryDate ? parseDateString(r.expectedDeliveryDate) : null;
  }

  const hasDate = timeStr.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/) || timeStr.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/);
  if (hasDate) {
    return parseDateString(timeStr);
  }

  if (r.expectedDeliveryDate) {
    const dateStr = String(r.expectedDeliveryDate).trim();
    return parseDateString(`${dateStr} ${timeStr}`);
  }

  return null;
}

export function buildEddDistribution(rows: CaseRow[]): Record<string, number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const addDays = (d: Date, n: number) => {
    const newD = new Date(d.getTime());
    newD.setDate(newD.getDate() + n);
    return newD;
  };

  const formatRange = (start: Date, end: Date) => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = months[start.getMonth()];
    const endMonth = months[end.getMonth()];
    
    if (startMonth === endMonth) {
      return `${startDay}${getOrdinalSuffix(startDay)} to ${endDay}${getOrdinalSuffix(endDay)} ${startMonth}`;
    }
    return `${startDay}${getOrdinalSuffix(startDay)} ${startMonth} to ${endDay}${getOrdinalSuffix(endDay)} ${endMonth}`;
  };

  const labelToday = formatDateWithSuffix(today);
  const labelD1 = formatDateWithSuffix(addDays(today, 1));
  const labelD2 = formatDateWithSuffix(addDays(today, 2));
  const labelD3_6 = formatRange(addDays(today, 3), addDays(today, 6));
  const labelD7Plus = `${formatDateWithSuffix(addDays(today, 7))} +`;

  const result: Record<string, number> = {};
  result['Overdue / Breached'] = 0;
  result[labelToday] = 0;
  result[labelD1] = 0;
  result[labelD2] = 0;
  result[labelD3_6] = 0;
  result[labelD7Plus] = 0;
  result['Blank / Empty'] = 0;

  rows.forEach(r => {
    const edd = getExpectedDeliveryTimeDate(r);
    if (!edd) {
      result['Blank / Empty']++;
      return;
    }

    const eddDate = new Date(edd.getFullYear(), edd.getMonth(), edd.getDate(), 0, 0, 0, 0);
    const diffTime = eddDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      result['Overdue / Breached']++;
    } else if (diffDays === 0) {
      result[labelToday]++;
    } else if (diffDays === 1) {
      result[labelD1]++;
    } else if (diffDays === 2) {
      result[labelD2]++;
    } else if (diffDays >= 3 && diffDays <= 6) {
      result[labelD3_6]++;
    } else {
      result[labelD7Plus]++;
    }
  });

  return result;
}

function buildListingDaysDistribution(rows: CaseRow[]): Record<string, number> {
  const result: Record<string, number> = {
    '0-7': 0,
    '7-15': 0,
    '15-30': 0,
    '30-60': 0,
    '60+': 0
  };

  rows.forEach(row => {
    const days = Number(row.totalListingDays || 0);
    if (days >= 0 && days <= 7) {
      result['0-7']++;
    } else if (days > 7 && days <= 15) {
      result['7-15']++;
    } else if (days > 15 && days <= 30) {
      result['15-30']++;
    } else if (days > 30 && days <= 60) {
      result['30-60']++;
    } else if (days > 60) {
      result['60+']++;
    }
  });

  return result;
}

function buildTotalExpectedAmountDistribution(rows: CaseRow[]): Record<string, number> {
  const result: Record<string, number> = {
    '<3 Lac': 0,
    '3-6 Lac': 0,
    '6-9 Lac': 0,
    '9+ Lac': 0,
  };

  rows.forEach(row => {
    const amount = Number(row.totalExpectedAmount || 0);
    if (!(amount > 0)) return;

    if (amount < 300000) {
      result['<3 Lac']++;
    } else if (amount < 600000) {
      result['3-6 Lac']++;
    } else if (amount < 900000) {
      result['6-9 Lac']++;
    } else {
      result['9+ Lac']++;
    }
  });

  return result;
}

export function buildCharts(rows: CaseRow[]): DashboardCharts {
  // Build readyToDeliver with a fixed order: Blank → Yes → No
  const rtdRaw = groupCount(rows, 'readyToDeliver');
  const readyToDeliver: Record<string, number> = {};
  (['Blank', 'Yes', 'No'] as const).forEach(key => {
    if (rtdRaw[key] !== undefined) readyToDeliver[key] = rtdRaw[key];
  });
  // Include any unexpected values not in the above list
  Object.keys(rtdRaw).forEach(k => {
    if (!(k in readyToDeliver)) readyToDeliver[k] = rtdRaw[k];
  });

  return {
    leadStage: groupCount(rows, 'leadStage'),
    dealStatus: groupCount(rows, 'dealStatus'),
    city: groupCount(rows, 'city'),
    hub: topN(groupCount(rows, 'hubName'), 15),
    rm: topN(groupCount(rows, 'allocatedRm'), 15),
    dc: topN(groupCount(rows, 'assignedDc'), 15),
    readyToDeliver,
    onDemandStatusDistribution: groupCount(rows, 'onDemandStatus'),
    totalExpectedAmountDistribution: buildTotalExpectedAmountDistribution(rows),
    tokenType: groupCount(rows, 'tokenType'),
    tokenTypeWithNrt: groupCount(rows, 'tokenTypeWithNrt'),
    paymentType: groupCount(rows, 'paymentType'),
    funnelStage: topN(groupCount(rows, 'funnelStage'), 15),
    taskBucket: topN(groupMultiCount(rows, 'taskBucket'), 15),
    cancellationReason: topN(groupCount(rows, 'cancelReason'), 15),
    sheetFinalStatus: groupCount(rows, 'sheetFinalStatus'),
    formFinalStatus: groupCount(rows, 'formFinalStatus'),
    eddDistribution: buildEddDistribution(rows),
    leadDsChannel: groupCount(rows.filter(r => r.leadStage === 'CANCELLED' || r.leadStage === 'RETURNED' || r.dealStatus === 'CANCEL' || r.cancelReason), 'leadDsChannel'),
    listingDaysDistribution: buildListingDaysDistribution(rows)
  };
}

// Generate realistic mock data matching cars24 operations
export const SEED_CASE_ROWS: CaseRow[] = [
  {
    _rowNumber: 2,
    bookingId: "B-2026-9011",
    uid: "UID-C24-00192a",
    leadId: "LD-66113",
    userId: "USR-Mukesh91",
    loanId: "LN-881920",
    appointmentId: "APT-55110",
    carRegNo: "DL3CAQ9912",
    hubCode: "HUB-DEL-01",
    hubName: "Delhi South Hub",
    city: "Delhi-NCR",
    allocatedRm: "Pradeep Kumar",
    totalListingDays: 5,
    assignedDc: "Rohit Sharma",
    caAssignedLms: "LMS-9112",
    sm: "Sanjay Singh",
    tm: "Tarun Mehta",
    rm: "Rajendra Mishra",
    dealStatus: "ACTIVE",
    dealStatusUpdatedAt: "2026-06-01 10:15:00",
    cancellationDate: "",
    autoCancelledFlag: "false",
    tokenAutoCancellationExtendedDate: "",
    leadStage: "ACTIVE_TOKEN",
    tokenType: "PAID_TOKEN",
    tokenTypeWithNrt: "PAID_TOKEN_NRT",
    paymentType: "PMAX",
    funnelStage: "TOKEN_PAID",
    tokenDate: "2026-06-01",
    tokenDateTime: "2026-06-01 10:00:00",
    bookingDate: "2026-06-02",
    expectedDeliveryDate: "2026-06-04", // Breached! (Since today is June 05)
    expectedDeliveryTime: "17:00:00",
    actualDeliveryDate: "",
    lastPaymentDate: "2026-06-01",
    latestRemarkDate: "2026-06-04 11:15:00",
    updatedAt: "2026-06-04 18:30:00",
    cancelReqDate: "",
    deliveryStatus: "PENDING_DISPATCH",
    deliverySegment: "T2D_STANDARD",
    onDemandStatus: "ASSIGNED",
    amountCollected: 450000,
    amountPending: 150000,
    totalExpectedAmount: 600000,
    agreedSalesPrice: 580000,
    paymentPercentage: 0.77,
    readyToDeliver: "Yes",
    expectedOdCompletionDate: "2026-06-06",
    eddReviewerDate: "2026-06-04",
    reviewerRemarks: "Insurance paperwork verified. Loan disbursement awaited.",
    make: "Maruti Suzuki",
    model: "Swift",
    variant: "VXI",
    manufacturingYear: "2021",
    rcCaseType: "FRESH",
    incomeSource: "SALARIED",
    oglPincodeFlag: "Y",
    creditLtv: "85%",
    lastRiskBucket: "LOW_RISK",
    dsRoi: "9.5%",
    finalRoi: "9.5%",
    creditRejectionReason: "",
    creditRejectionSubReason: "",
    diligenceRejectionReason: "",
    diligenceRejectionSubReason: "",
    redChannelReason: "",
    softDerogFlag: "false",
    hardDerogFlag: "false",
    nonOgl: "false",
    contactNumber: "9876543210",
    redChannelFlag: "N",
    tofRejectedFlag: "N",
    deviationMitigationComment: "Co-applicant salary added to mitigate credit risk.",
    bajajSegment: "A",
    companyName: "TCS Ltd",
    leadDsChannel: "DIRECT",
    foir: "35%",
    latestLeadCreationTimestamp: "2026-06-01 09:30:00",
    latestLoginTime: "2026-06-01 11:00:00",
    latestCreditAssessedTimestamp: "2026-06-01 14:00:00",
    latestDiligenceAssessedTimestamp: "2026-06-02 12:00:00",
    latestFcuAssessedTimestamp: "2026-06-02 15:00:00",
    tncGeneratedDate: "2026-06-02",
    tncAcceptedTimestamp: "2026-06-02 17:30:00",
    fcuSentDate: "2026-06-02",
    sentToRcuTimestamp: "2026-06-03 10:00:00",
    sentToOpsTimestamp: "2026-06-03 14:00:00",
    submitToOpsTimestamp: "2026-06-03 16:30:00",
    opsDisbursalTimestamp: "",
    financeDisbursedTimestamp: "",
    lastCallAt: "2026-06-04", // 1 day ago (not customer connect pending)
    followupAt: "2026-06-05",
    totalCallAttempts: 4,
    totalConnectedCalls: 3,
    lastCallConnectedSp: "Pradeep Kumar",
    callDuration: "120s",
    latestCallOutcome: "CONNECTED_AWAITING_PAYMENT",
    lastDisposition: "FOLLOW_UP_SCHEDULED",
    latestRemark: "Customer agreed to complete payment by Friday.",
    latestRemarkBy: "Pradeep Kumar",
    isActive: "true",
    isAlertVisible: "true",
    cancelReason: "",
    taskBucket: "Customer Connect, Insurance Verification",
    reasonPointer: "Awaiting physical evaluation documents.",
    sheetLoginPartner: "CHOLA_MANDALAM",
    sheetFinalStatus: "AWAITING_DISBURSEMENT",
    sheetYardName: "Delhi South Yard",
    sheetYardCity: "Delhi-NCR",
    sheetDetailedRemarks: "RC transfer requested online. Pending physical confirmation.",
    sheetLastDisbursalActivity: "Awaiting Bank Approval",
    sheetLoginTimestamp: "2026-06-01 11:30:00",
    formRiskBucket: "GREEN",
    formFinalStatus: "APPROVED",
    formCaseStage: "DISBURSEMENT_INITIATED",
    formFinalRemarks: "Clean record. Approved.",
    formDeviationRequired: "No",
    formDetailedAsk: "None",
    gmailSummary: "Auto dispatch approved from finance.",
    gmailPendencyStatus: "RESOLVED",
    gmailPendencyReason: "",
    gmailNextAction: "DISPATCH_CAR_TO_HUB",
    gmailPendencySource: "FINANCE_DESK",
    gmailPendencyDate: "2026-06-03",
    confidenceScore: "0.98",
    mlEstimatedDeliveryDate: "2026-06-05"
  },
  {
    _rowNumber: 3,
    bookingId: "B-2026-3023",
    uid: "UID-C24-11002b",
    leadId: "LD-99382",
    userId: "USR-Ananya88",
    loanId: "",
    appointmentId: "APT-11202",
    carRegNo: "MH12TB4412",
    hubCode: "HUB-MUM-02",
    hubName: "Mumbai West Hub",
    city: "Mumbai",
    allocatedRm: "Vikram Malhotra",
    totalListingDays: 12,
    assignedDc: "Nehal Patel",
    caAssignedLms: "LMS-3310",
    sm: "Yashvardhan K",
    tm: "Karan Johar",
    rm: "Suresh Prabhu",
    dealStatus: "ACTIVE",
    dealStatusUpdatedAt: "2026-06-02 11:00:00",
    cancellationDate: "",
    autoCancelledFlag: "false",
    tokenAutoCancellationExtendedDate: "",
    leadStage: "ACTIVE_TOKEN",
    tokenType: "PAID_TOKEN",
    tokenTypeWithNrt: "PAID_TOKEN_NRT",
    paymentType: "CASH",
    funnelStage: "TOKEN_PAID",
    tokenDate: "2026-06-02",
    tokenDateTime: "2026-06-02 10:45:00",
    bookingDate: "2026-06-02",
    expectedDeliveryDate: "2026-06-06", // Future delivery
    expectedDeliveryTime: "11:30:00",
    actualDeliveryDate: "",
    lastPaymentDate: "2026-06-02",
    latestRemarkDate: "2026-06-02 15:30:00",
    updatedAt: "2026-06-03 09:15:00",
    cancelReqDate: "",
    deliveryStatus: "READY_FOR_DELIVERY",
    deliverySegment: "T2D_PREMIUM",
    onDemandStatus: "DELIVERING",
    amountCollected: 1200000,
    amountPending: 0,
    totalExpectedAmount: 1200000,
    agreedSalesPrice: 1200000,
    paymentPercentage: 1.0,
    readyToDeliver: "Yes",
    expectedOdCompletionDate: "2026-06-06",
    eddReviewerDate: "2026-06-03",
    reviewerRemarks: "Full cash payment cleared in account. Final detailing done.",
    make: "Hyundai",
    model: "Creta",
    variant: "SX Plus",
    manufacturingYear: "2022",
    rcCaseType: "FRESH",
    incomeSource: "BUSINESS",
    oglPincodeFlag: "Y",
    creditLtv: "0%",
    lastRiskBucket: "MINIMAL_RISK",
    dsRoi: "0%",
    finalRoi: "0%",
    creditRejectionReason: "",
    creditRejectionSubReason: "",
    diligenceRejectionReason: "",
    diligenceRejectionSubReason: "",
    redChannelReason: "",
    softDerogFlag: "false",
    hardDerogFlag: "false",
    nonOgl: "false",
    contactNumber: "9123456789",
    redChannelFlag: "N",
    tofRejectedFlag: "N",
    deviationMitigationComment: "",
    bajajSegment: "A+",
    companyName: "Venkatesh Enterprises",
    leadDsChannel: "ORGANIC",
    foir: "10%",
    latestLeadCreationTimestamp: "2026-06-02 09:30:00",
    latestLoginTime: "2026-06-02 10:00:00",
    latestCreditAssessedTimestamp: "",
    latestDiligenceAssessedTimestamp: "2026-06-02 12:00:00",
    latestFcuAssessedTimestamp: "",
    tncGeneratedDate: "2026-06-02",
    tncAcceptedTimestamp: "2026-06-02 14:00:00",
    fcuSentDate: "",
    sentToRcuTimestamp: "",
    sentToOpsTimestamp: "2026-06-02 16:00:00",
    submitToOpsTimestamp: "2026-06-02 16:30:00",
    opsDisbursalTimestamp: "",
    financeDisbursedTimestamp: "",
    lastCallAt: "2026-06-02", // Last call June 02, today June 05 (> 2 days diff, Customer Connect Pending!)
    followupAt: "2026-06-06",
    totalCallAttempts: 2,
    totalConnectedCalls: 2,
    lastCallConnectedSp: "Vikram Malhotra",
    callDuration: "350s",
    latestCallOutcome: "CONNECTED_AWAITING_DELIVERY",
    lastDisposition: "VISIT_CONFIRMED",
    latestRemark: "Wants home delivery with a ribbon on the hood.",
    latestRemarkBy: "Vikram Malhotra",
    isActive: "true",
    isAlertVisible: "false",
    cancelReason: "",
    taskBucket: "RTO Registration",
    reasonPointer: "RC documentation is being dispatched to RTO West.",
    sheetLoginPartner: "DIRECT_CASH",
    sheetFinalStatus: "PAYMENT_CLEARED",
    sheetYardName: "Mumbai West Yard",
    sheetYardCity: "Mumbai",
    sheetDetailedRemarks: "Perfect direct buyer. Paid 100% upfront.",
    sheetLastDisbursalActivity: "Cash Cleared",
    sheetLoginTimestamp: "2026-06-02 10:45:00",
    formRiskBucket: "GREEN",
    formFinalStatus: "APPROVED",
    formCaseStage: "DELIVERY_SCHEDULED",
    formFinalRemarks: "Perfect evaluation.",
    formDeviationRequired: "No",
    formDetailedAsk: "",
    gmailSummary: "100% receipt verified programmatically.",
    gmailPendencyStatus: "NONE",
    gmailPendencyReason: "",
    gmailNextAction: "DELIVER_VEHICLE",
    gmailPendencySource: "ACCOUNTS_TEAM",
    gmailPendencyDate: "2026-06-02",
    confidenceScore: "1.0",
    mlEstimatedDeliveryDate: "2026-06-06"
  },
  {
    _rowNumber: 4,
    bookingId: "B-2026-5512",
    uid: "UID-C24-22119c",
    leadId: "LD-11109",
    userId: "USR-Sriram99",
    loanId: "LN-382902",
    appointmentId: "APT-22001",
    carRegNo: "KA03MM8811",
    hubCode: "HUB-BLR-03",
    hubName: "Bangalore Whitefield Hub",
    city: "Bangalore",
    allocatedRm: "Nisha Hegde",
    totalListingDays: 20,
    assignedDc: "Koushik Naidu",
    caAssignedLms: "LMS-1087",
    sm: "Aniruddh R",
    tm: "Meghana Gowda",
    rm: "Siddharth K",
    dealStatus: "ACTIVE",
    dealStatusUpdatedAt: "2026-06-03 14:00:00",
    cancellationDate: "",
    autoCancelledFlag: "false",
    tokenAutoCancellationExtendedDate: "",
    leadStage: "DELIVERED", // ALREADY DELIVERED CASE!
    tokenType: "PAID_TOKEN",
    tokenTypeWithNrt: "PAID_TOKEN_NRT",
    paymentType: "PMAX",
    funnelStage: "DELIVERY_COMPLETE",
    tokenDate: "2026-05-28",
    tokenDateTime: "2026-05-28 15:45:00",
    bookingDate: "2026-05-29",
    expectedDeliveryDate: "2026-06-03",
    expectedDeliveryTime: "16:00:00",
    actualDeliveryDate: "2026-06-03", // Delivered on time!
    lastPaymentDate: "2026-06-02",
    latestRemarkDate: "2026-06-03 17:00:00",
    updatedAt: "2026-06-03 17:30:00",
    cancelReqDate: "",
    deliveryStatus: "DELIVERED",
    deliverySegment: "T2D_STANDARD",
    onDemandStatus: "COMPLETED",
    amountCollected: 520000,
    amountPending: 0,
    totalExpectedAmount: 520000,
    agreedSalesPrice: 512000,
    paymentPercentage: 1.0,
    readyToDeliver: "Yes",
    expectedOdCompletionDate: "2026-06-03",
    eddReviewerDate: "2026-06-02",
    reviewerRemarks: "Delivered at Whitefield. Feedback form received. rating five star.",
    make: "Honda",
    model: "City",
    variant: "VMT",
    manufacturingYear: "2019",
    rcCaseType: "FRESH",
    incomeSource: "SALARIED",
    oglPincodeFlag: "Y",
    creditLtv: "78%",
    lastRiskBucket: "LOW_RISK",
    dsRoi: "10.2%",
    finalRoi: "10.2%",
    creditRejectionReason: "",
    creditRejectionSubReason: "",
    diligenceRejectionReason: "",
    diligenceRejectionSubReason: "",
    redChannelReason: "",
    softDerogFlag: "false",
    hardDerogFlag: "false",
    nonOgl: "false",
    contactNumber: "9456781210",
    redChannelFlag: "N",
    tofRejectedFlag: "N",
    deviationMitigationComment: "",
    bajajSegment: "B",
    companyName: "Infosys Ltd",
    leadDsChannel: "ONLINE_ADS",
    foir: "28%",
    latestLeadCreationTimestamp: "2026-05-28 14:00:00",
    latestLoginTime: "2026-05-29 10:00:00",
    latestCreditAssessedTimestamp: "2026-05-29 14:00:00",
    latestDiligenceAssessedTimestamp: "2026-05-30 11:00:00",
    latestFcuAssessedTimestamp: "2026-05-30 16:00:00",
    tncGeneratedDate: "2026-05-30",
    tncAcceptedTimestamp: "2026-05-31 10:30:00",
    fcuSentDate: "2026-05-30",
    sentToRcuTimestamp: "2026-06-01 10:00:00",
    sentToOpsTimestamp: "2026-06-01 14:00:00",
    submitToOpsTimestamp: "2026-06-02 11:30:00",
    opsDisbursalTimestamp: "2026-06-02 16:30:00",
    financeDisbursedTimestamp: "2026-06-02 18:00:00",
    lastCallAt: "2026-06-03", 
    followupAt: "",
    totalCallAttempts: 5,
    totalConnectedCalls: 4,
    lastCallConnectedSp: "Koushik Naidu",
    callDuration: "90s",
    latestCallOutcome: "DELIVERED_SUCCESSFULLY",
    lastDisposition: "COMPLETED",
    latestRemark: "Keys handed over. Customer delighted.",
    latestRemarkBy: "Koushik Naidu",
    isActive: "false",
    isAlertVisible: "false",
    cancelReason: "",
    taskBucket: "",
    reasonPointer: "",
    sheetLoginPartner: "HDFC_BANK",
    sheetFinalStatus: "DISBURSED",
    sheetYardName: "Whitefield Yard",
    sheetYardCity: "Bangalore",
    sheetDetailedRemarks: "Perfect execution by yard delivery team.",
    sheetLastDisbursalActivity: "Fund Received",
    sheetLoginTimestamp: "2026-05-29 11:00:00",
    formRiskBucket: "GREEN",
    formFinalStatus: "APPROVED",
    formCaseStage: "CLOSED",
    formFinalRemarks: "Delivered.",
    formDeviationRequired: "No",
    formDetailedAsk: "",
    gmailSummary: "Yard clearance received via email.",
    gmailPendencyStatus: "RESOLVED",
    gmailPendencyReason: "",
    gmailNextAction: "NONE",
    gmailPendencySource: "DELIVERY_DESK",
    gmailPendencyDate: "2026-06-03",
    confidenceScore: "1.0",
    mlEstimatedDeliveryDate: "2026-06-03"
  },
  {
    _rowNumber: 5,
    bookingId: "B-2026-7781",
    uid: "UID-C24-38210d",
    leadId: "LD-28102",
    userId: "USR-Preeti77",
    loanId: "LN-981239",
    appointmentId: "",
    carRegNo: "HR26CR1092",
    hubCode: "HUB-DEL-03",
    hubName: "Gurgaon Hub",
    city: "Delhi-NCR",
    allocatedRm: "Pradeep Kumar",
    totalListingDays: 45,
    assignedDc: "Sandeep Yadav",
    caAssignedLms: "LMS-9112",
    sm: "Sanjay Singh",
    tm: "Tarun Mehta",
    rm: "Rajendra Mishra",
    dealStatus: "CANCEL", // CANCELLED CASE
    dealStatusUpdatedAt: "2026-06-04 16:30:00",
    cancellationDate: "2026-06-04",
    autoCancelledFlag: "false",
    tokenAutoCancellationExtendedDate: "",
    leadStage: "RETURNED",
    tokenType: "PAID_TOKEN",
    tokenTypeWithNrt: "PAID_TOKEN_NRT",
    paymentType: "PMAX",
    funnelStage: "CANCELLED",
    tokenDate: "2026-05-30",
    tokenDateTime: "2026-05-30 11:30:00",
    bookingDate: "2026-05-31",
    expectedDeliveryDate: "2026-06-03",
    expectedDeliveryTime: "",
    actualDeliveryDate: "2026-06-03",
    lastPaymentDate: "2026-05-30",
    latestRemarkDate: "2026-06-04 15:45:00",
    updatedAt: "2026-06-04 16:30:00",
    cancelReqDate: "2026-06-04",
    deliveryStatus: "CANCELLED",
    deliverySegment: "T2D_STANDARD",
    onDemandStatus: "",
    amountCollected: 10000, // Partial token only, but cancelled
    amountPending: 390000,
    totalExpectedAmount: 400000,
    agreedSalesPrice: 395000,
    paymentPercentage: 0.02,
    readyToDeliver: "No",
    expectedOdCompletionDate: "",
    eddReviewerDate: "",
    reviewerRemarks: "Rejected due to multiple financial defaults in CIBIL.",
    make: "Renault",
    model: "Kwid",
    variant: "RXT",
    manufacturingYear: "2020",
    rcCaseType: "FRESH",
    incomeSource: "SELF_EMPLOYED",
    oglPincodeFlag: "N",
    creditLtv: "95%",
    lastRiskBucket: "CIBIL_DEFAULT",
    dsRoi: "12.5%",
    finalRoi: "12.5%",
    creditRejectionReason: "CIBIL_SCORE_LOW",
    creditRejectionSubReason: "ACTIVE_WRITTEN_OFF_ACCOUNT",
    diligenceRejectionReason: "CREDIT_POLICY_DEVIATION",
    diligenceRejectionSubReason: "HIGH_FOIR",
    redChannelReason: "Pincode is blacklisted.",
    softDerogFlag: "true",
    hardDerogFlag: "true",
    nonOgl: "true",
    contactNumber: "9512345670",
    redChannelFlag: "Y",
    tofRejectedFlag: "Y",
    deviationMitigationComment: "Proposed co-applicant draft was also rejected.",
    bajajSegment: "C",
    companyName: "Rao Electricals",
    leadDsChannel: "DIRECT",
    foir: "62%",
    latestLeadCreationTimestamp: "2026-05-30 09:15:00",
    latestLoginTime: "2026-05-30 11:00:00",
    latestCreditAssessedTimestamp: "2026-05-31 15:00:00",
    latestDiligenceAssessedTimestamp: "2026-06-01 10:00:00",
    latestFcuAssessedTimestamp: "2026-06-01 14:00:00",
    tncGeneratedDate: "",
    tncAcceptedTimestamp: "",
    fcuSentDate: "2026-06-01",
    sentToRcuTimestamp: "",
    sentToOpsTimestamp: "",
    submitToOpsTimestamp: "",
    opsDisbursalTimestamp: "",
    financeDisbursedTimestamp: "",
    lastCallAt: "2026-06-04",
    followupAt: "",
    totalCallAttempts: 4,
    totalConnectedCalls: 4,
    lastCallConnectedSp: "Pradeep Kumar",
    callDuration: "140s",
    latestCallOutcome: "CONNECTED_CANCELLED_CONFIRMED",
    lastDisposition: "REFUND_REQUESTED",
    latestRemark: "Refund for 10k token is being processed in system.",
    latestRemarkBy: "Pradeep Kumar",
    isActive: "false",
    isAlertVisible: "true",
    cancelReason: "Financial Rejection",
    taskBucket: "Refund Initiation",
    reasonPointer: "CIBIL score is less than 500.",
    sheetLoginPartner: "IDFC_FIRST",
    sheetFinalStatus: "REJECTED",
    sheetYardName: "Gurgaon Yard",
    sheetYardCity: "Delhi-NCR",
    sheetDetailedRemarks: "Credit desk rejected the case immediately.",
    sheetLastDisbursalActivity: "Case Cancelled",
    sheetLoginTimestamp: "2026-05-30 14:30:00",
    formRiskBucket: "RED",
    formFinalStatus: "REJECTED",
    formCaseStage: "CLOSED_CANCELLED",
    formFinalRemarks: "Policy limits breached.",
    formDeviationRequired: "Yes",
    formDetailedAsk: "Deviation rejected by RM.",
    gmailSummary: "Low credit rating notice dispatched.",
    gmailPendencyStatus: "CLOSED",
    gmailPendencyReason: "REJECTED",
    gmailNextAction: "NONE",
    gmailPendencySource: "CREDIT_TEAM",
    gmailPendencyDate: "2026-06-04",
    confidenceScore: "0.2",
    mlEstimatedDeliveryDate: ""
  },
  {
    _rowNumber: 6,
    bookingId: "B-2026-1182",
    uid: "UID-C24-11881e",
    leadId: "LD-33291",
    userId: "USR-Rahul92",
    loanId: "LN-281092",
    appointmentId: "APT-88910",
    carRegNo: "MH02CC9981",
    hubCode: "HUB-MUM-01",
    hubName: "Mumbai South Hub",
    city: "Mumbai",
    allocatedRm: "Yogesh Patil",
    totalListingDays: 80,
    assignedDc: "Nehal Patel",
    caAssignedLms: "LMS-3310",
    sm: "Yashvardhan K",
    tm: "Karan Johar",
    rm: "Suresh Prabhu",
    dealStatus: "ACTIVE",
    dealStatusUpdatedAt: "2026-06-03 10:00:00",
    cancellationDate: "",
    autoCancelledFlag: "false",
    tokenAutoCancellationExtendedDate: "",
    leadStage: "ACTIVE_TOKEN",
    tokenType: "PAID_TOKEN",
    tokenTypeWithNrt: "PAID_TOKEN_NRT",
    paymentType: "PMAX", // PMax stuck indicator!
    funnelStage: "TOKEN_PAID",
    tokenDate: "2026-06-02",
    tokenDateTime: "2026-06-02 11:30:00",
    bookingDate: "2026-06-03",
    expectedDeliveryDate: "", // Missing EDD!
    expectedDeliveryTime: "",
    actualDeliveryDate: "",
    lastPaymentDate: "2026-06-02",
    latestRemarkDate: "2026-06-03 14:30:00",
    updatedAt: "2026-06-04 11:30:00",
    cancelReqDate: "",
    deliveryStatus: "AWAITING_ETA",
    deliverySegment: "T2D_STANDARD",
    onDemandStatus: "",
    amountCollected: 310000,
    amountPending: 190000,
    totalExpectedAmount: 500000,
    agreedSalesPrice: 490000,
    paymentPercentage: 0.62,
    readyToDeliver: "",
    expectedOdCompletionDate: "",
    eddReviewerDate: "",
    reviewerRemarks: "Awaiting physical evaluation of co-applicant property assets.",
    make: "Tata",
    model: "Nexon",
    variant: "XM",
    manufacturingYear: "2022",
    rcCaseType: "FRESH",
    incomeSource: "SALARIED",
    oglPincodeFlag: "Y",
    creditLtv: "80%",
    lastRiskBucket: "MEDIUM_RISK",
    dsRoi: "10.4%",
    finalRoi: "10.4%",
    creditRejectionReason: "",
    creditRejectionSubReason: "",
    diligenceRejectionReason: "",
    diligenceRejectionSubReason: "",
    redChannelReason: "",
    softDerogFlag: "false",
    hardDerogFlag: "false",
    nonOgl: "false",
    contactNumber: "9812348821",
    redChannelFlag: "N",
    tofRejectedFlag: "N",
    deviationMitigationComment: "",
    bajajSegment: "A",
    companyName: "RIL Ltd",
    leadDsChannel: "DIRECT",
    foir: "40%",
    latestLeadCreationTimestamp: "2026-06-02 09:00:00",
    latestLoginTime: "2026-06-02 11:30:00",
    latestCreditAssessedTimestamp: "2026-06-03 15:00:00",
    latestDiligenceAssessedTimestamp: "",
    latestFcuAssessedTimestamp: "",
    tncGeneratedDate: "",
    tncAcceptedTimestamp: "",
    fcuSentDate: "",
    sentToRcuTimestamp: "",
    sentToOpsTimestamp: "",
    submitToOpsTimestamp: "",
    opsDisbursalTimestamp: "",
    financeDisbursedTimestamp: "",
    lastCallAt: "", // No last call + Active token = Customer Connect Pending!
    followupAt: "2026-06-05",
    totalCallAttempts: 0,
    totalConnectedCalls: 0,
    lastCallConnectedSp: "",
    callDuration: "",
    latestCallOutcome: "",
    lastDisposition: "",
    latestRemark: "New booking initiated. Awaiting call.",
    latestRemarkBy: "Yogesh Patil",
    isActive: "true",
    isAlertVisible: "true",
    cancelReason: "",
    taskBucket: "PMax Stuck, customer connect", // Contains pmax and customer connect!
    reasonPointer: "Documentation incomplete.",
    sheetLoginPartner: "KOTAK_MAHINDRA",
    sheetFinalStatus: "LOGIN_COMPLETED",
    sheetYardName: "Mumbai South Yard",
    sheetYardCity: "Mumbai",
    sheetDetailedRemarks: "Login successfully created on portal. Pending docs.",
    sheetLastDisbursalActivity: "Login Pending",
    sheetLoginTimestamp: "2026-06-03 11:00:00",
    formRiskBucket: "ORANGE",
    formFinalStatus: "PENDING",
    formCaseStage: "LOGIN_COMPLETED",
    formFinalRemarks: "Verify Pan card scan copy.",
    formDeviationRequired: "No",
    formDetailedAsk: "",
    gmailSummary: "Awaiting confirmation of address match.",
    gmailPendencyStatus: "PENDING",
    gmailPendencyReason: "ADDRESS_MISMATCH_DRAFT",
    gmailNextAction: "SUBMIT_ADDITIONAL_PROOF",
    gmailPendencySource: "CREDIT_TEAM",
    gmailPendencyDate: "2026-06-04",
    confidenceScore: "0.65",
    mlEstimatedDeliveryDate: "2026-06-08"
  }
];

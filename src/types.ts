/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CaseRow {
  _rowNumber: number; // Google Sheet row index (e.g. 2, 3...)
  bookingId: string;  // Unique ID
  
  // IDs and links
  uid?: string;
  leadId?: string;
  userId?: string;
  loanId?: string;
  appointmentId?: string;
  carRegNo?: string;

  // Location and ownership
  hubCode?: string;
  hubName?: string;
  city?: string;
  assignedRm?: string;
  assignedDc?: string;
  caAssignedLms?: string;
  sm?: string;
  tm?: string;
  rm?: string;

  // Deal and lead status
  dealStatus?: string;
  dealStatusUpdatedAt?: string;
  cancellationDate?: string;
  autoCancelledFlag?: string;
  tokenAutoCancellationExtendedDate?: string;
  leadStage?: string;
  tokenType?: string;
  tokenTypeWithNrt?: string;
  paymentType?: string;
  leadStatus?: string;
  funnelStage?: string;

  // Dates
  tokenDate?: string;
  tokenDateTime?: string;
  bookingDate?: string;
  expectedDeliveryDate?: string;
  expectedDeliveryTime?: string;
  actualDeliveryDate?: string;
  lastPaymentDate?: string;
  latestRemarkDate?: string;
  updatedAt?: string;
  cancelReqDate?: string;

  // Delivery
  deliveryStatus?: string;
  deliverySegment?: string;
  onDemandStatus?: string;

  // Amounts
  amountCollected?: number;
  amountPending?: number;
  totalExpectedAmount?: number;
  agreedSalesPrice?: number;
  paymentPercentage?: number;

  // Actionable columns
  readyToDeliver?: string; // 'Yes', 'No', or ''
  expectedOdCompletionDate?: string;
  eddReviewerDate?: string;
  reviewerRemarks?: string;

  // Vehicle
  make?: string;
  model?: string;
  variant?: string;
  manufacturingYear?: string;

  // Finance and risk
  rcCaseType?: string;
  incomeSource?: string;
  oglPincodeFlag?: string;
  creditLtv?: string;
  lastRiskBucket?: string;
  dsRoi?: string;
  finalRoi?: string;
  creditRejectionReason?: string;
  creditRejectionSubReason?: string;
  diligenceRejectionReason?: string;
  diligenceRejectionSubReason?: string;
  redChannelReason?: string;
  softDerogFlag?: string;
  hardDerogFlag?: string;
  nonOgl?: string;
  contactNumber?: string;
  redChannelFlag?: string;
  tofRejectedFlag?: string;
  deviationMitigationComment?: string;
  bajajSegment?: string;
  companyName?: string;
  leadDsChannel?: string;
  foir?: string;

  // Milestones
  latestLeadCreationTimestamp?: string;
  latestLoginTime?: string;
  latestCreditAssessedTimestamp?: string;
  latestDiligenceAssessedTimestamp?: string;
  latestFcuAssessedTimestamp?: string;
  tncGeneratedDate?: string;
  tncAcceptedTimestamp?: string;
  fcuSentDate?: string;
  sentToRcuTimestamp?: string;
  sentToOpsTimestamp?: string;
  submitToOpsTimestamp?: string;
  opsDisbursalTimestamp?: string;
  financeDisbursedTimestamp?: string;

  // Calling
  lastCallAt?: string;
  followupAt?: string;
  totalCallAttempts?: number;
  totalConnectedCalls?: number;
  lastCallConnectedSp?: string;
  callDuration?: string;
  latestCallOutcome?: string;
  lastDisposition?: string;

  // Remarks / status info
  latestRemark?: string;
  latestRemarkBy?: string;
  isActive?: string;
  isAlertVisible?: string;
  cancelReason?: string;
  taskBucket?: string;
  reasonPointer?: string;

  // Sheet Status
  sheetLoginPartner?: string;
  sheetFinalStatus?: string;
  sheetYardName?: string;
  sheetYardCity?: string;
  sheetDetailedRemarks?: string;
  sheetLastDisbursalActivity?: string;
  sheetLoginTimestamp?: string;

  // Form Status
  formRiskBucket?: string;
  formFinalStatus?: string;
  formCaseStage?: string;
  formFinalRemarks?: string;
  formDeviationRequired?: string;
  formDetailedAsk?: string;

  // Gmail / ML
  gmailSummary?: string;
  gmailPendencyStatus?: string;
  gmailPendencyReason?: string;
  gmailNextAction?: string;
  gmailPendencySource?: string;
  gmailPendencyDate?: string;
  confidenceScore?: string;
  mlEstimatedDeliveryDate?: string;
}

export interface DerivedFlags {
  isAlertCase: boolean;
  isActiveToken: boolean;
  isDelivered: boolean;
  isCancelled: boolean;
  isEddMissing: boolean;
  isEddBreached: boolean;
  isPmaxCase: boolean;
  isPmaxStuck: boolean;
  isCustomerConnectPending: boolean;
  isHighPaymentPendingDelivery: boolean;
  isPaymentPending: boolean;
  isCancelledAfterPayment: boolean;
  isOdPending: boolean;
  isBlankPaymentType: boolean;
}

export interface FilterState {
  city: string;
  hubName: string;
  tokenType: string;
  tokenTypeWithNrt: string;
  rmName: string;
  dcName: string;
  paymentType: string;
  leadStage: string;
  dealStatus: string;
  funnelStage: string;
  sheetFinalStatus: string;
  formFinalStatus: string;
  gmailPendencyStatus: string;
  taskBucket: string;
  derivedStatus: string;
  dateField: string;
  startDate: string;
  endDate: string;
  searchQuery: string;
}

export interface DashboardKpis {
  totalCases: number;
  activeTokens: number;
  delivered: number;
  cancelled: number;
  bookingsWithTasks: number;
  totalTaskInstances: number;
  pmaxCases: number;
  paymentPending: number;
  totalCollected: number;
  totalPending: number;
  avgPaymentPercentage: number;
}

export interface DashboardCharts {
  leadStage: Record<string, number>;
  dealStatus: Record<string, number>;
  city: Record<string, number>;
  hub: Record<string, number>;
  rm: Record<string, number>;
  dc: Record<string, number>;
  tokenType: Record<string, number>;
  tokenTypeWithNrt: Record<string, number>;
  paymentType: Record<string, number>;
  funnelStage: Record<string, number>;
  taskBucket: Record<string, number>;
  cancellationReason: Record<string, number>;
  sheetFinalStatus: Record<string, number>;
  formFinalStatus: Record<string, number>;
  derivedStatus: Record<string, number>;
}

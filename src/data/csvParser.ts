/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CaseRow } from '../types';

// Robust client-side CSV parser that handles quotes, line-breaks, and commas correctly
export function parseCsvRaw(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}


/**
 * Strips ALL whitespace — including non-breaking spaces (\u00A0), zero-width spaces (\u200B),
 * and other unicode whitespace that JS .trim() misses.
 */
function normalizeStr(val: string): string {
  return val
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/g, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/g, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')  // replace mid-string invisible chars with regular space
    .replace(/  +/g, ' ');  // collapse double spaces
}

export function mapCsvRows(parsed: string[][]): CaseRow[] {
  if (parsed.length < 2) {
    throw new Error('Dataset must contain a header row and at least one data row.');
  }

  const rawHeaders = parsed[0].map(h => 
    h.trim()
     .toLowerCase()
     .replace(/[\r\n\t]+/g, ' ')
     .replace(/\s+/g, ' ')
  );
  
  // Standard header mappings
  const mappingTable: Record<string, keyof CaseRow> = {
    'booking_id': 'bookingId',
    'bookingid': 'bookingId',
    'booking': 'bookingId',
    'uid': 'uid',
    'lead_id': 'leadId',
    'leadid': 'leadId',
    'user_id': 'userId',
    'userid': 'userId',
    'loan_id': 'loanId',
    'loanid': 'loanId',
    'appointmentid': 'appointmentId',
    'appointment_id': 'appointmentId',
    'car_reg_no': 'carRegNo',
    'carregno': 'carRegNo',
    'hub_code': 'hubCode',
    'hubname': 'hubName',
    'hub_name': 'hubName',
    'city': 'city',
    'allocated_rm': 'allocatedRm',
    'allocatedrm': 'allocatedRm',
    'assigned_rm': 'allocatedRm',
    'assignedrm': 'allocatedRm',
    'assigned_dc': 'assignedDc',
    'assigneddc': 'assignedDc',
    'lead_stage': 'leadStage',
    'leadstage': 'leadStage',
    'deal_status': 'dealStatus',
    'dealstatus': 'dealStatus',
    'token_type': 'tokenType',
    'tokentype': 'tokenType',
    'payment_type': 'paymentType',
    'paymenttype': 'paymentType',
    'funnel_stage': 'funnelStage',
    'funnelstage': 'funnelStage',
    'token_date': 'tokenDate',
    'expected_delivery_date': 'expectedDeliveryDate',
    'actual_delivery_date': 'actualDeliveryDate',
    'amount_collected': 'amountCollected',
    'amount_pending': 'amountPending',
    'total_expected_amount': 'totalExpectedAmount',
    'payment_percentage': 'paymentPercentage',
    'ready to deliver?': 'readyToDeliver',
    'ready_to_deliver': 'readyToDeliver',
    'expected od completion date': 'expectedOdCompletionDate',
    'expected_od_completion_date': 'expectedOdCompletionDate',
    'edd date (reviewer)': 'eddReviewerDate',
    'edd_reviewer_date': 'eddReviewerDate',
    'remarks - everyone (tl/rm/fs/hh)': 'reviewerRemarks',
    'remarks': 'reviewerRemarks',
    'reviewer_remarks': 'reviewerRemarks',
    'make': 'make',
    'model': 'model',
    'variant': 'variant',
    'task_bucket': 'taskBucket',
    'taskbucket': 'taskBucket',
    'reason & data pointer': 'reasonPointer',
    'reason_pointer': 'reasonPointer',

    // Cancellation mappings
    'cancel_req_date': 'cancelReqDate',
    'cancelreqdate': 'cancelReqDate',
    'cancellation_date': 'cancellationDate',
    'cancellationdate': 'cancellationDate',
    'auto_cancelled_flag': 'autoCancelledFlag',
    'autocancelledflag': 'autoCancelledFlag',
    'token_auto_cancellation_extended_date': 'tokenAutoCancellationExtendedDate',
    'tokenautocancellationextendeddate': 'tokenAutoCancellationExtendedDate',
    'reason': 'cancelReason',
    'cancelreason': 'cancelReason',
    'cancel_reason': 'cancelReason',

    // Sheet Status mappings
    'sheetloginpartner': 'sheetLoginPartner',
    'sheet_login_partner': 'sheetLoginPartner',
    'sheetfinalstatus': 'sheetFinalStatus',
    'sheet_final_status': 'sheetFinalStatus',
    'sheetyardname': 'sheetYardName',
    'sheet_yard_name': 'sheetYardName',
    'sheetyardcity': 'sheetYardCity',
    'sheet_yard_city': 'sheetYardCity',
    'sheetdetailedremarks': 'sheetDetailedRemarks',
    'sheet_detailed_remarks': 'sheetDetailedRemarks',
    'sheetlastdisbursalactivity': 'sheetLastDisbursalActivity',
    'sheet_last_disbursal_activity': 'sheetLastDisbursalActivity',
    'sheetlogintimestamp': 'sheetLoginTimestamp',
    'sheet_login_timestamp': 'sheetLoginTimestamp',
    // Form Status mappings
    'formriskbucket': 'formRiskBucket',
    'form_risk_bucket': 'formRiskBucket',
    'formfinalstatus': 'formFinalStatus',
    'form_final_status': 'formFinalStatus',
    'formcasestage': 'formCaseStage',
    'form_case_stage': 'formCaseStage',
    'formfinalremarks': 'formFinalRemarks',
    'form_final_remarks': 'formFinalRemarks',
    'formdeviationrequired': 'formDeviationRequired',
    'form_deviation_required': 'formDeviationRequired',
    'formdetailedask': 'formDetailedAsk',
    'form_detailed_ask': 'formDetailedAsk',
    // Gmail pendency status
    'gmail_summary': 'gmailSummary',
    'gmailsummary': 'gmailSummary',
    'gmail_pendency_status': 'gmailPendencyStatus',
    'gmailpendencystatus': 'gmailPendencyStatus',
    'gmail_pendency_reason': 'gmailPendencyReason',
    'gmailpendencyreason': 'gmailPendencyReason',
    'gmail_next_action': 'gmailNextAction',
    'gmailnextaction': 'gmailNextAction',
    'gmail_pendency_source': 'gmailPendencySource',
    'gmailpendencysource': 'gmailPendencySource',
    'gmail_pendency_date': 'gmailPendencyDate',
    'gmailpendencydate': 'gmailPendencyDate',
    'confidence_score': 'confidenceScore',
    'confidencescore': 'confidenceScore',
    'ml_estimated_delivery_date': 'mlEstimatedDeliveryDate',
    'mlestimateddeliverydate': 'mlEstimatedDeliveryDate',
    'latest_remark': 'latestRemark',
    'latestremark': 'latestRemark',
    'latest_remark_by': 'latestRemarkBy',
    'latestremarkby': 'latestRemarkBy',
    'latest_remark_date': 'latestRemarkDate',
    'latestremarkdate': 'latestRemarkDate',

    // Underwriting / Credit Risk / Safety Flags
    'rc_case_type': 'rcCaseType',
    'rccasetype': 'rcCaseType',
    'income_source': 'incomeSource',
    'incomesource': 'incomeSource',
    'ogl_pincode_flag': 'oglPincodeFlag',
    'oglpincodeflag': 'oglPincodeFlag',
    'ogl_pincode_check': 'oglPincodeFlag',
    'credit_ltv': 'creditLtv',
    'creditltv': 'creditLtv',
    'ltv': 'creditLtv',
    'last_risk_bucket': 'lastRiskBucket',
    'lastriskbucket': 'lastRiskBucket',
    'ds_roi': 'dsRoi',
    'dsroi': 'dsRoi',
    'final_roi': 'finalRoi',
    'finalroi': 'finalRoi',
    'credit_rejection_reason': 'creditRejectionReason',
    'creditrejectionreason': 'creditRejectionReason',
    'credit_rejection_sub_reason': 'creditRejectionSubReason',
    'creditrejectionsubreason': 'creditRejectionSubReason',
    'diligence_rejection_reason': 'diligenceRejectionReason',
    'diligencerejectionreason': 'diligenceRejectionReason',
    'diligence_rejection_sub_reason': 'diligenceRejectionSubReason',
    'diligencerejectionsubreason': 'diligenceRejectionSubReason',
    'red_channel_reason': 'redChannelReason',
    'redchannelreason': 'redChannelReason',
    'soft_derog_flag': 'softDerogFlag',
    'softderogflag': 'softDerogFlag',
    'hard_derog_flag': 'hardDerogFlag',
    'hardderogflag': 'hardDerogFlag',
    'non_ogl': 'nonOgl',
    'nonogl': 'nonOgl',
    'contact_number': 'contactNumber',
    'contactnumber': 'contactNumber',
    'red_channel_flag': 'redChannelFlag',
    'redchannelflag': 'redChannelFlag',
    'tof_rejected_flag': 'tofRejectedFlag',
    'tofrejectedflag': 'tofRejectedFlag',
    'deviation_mitigation_comment': 'deviationMitigationComment',
    'deviationmitigationcomment': 'deviationMitigationComment',
    'bajaj_segment': 'bajajSegment',
    'bajajsegment': 'bajajSegment',
    'company_name': 'companyName',
    'companyname': 'companyName',
    'lead_ds_channel': 'leadDsChannel',
    'leaddschannel': 'leadDsChannel',
    'foir': 'foir',
    'total_listing_days': 'totalListingDays',
    'totallistingdays': 'totalListingDays',

    // Milestones / Journey timestamps
    'latest_lead_creation_timestamp': 'latestLeadCreationTimestamp',
    'latestleadcreationtimestamp': 'latestLeadCreationTimestamp',
    'latest_login_time': 'latestLoginTime',
    'latestlogintime': 'latestLoginTime',
    'latest_credit_assessed_timestamp': 'latestCreditAssessedTimestamp',
    'latestcreditassessedtimestamp': 'latestCreditAssessedTimestamp',
    'latest_diligence_assessed_timestamp': 'latestDiligenceAssessedTimestamp',
    'latestdiligenceassessedtimestamp': 'latestDiligenceAssessedTimestamp',
    'latest_fcu_assessed_timestamp': 'latestFcuAssessedTimestamp',
    'latestfcuassessedtimestamp': 'latestFcuAssessedTimestamp',
    'tnc_generated_date': 'tncGeneratedDate',
    'tncgenerateddate': 'tncGeneratedDate',
    'tnc_accepted_timestamp': 'tncAcceptedTimestamp',
    'tncacceptedtimestamp': 'tncAcceptedTimestamp',
    'fcu_sent_date': 'fcuSentDate',
    'fcusentdate': 'fcuSentDate',
    'sent_to_rcu_timestamp': 'sentToRcuTimestamp',
    'senttorcutimestamp': 'sentToRcuTimestamp',
    'sent_to_ops_timestamp': 'sentToOpsTimestamp',
    'senttoopstimestamp': 'sentToOpsTimestamp',
    'submit_to_ops_timestamp': 'submitToOpsTimestamp',
    'submittoopstimestamp': 'submitToOpsTimestamp',
    'ops_disbursal_timestamp': 'opsDisbursalTimestamp',
    'opsdisbursaltimestamp': 'opsDisbursalTimestamp',
    'finance_disbursed_timestamp': 'financeDisbursedTimestamp',
    'financedisbursedtimestamp': 'financeDisbursedTimestamp',

    // Calling / CRM Outbound Metrics
    'last_call_at': 'lastCallAt',
    'lastcallat': 'lastCallAt',
    'followup_at': 'followupAt',
    'followupat': 'followupAt',
    'total_call_attempts': 'totalCallAttempts',
    'totalcallattempts': 'totalCallAttempts',
    'agg_total_call_attempts': 'totalCallAttempts',
    'aggtotalcallattempts': 'totalCallAttempts',
    'total_connected_calls': 'totalConnectedCalls',
    'totalconnectedcalls': 'totalConnectedCalls',
    'agg_total_connected_calls': 'totalConnectedCalls',
    'aggtotalconnectedcalls': 'totalConnectedCalls',
    'last_call_connected_sp': 'lastCallConnectedSp',
    'lastcallconnectedsp': 'lastCallConnectedSp',
    'dialed_operator_sp': 'lastCallConnectedSp',
    'dialed_operator': 'lastCallConnectedSp',
    'call_duration': 'callDuration',
    'callduration': 'callDuration',
    'agg_call_duration': 'callDuration',
    'aggcallduration': 'callDuration',
    'latest_call_outcome': 'latestCallOutcome',
    'latestcalloutcome': 'latestCallOutcome',
    'agg_latest_call_outcome': 'latestCallOutcome',
    'agglatestcalloutcome': 'latestCallOutcome',
    'last_disposition': 'lastDisposition',
    'lastdisposition': 'lastDisposition',
    'agg_last_disposition': 'lastDisposition',
    'agglastdisposition': 'lastDisposition'
  };

  const result: CaseRow[] = [];

  for (let i = 1; i < parsed.length; i++) {
    const line = parsed[i];
    if (line.every(cell => !cell.trim())) continue; // Skip blank lines

    // Create standard empty row object
    const rowObj: Record<string, any> = {
      _rowNumber: i + 1,
      bookingId: "B-INFO-" + (1000 + i),
      uid: "UID-CSV-" + i,
      leadId: "",
      userId: "",
      loanId: "",
      appointmentId: "",
      carRegNo: "",
      hubCode: "",
      hubName: "Hub " + i,
      city: "Delhi-NCR",
      allocatedRm: "System RM",
      assignedDc: "",
      caAssignedLms: "",
      sm: "",
      tm: "",
      rm: "",
      dealStatus: "ACTIVE",
      dealStatusUpdatedAt: "",
      cancellationDate: "",
      autoCancelledFlag: "false",
      tokenAutoCancellationExtendedDate: "",
      leadStage: "ACTIVE_TOKEN",
      leadStatus: "ACTIVE_TOKEN",
      tokenType: "PAID_TOKEN",
      tokenTypeWithNrt: "",
      paymentType: "CASH",
      funnelStage: "TOKEN_PAID",
      tokenDate: "",
      tokenDateTime: "",
      bookingDate: "",
      expectedDeliveryDate: "",
      expectedDeliveryTime: "",
      actualDeliveryDate: "",
      lastPaymentDate: "",
      latestRemarkDate: "",
      updatedAt: "",
      cancelReqDate: "",
      deliveryStatus: "",
      deliverySegment: "",
      onDemandStatus: "",
      amountCollected: 0,
      amountPending: 0,
      totalExpectedAmount: 0,
      agreedSalesPrice: 0,
      paymentPercentage: 0,
      readyToDeliver: "",
      expectedOdCompletionDate: "",
      eddReviewerDate: "",
      reviewerRemarks: "",
      make: "",
      model: "",
      variant: "",
      manufacturingYear: "",
      rcCaseType: "FRESH",
      incomeSource: "",
      oglPincodeFlag: "",
      creditLtv: "",
      lastRiskBucket: "",
      dsRoi: "",
      finalRoi: "",
      creditRejectionReason: "",
      creditRejectionSubReason: "",
      diligenceRejectionReason: "",
      diligenceRejectionSubReason: "",
      redChannelReason: "",
      softDerogFlag: "false",
      hardDerogFlag: "false",
      nonOgl: "false",
      contactNumber: "",
      redChannelFlag: "N",
      tofRejectedFlag: "N",
      deviationMitigationComment: "",
      bajajSegment: "",
      companyName: "",
      leadDsChannel: "",
      foir: "",
      latestLeadCreationTimestamp: "",
      latestLoginTime: "",
      latestCreditAssessedTimestamp: "",
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
      lastCallAt: "",
      followupAt: "",
      totalCallAttempts: 0,
      totalConnectedCalls: 0,
      lastCallConnectedSp: "",
      callDuration: "",
      latestCallOutcome: "",
      lastDisposition: "",
      latestRemark: "",
      latestRemarkBy: "",
      isActive: "true",
      isAlertVisible: "true",
      cancelReason: "",
      taskBucket: "",
      reasonPointer: "",
      sheetLoginPartner: "",
      sheetFinalStatus: "",
      sheetYardName: "",
      sheetYardCity: "",
      sheetDetailedRemarks: "",
      sheetLastDisbursalActivity: "",
      sheetLoginTimestamp: "",
      formRiskBucket: "",
      formFinalStatus: "",
      formCaseStage: "",
      formFinalRemarks: "",
      formDeviationRequired: "No",
      formDetailedAsk: "",
      gmailSummary: "",
      gmailPendencyStatus: "",
      gmailPendencyReason: "",
      gmailNextAction: "",
      gmailPendencySource: "",
      gmailPendencyDate: "",
      confidenceScore: "",
      mlEstimatedDeliveryDate: "",
      totalListingDays: 0
    };

    // Map values dynamically
    line.forEach((cell, cellIndex) => {
      const headerName = rawHeaders[cellIndex];
      if (!headerName) return;

      const key = mappingTable[headerName] || mappingTable[headerName.replace(/[\s_]/g, '')];
      if (key) {
        const rawVal = normalizeStr(cell.trim());
        if (key === 'amountCollected' || key === 'amountPending' || key === 'totalExpectedAmount' || key === 'paymentPercentage' || key === 'totalCallAttempts' || key === 'totalConnectedCalls' || key === 'totalListingDays') {
          rowObj[key] = parseFloat(rawVal.replace(/[^0-9.-]/g, '')) || 0;
        } else {
          rowObj[key] = rawVal;
        }
      }
    });

    if (rowObj.actualDeliveryDate && rowObj.actualDeliveryDate.trim() !== '' && String(rowObj.dealStatus).toUpperCase() === 'CANCEL') {
      rowObj.leadStage = 'RETURNED';
    }

    result.push(rowObj as CaseRow);
  }

  return result;
}

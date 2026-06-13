/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * background sync script: pulls Google Sheets data anonymously, 
 * parses it, and updates the Supabase DB cache.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env variables must be set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Robust client-side CSV parser
function parseCsvRaw(text) {
  const lines = [];
  let row = [''];
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

function normalizeStr(val) {
  return val
    .replace(/^[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+/g, '')
    .replace(/[\s\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]+$/g, '')
    .replace(/[\u00A0\u200B\uFEFF\u2000-\u200F\u2028\u2029]/g, ' ')
    .replace(/  +/g, ' ');
}

// Column header mappings matching csvParser.ts
const mappingTable = {
  'booking_id': 'bookingId', 'bookingid': 'bookingId', 'booking': 'bookingId',
  'uid': 'uid', 'lead_id': 'leadId', 'leadid': 'leadId', 'user_id': 'userId', 'userid': 'userId',
  'loan_id': 'loanId', 'loanid': 'loanId', 'appointmentid': 'appointmentId', 'appointment_id': 'appointmentId',
  'car_reg_no': 'carRegNo', 'carregno': 'carRegNo', 'hub_code': 'hubCode', 'hubname': 'hubName', 'hub_name': 'hubName',
  'city': 'city', 'allocated_rm': 'allocatedRm', 'allocatedrm': 'allocatedRm', 'assigned_rm': 'allocatedRm', 'assignedrm': 'allocatedRm',
  'assigned_dc': 'assignedDc', 'assigneddc': 'assignedDc', 'lead_stage': 'leadStage', 'leadstage': 'leadStage',
  'deal_status': 'dealStatus', 'dealstatus': 'dealStatus', 'token_type': 'tokenType', 'tokentype': 'tokenType',
  'payment_type': 'paymentType', 'paymenttype': 'paymentType', 'funnel_stage': 'funnelStage', 'funnelstage': 'funnelStage',
  'token_date': 'tokenDate', 'expected_delivery_date': 'expectedDeliveryDate', 'actual_delivery_date': 'actualDeliveryDate',
  'amount_collected': 'amountCollected', 'amount_pending': 'amountPending', 'total_expected_amount': 'totalExpectedAmount',
  'payment_percentage': 'paymentPercentage', 'ready to deliver?': 'readyToDeliver', 'ready_to_deliver': 'readyToDeliver',
  'expected od completion date': 'expectedOdCompletionDate', 'expected_od_completion_date': 'expectedOdCompletionDate',
  'edd date (reviewer)': 'eddReviewerDate', 'edd_reviewer_date': 'eddReviewerDate',
  'remarks - everyone (tl/rm/fs/hh)': 'reviewerRemarks', 'remarks': 'reviewerRemarks', 'reviewer_remarks': 'reviewerRemarks',
  'make': 'make', 'model': 'model', 'variant': 'variant', 'task_bucket': 'taskBucket', 'taskbucket': 'taskBucket',
  'reason & data pointer': 'reasonPointer', 'reason_pointer': 'reasonPointer',
  'cancel_req_date': 'cancelReqDate', 'cancelreqdate': 'cancelReqDate', 'cancellation_date': 'cancellationDate',
  'cancellationdate': 'cancellationDate', 'auto_cancelled_flag': 'autoCancelledFlag', 'autocancelledflag': 'autoCancelledFlag',
  'token_auto_cancellation_extended_date': 'tokenAutoCancellationExtendedDate', 'tokenautocancellationextendeddate': 'tokenAutoCancellationExtendedDate',
  'reason': 'cancelReason', 'cancelreason': 'cancelReason', 'cancel_reason': 'cancelReason',
  'sheetloginpartner': 'sheetLoginPartner', 'sheet_login_partner': 'sheetLoginPartner', 'sheetfinalstatus': 'sheetFinalStatus',
  'sheet_final_status': 'sheetFinalStatus', 'sheetyardname': 'sheetYardName', 'sheet_yard_name': 'sheetYardName',
  'sheetyardcity': 'sheetYardCity', 'sheet_yard_city': 'sheetYardCity', 'sheetdetailedremarks': 'sheetDetailedRemarks',
  'sheet_detailed_remarks': 'sheetDetailedRemarks', 'sheetlastdisbursalactivity': 'sheetLastDisbursalActivity',
  'sheet_last_disbursal_activity': 'sheetLastDisbursalActivity', 'sheetlogintimestamp': 'sheetLoginTimestamp',
  'sheet_login_timestamp': 'sheetLoginTimestamp',
  'formriskbucket': 'formRiskBucket', 'form_risk_bucket': 'formRiskBucket', 'formfinalstatus': 'formFinalStatus',
  'form_final_status': 'formFinalStatus', 'formcasestage': 'formCaseStage', 'form_case_stage': 'formCaseStage',
  'formfinalremarks': 'formFinalRemarks', 'form_final_remarks': 'formFinalRemarks', 'formdeviationrequired': 'formDeviationRequired',
  'form_deviation_required': 'formDeviationRequired', 'formdetailedask': 'formDetailedAsk', 'form_detailed_ask': 'formDetailedAsk',
  'gmail_summary': 'gmailSummary', 'gmailsummary': 'gmailSummary', 'gmail_pendency_status': 'gmailPendencyStatus',
  'gmailpendencystatus': 'gmailPendencyStatus', 'gmail_pendency_reason': 'gmailPendencyReason', 'gmailpendencyreason': 'gmailPendencyReason',
  'gmail_next_action': 'gmailNextAction', 'gmailnextaction': 'gmailNextAction', 'gmail_pendency_source': 'gmailPendencySource',
  'gmailpendencysource': 'gmailPendencySource', 'gmail_pendency_date': 'gmailPendencyDate', 'gmailpendencydate': 'gmailPendencyDate',
  'confidence_score': 'confidenceScore', 'confidencescore': 'confidenceScore', 'ml_estimated_delivery_date': 'mlEstimatedDeliveryDate',
  'mlestimateddeliverydate': 'mlEstimatedDeliveryDate', 'latest_remark': 'latestRemark', 'latestremark': 'latestRemark',
  'latest_remark_by': 'latestRemarkBy', 'latestremarkby': 'latestRemarkBy', 'latest_remark_date': 'latestRemarkDate',
  'latestremarkdate': 'latestRemarkDate',
  'rc_case_type': 'rcCaseType', 'rccasetype': 'rcCaseType', 'income_source': 'incomeSource', 'incomesource': 'incomeSource',
  'ogl_pincode_flag': 'oglPincodeFlag', 'oglpincodeflag': 'oglPincodeFlag', 'ogl_pincode_check': 'oglPincodeFlag',
  'credit_ltv': 'creditLtv', 'creditltv': 'creditLtv', 'ltv': 'creditLtv', 'last_risk_bucket': 'lastRiskBucket',
  'lastriskbucket': 'lastRiskBucket', 'ds_roi': 'dsRoi', 'dsroi': 'dsRoi', 'final_roi': 'finalRoi', 'finalroi': 'finalRoi',
  'credit_rejection_reason': 'creditRejectionReason', 'creditrejectionreason': 'creditRejectionReason',
  'credit_rejection_sub_reason': 'creditRejectionSubReason', 'creditrejectionsubreason': 'creditRejectionSubReason',
  'diligence_rejection_reason': 'diligenceRejectionReason', 'diligencerejectionreason': 'diligenceRejectionReason',
  'diligence_rejection_sub_reason': 'diligenceRejectionSubReason', 'diligencerejectionsubreason': 'diligenceRejectionSubReason',
  'red_channel_reason': 'redChannelReason', 'redchannelreason': 'redChannelReason', 'soft_derog_flag': 'softDerogFlag',
  'softderogflag': 'softDerogFlag', 'hard_derog_flag': 'hardDerogFlag', 'hardderogflag': 'hardDerogFlag',
  'non_ogl': 'nonOgl', 'nonogl': 'nonOgl', 'contact_number': 'contactNumber', 'contactnumber': 'contactNumber',
  'red_channel_flag': 'redChannelFlag', 'redchannelflag': 'redChannelFlag', 'tof_rejected_flag': 'tofRejectedFlag',
  'tofrejectedflag': 'tofRejectedFlag', 'deviation_mitigation_comment': 'deviationMitigationComment',
  'deviationmitigationcomment': 'deviationMitigationComment', 'bajaj_segment': 'bajajSegment', 'bajajsegment': 'bajajSegment',
  'company_name': 'companyName', 'companyname': 'companyName', 'lead_ds_channel': 'leadDsChannel', 'leaddschannel': 'leadDsChannel',
  'foir': 'foir', 'total_listing_days': 'totalListingDays', 'totallistingdays': 'totalListingDays',
  'latest_lead_creation_timestamp': 'latestLeadCreationTimestamp', 'latestleadcreationtimestamp': 'latestLeadCreationTimestamp',
  'latest_login_time': 'latestLoginTime', 'latestlogintime': 'latestLoginTime',
  'latest_credit_assessed_timestamp': 'latestCreditAssessedTimestamp', 'latestcreditassessedtimestamp': 'latestCreditAssessedTimestamp',
  'latest_diligence_assessed_timestamp': 'latestDiligenceAssessedTimestamp', 'latestdiligenceassessedtimestamp': 'latestDiligenceAssessedTimestamp',
  'latest_fcu_assessed_timestamp': 'latestFcuAssessedTimestamp', 'latestfcuassessedtimestamp': 'latestFcuAssessedTimestamp',
  'tnc_generated_date': 'tncGeneratedDate', 'tncgenerateddate': 'tncGeneratedDate',
  'tnc_accepted_timestamp': 'tncAcceptedTimestamp', 'tncacceptedtimestamp': 'tncAcceptedTimestamp',
  'fcu_sent_date': 'fcuSentDate', 'fcusentdate': 'fcuSentDate', 'sent_to_rcu_timestamp': 'sentToRcuTimestamp',
  'senttorcutimestamp': 'sentToRcuTimestamp', 'sent_to_ops_timestamp': 'sentToOpsTimestamp', 'senttoopstimestamp': 'sentToOpsTimestamp',
  'submit_to_ops_timestamp': 'submitToOpsTimestamp', 'submittoopstimestamp': 'submitToOpsTimestamp',
  'ops_disbursal_timestamp': 'opsDisbursalTimestamp', 'opsdisbursaltimestamp': 'opsDisbursalTimestamp',
  'finance_disbursed_timestamp': 'financeDisbursedTimestamp', 'financedisbursedtimestamp': 'financeDisbursedTimestamp',
  'last_call_at': 'lastCallAt', 'lastcallat': 'lastCallAt', 'followup_at': 'followupAt', 'followupat': 'followupAt',
  'total_call_attempts': 'totalCallAttempts', 'totalcallattempts': 'totalCallAttempts',
  'agg_total_call_attempts': 'totalCallAttempts', 'aggtotalcallattempts': 'totalCallAttempts',
  'total_connected_calls': 'totalConnectedCalls', 'totalconnectedcalls': 'totalConnectedCalls',
  'agg_total_connected_calls': 'totalConnectedCalls', 'aggtotalconnectedcalls': 'totalConnectedCalls',
  'last_call_connected_sp': 'lastCallConnectedSp', 'lastcallconnectedsp': 'lastCallConnectedSp',
  'dialed_operator_sp': 'lastCallConnectedSp', 'dialed_operator': 'lastCallConnectedSp',
  'call_duration': 'callDuration', 'callduration': 'callDuration', 'agg_call_duration': 'callDuration', 'aggcallduration': 'callDuration',
  'latest_call_outcome': 'latestCallOutcome', 'latestcalloutcome': 'latestCallOutcome',
  'agg_latest_call_outcome': 'latestCallOutcome', 'agglatestcalloutcome': 'latestCallOutcome',
  'last_disposition': 'lastDisposition', 'lastdisposition': 'lastDisposition',
  'agg_last_disposition': 'lastDisposition', 'agglastdisposition': 'lastDisposition'
};

async function runSync() {
  console.log('--- STARTING BACKGROUND SHEET SYNC ---');

  // 1. Fetch configured sheet config from Supabase
  const { data: config, error: configErr } = await supabase
    .from('shared_config')
    .select('*')
    .eq('id', 'shared')
    .maybeSingle();

  if (configErr) {
    console.error('Failed to load shared config from database:', configErr.message);
    process.exit(1);
  }

  if (!config || !config.sheet_id) {
    console.error('No configuration found in shared_config table.');
    process.exit(1);
  }

  const sheetId = config.sheet_id;
  const sheetName = config.sheet_name || 'Sheet1';
  console.log(`Configured Google Sheet ID: ${sheetId}, Tab: ${sheetName}`);

  // 2. Query public CSV GViz url
  const targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  console.log(`Querying Sheets endpoint...`);
  
  const response = await fetch(targetUrl);
  if (!response.ok) {
    console.error(`Sheets API fetch failed. Status: ${response.status}`);
    process.exit(1);
  }

  const csvText = await response.text();
  const parsed = parseCsvRaw(csvText);
  if (parsed.length < 2) {
    console.error('GViz returned empty sheet or missing headers.');
    process.exit(1);
  }

  const rawHeaders = parsed[0].map(h => 
    h.trim()
     .toLowerCase()
     .replace(/[\r\n\t]+/g, ' ')
     .replace(/\s+/g, ' ')
  );

  const mappedRows = [];
  for (let i = 1; i < parsed.length; i++) {
    const line = parsed[i];
    if (line.every(cell => !cell.trim())) continue;

    const rowObj = {
      _rowNumber: i + 1,
      bookingId: 'B-INFO-' + (1000 + i),
      dealStatus: 'ACTIVE',
      leadStage: 'ACTIVE_TOKEN',
      amountCollected: 0,
      amountPending: 0,
      totalExpectedAmount: 0,
      paymentPercentage: 0,
      totalCallAttempts: 0,
      totalConnectedCalls: 0,
      totalListingDays: 0
    };

    line.forEach((cell, cellIndex) => {
      const headerName = rawHeaders[cellIndex];
      if (!headerName) return;

      const key = mappingTable[headerName] || mappingTable[headerName.replace(/[\s_]/g, '')];
      if (key) {
        const rawVal = normalizeStr(cell.trim());
        if (['amountCollected', 'amountPending', 'totalExpectedAmount', 'paymentPercentage', 'totalCallAttempts', 'totalConnectedCalls', 'totalListingDays'].includes(key)) {
          rowObj[key] = parseFloat(rawVal.replace(/[^0-9.-]/g, '')) || 0;
        } else {
          rowObj[key] = rawVal;
        }
      }
    });

    // Mark as returned rules
    if (rowObj.actualDeliveryDate && rowObj.actualDeliveryDate.trim() !== '' && String(rowObj.dealStatus).toUpperCase() === 'CANCEL') {
      rowObj.leadStage = 'RETURNED';
    }

    mappedRows.push(rowObj);
  }

  console.log(`Parsed ${mappedRows.length} rows. De-duplicating by bookingId...`);

  // Deduplicate case-insensitively
  const uniqueRowsMap = new Map();
  mappedRows.forEach(row => {
    if (row.bookingId) {
      const cleanId = String(row.bookingId).trim().toLowerCase();
      if (cleanId) {
        uniqueRowsMap.set(cleanId, row);
      }
    }
  });
  const uniqueRows = Array.from(uniqueRowsMap.values());
  console.log(`De-duplicated to ${uniqueRows.length} unique cases.`);

  // 3. Upsert to Supabase
  const payload = uniqueRows.map(row => ({
    booking_id: String(row.bookingId).trim(),
    row_data: row,
    updated_at: new Date().toISOString()
  }));

  console.log(`Upserting payloads to Supabase dashboard_cases table...`);
  const chunkSize = 200;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error: upsertErr } = await supabase
      .from('dashboard_cases')
      .upsert(chunk, { onConflict: 'booking_id' });

    if (upsertErr) {
      console.error(`Failed to upsert chunk starting at index ${i}:`, upsertErr.message);
      process.exit(1);
    }
  }

  console.log('--- BACKGROUND SYNC COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

runSync().catch(err => {
  console.error('Unexpected error in sync script:', err);
  process.exit(1);
});

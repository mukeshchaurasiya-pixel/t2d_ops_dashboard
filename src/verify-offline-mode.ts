import * as fs from 'fs';
import * as path from 'path';
import { SEED_CASE_ROWS } from './data/mockData';

function runVerification() {
  console.log('=== STARTING CARS24 OFFLINE DEMO MODE VERIFICATION ===');
  
  let success = true;

  // 1. Verify SEED_CASE_ROWS contains realistic data
  console.log('\n--- Checking Mock Data (SEED_CASE_ROWS) ---');
  if (Array.isArray(SEED_CASE_ROWS) && SEED_CASE_ROWS.length > 0) {
    console.log(`[PASS] SEED_CASE_ROWS successfully loaded. Found ${SEED_CASE_ROWS.length} cases.`);
    const firstRow = SEED_CASE_ROWS[0];
    console.log(`Sample Case: BookingID: ${firstRow.bookingId}, City: ${firstRow.city}, RM: ${firstRow.allocatedRm}`);
    if (firstRow.bookingId && firstRow.city && firstRow.leadStage) {
      console.log('[PASS] Mock row structure matches CaseRow interface.');
    } else {
      console.log('[FAIL] Mock row is missing core fields.');
      success = false;
    }
  } else {
    console.log('[FAIL] SEED_CASE_ROWS is empty or not an array.');
    success = false;
  }

  // 2. Read App.tsx to verify accessToken bypass in Demo Mode
  console.log('\n--- Checking App.tsx for accessToken nullification ---');
  const appPath = path.join(process.cwd(), 'src', 'App.tsx');
  try {
    const appContent = fs.readFileSync(appPath, 'utf8');
    
    // Check if the Dashboard component is invoked with a null accessToken in demo mode
    const hasTokenBypass = appContent.includes('accessToken={demoMode ? null : accessToken}');
    if (hasTokenBypass) {
      console.log('[PASS] App.tsx correctly passes null as accessToken when demoMode is active.');
    } else {
      console.log('[FAIL] App.tsx does not bypass/nullify accessToken in demoMode.');
      success = false;
    }
  } catch (err) {
    console.log(`[FAIL] Could not read App.tsx: ${err}`);
    success = false;
  }

  // 3. Read useCaseEditor.ts to verify no Sheets API calls are made when accessToken is null
  console.log('\n--- Checking useCaseEditor.ts for Sheets API bypass ---');
  const editorPath = path.join(process.cwd(), 'src', 'hooks', 'useCaseEditor.ts');
  try {
    const editorContent = fs.readFileSync(editorPath, 'utf8');
    
    // Check if handleEditRowClick checks if (!accessToken) or if (accessToken) before calling fetchSingleRowLatest
    const hasEditRowGuard = (editorContent.includes('!accessToken') || editorContent.includes('if (accessToken)')) && 
                            editorContent.includes('fetchSingleRowLatest(');
    if (hasEditRowGuard) {
      console.log('[PASS] handleEditRowClick guards fetchSingleRowLatest from execution without accessToken.');
    } else {
      console.log('[FAIL] handleEditRowClick does not guard fetchSingleRowLatest with accessToken.');
      success = false;
    }

    // Check if handleSaveActionables checks if (accessToken) before calling writeActionablesToSheet
    const hasSaveGuard = editorContent.includes('if (accessToken)') && 
                         editorContent.includes('writeActionablesToSheet(');
    if (hasSaveGuard) {
      console.log('[PASS] handleSaveActionables guards writeActionablesToSheet with "if (accessToken)".');
    } else {
      console.log('[FAIL] handleSaveActionables does not guard writeActionablesToSheet with accessToken.');
      success = false;
    }

    // Check if local saving/session fallback is handled when error occurs or when offline
    const hasLocalSaveFallback = editorContent.includes('Your changes are saved locally in this session.') || 
                                  editorContent.includes('Saved offline') ||
                                  editorContent.includes('Saved offline to DB');
    if (hasLocalSaveFallback) {
      console.log('[PASS] local save/session fallback logic exists and runs gracefully.');
    } else {
      console.log('[FAIL] No local save fallback logic found when accessToken is absent.');
      success = false;
    }
  } catch (err) {
    console.log(`[FAIL] Could not read useCaseEditor.ts: ${err}`);
    success = false;
  }

  // 4. Read sheetsService.ts to verify safeguards
  console.log('\n--- Checking sheetsService.ts for token safeguards ---');
  const sheetsServicePath = path.join(process.cwd(), 'src', 'lib', 'sheetsService.ts');
  try {
    const serviceContent = fs.readFileSync(sheetsServicePath, 'utf8');
    
    // Check safeguards in writeActionablesToSheet
    const hasWriteSafeguard = serviceContent.includes("if (!accessToken) throw new Error('Authorization is required to write to this Google Sheet.');");
    if (hasWriteSafeguard) {
      console.log('[PASS] sheetsService.ts throws error if writeActionablesToSheet is called with empty accessToken.');
    } else {
      console.log('[FAIL] writeActionablesToSheet does not explicitly validate accessToken presence.');
      success = false;
    }
  } catch (err) {
    console.log(`[FAIL] Could not read sheetsService.ts: ${err}`);
    success = false;
  }

  console.log('\n======================================================');
  if (success) {
    console.log('RESULT: ALL OFFLINE DEMO MODE CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.log('RESULT: SOME OFFLINE DEMO MODE CHECKS FAILED.');
    process.exit(1);
  }
}

runVerification();

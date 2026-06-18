/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Empirical verification script for Google OAuth credential exchange, 
 * popup behavior, resource cleanup, and auto-sync triggers.
 */

import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("=== STARTING OAUTH FLOW VERIFICATION ===");

// 1. Mock Browser Environment in Node.js
const mockLocalStorage: Record<string, string> = {};
const listeners: Record<string, Function[]> = {};

const mockWindow = {
  location: {
    origin: 'http://localhost:3000',
  },
  screen: {
    width: 1920,
    height: 1080,
  },
  opener: null as any,
  close: () => {},
  postMessage: (message: any, targetOrigin: string) => {},
  addEventListener: (event: string, callback: Function) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  },
  removeEventListener: (event: string, callback: Function) => {
    if (listeners[event]) {
      listeners[event] = listeners[event].filter(cb => cb !== callback);
    }
  },
  open: null as any,
};

globalThis.window = mockWindow as any;
globalThis.localStorage = {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); },
} as any;

// 2. Mock Supabase Client
const mockSupabaseAuth = {
  session: null as any,
  authStateChangeCallbacks: [] as Function[],
  
  getSession: async () => ({
    data: { session: mockSupabaseAuth.session },
    error: null,
  }),
  
  onAuthStateChange: (callback: Function) => {
    mockSupabaseAuth.authStateChangeCallbacks.push(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            mockSupabaseAuth.authStateChangeCallbacks = 
              mockSupabaseAuth.authStateChangeCallbacks.filter(cb => cb !== callback);
          }
        }
      }
    };
  },
  
  signInWithOAuth: async (options: any) => {
    mockSupabaseAuth.lastOAuthOptions = options;
    return {
      data: { url: 'https://supabase.co/auth/v1/authorize?provider=google' },
      error: null,
    };
  },
  
  setSession: async (sessionInfo: any) => {
    mockSupabaseAuth.session = {
      access_token: sessionInfo.access_token,
      refresh_token: sessionInfo.refresh_token,
      provider_token: 'google-provider-token-mocked',
      user: {
        id: 'test-user-id',
        email: 'test@cars24.com',
        user_metadata: {
          full_name: 'OAuth Test User',
        }
      }
    };
    return { data: { session: mockSupabaseAuth.session }, error: null };
  },
  
  signOut: async () => {
    mockSupabaseAuth.session = null;
    return { error: null };
  },
  
  lastOAuthOptions: null as any,
};

const mockSupabase = {
  auth: mockSupabaseAuth,
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  }),
};

// 3. Define the virtual module mapping
const mockModules: Record<string, any> = {
  './supabaseClient': { supabase: mockSupabase },
  '../supabaseClient': { supabase: mockSupabase },
  './lib/supabaseClient': { supabase: mockSupabase },
  './App.tsx': { default: () => null },
  './index.css': {},
};

// 4. Transpile the source code so we can run it with our mocks
// We will transpile firebaseAuth.ts and execute it in a sandbox.
const firebaseAuthPath = path.join(__dirname, 'lib', 'firebaseAuth.ts');
let code = fs.readFileSync(firebaseAuthPath, 'utf8');

const result = esbuild.transformSync(code, {
  loader: 'ts',
  format: 'cjs',
  target: 'node18',
});

// Run eval with mocked imports
const runFirebaseAuthInSandbox = () => {
  const customRequire = (moduleName: string) => {
    if (mockModules[moduleName]) {
      return mockModules[moduleName];
    }
    return require(moduleName);
  };
  
  const exports: any = {};
  const module = { exports };
  
  const fn = new Function('require', 'exports', 'module', 'process', 'global', result.code);
  fn(customRequire, exports, module, process, global);
  return module.exports;
};

const firebaseAuth = runFirebaseAuthInSandbox();

// 5. RUN TESTS
async function runTests() {
  let passed = true;

  // TEST 1: googleSignIn OAuth Parameters
  console.log('\n--- Test 1: googleSignIn OAuth Parameters ---');
  let popupOpenedParams = '';
  let mockPopup = {
    closed: false,
    close: () => { mockPopup.closed = true; }
  };
  
  mockWindow.open = (url: string, name: string, specs: string) => {
    popupOpenedParams = specs;
    return mockPopup as any;
  };

  const signInPromise = firebaseAuth.googleSignIn();
  // Wait for the async step inside googleSignIn to execute up to window.open
  await new Promise(r => setTimeout(r, 0));
  
  const oAuthOpts = mockSupabaseAuth.lastOAuthOptions;
  console.log('OAuth provider:', oAuthOpts.provider);
  console.log('skipBrowserRedirect:', oAuthOpts.options?.skipBrowserRedirect);
  console.log('scopes:', oAuthOpts.options?.scopes);
  console.log('access_type:', oAuthOpts.options?.queryParams?.access_type);
  console.log('prompt:', oAuthOpts.options?.queryParams?.prompt);
  console.log('Popup specs:', popupOpenedParams);

  if (
    oAuthOpts.provider === 'google' &&
    oAuthOpts.options?.skipBrowserRedirect === true &&
    oAuthOpts.options?.scopes === 'https://www.googleapis.com/auth/spreadsheets' &&
    oAuthOpts.options?.queryParams?.access_type === 'offline' &&
    oAuthOpts.options?.queryParams?.prompt === 'consent' &&
    popupOpenedParams.includes('width=600') &&
    popupOpenedParams.includes('height=700')
  ) {
    console.log('[PASS] OAuth initialization parameters are correct.');
  } else {
    console.error('[FAIL] OAuth initialization parameters incorrect.');
    passed = false;
  }

  // TEST 2: Successful authentication completion via postMessage
  console.log('\n--- Test 2: Successful Auth Completion ---');
  // At this point, googleSignIn is waiting on the message listener.
  // We simulate receiving the AUTH_COMPLETE postMessage.
  const messageCallback = listeners['message']?.[0];
  if (!messageCallback) {
    console.error('[FAIL] Message event listener not registered on window.');
    passed = false;
  } else {
    console.log('Message listener successfully registered.');
    
    // Trigger AUTH_COMPLETE with a dummy session
    const mockSession = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      provider_token: 'google-sheets-provider-token',
    };
    
    await messageCallback({
      data: {
        type: 'AUTH_COMPLETE',
        session: mockSession,
      }
    });

    try {
      const result = await signInPromise;
      console.log('Resolved user email:', result?.user?.email);
      console.log('Resolved accessToken:', result?.accessToken);
      
      const cachedToken = globalThis.localStorage.getItem('cars24_google_provider_token');
      console.log('Cached token in localStorage:', cachedToken);
      
      if (
        result?.user?.email === 'test@cars24.com' &&
        result?.accessToken === 'google-provider-token-mocked' &&
        cachedToken === 'google-sheets-provider-token'
      ) {
        console.log('[PASS] Sign in successfully resolved, credentials updated and cached.');
      } else {
        console.error('[FAIL] Sign in resolved with unexpected data.');
        passed = false;
      }
    } catch (err) {
      console.error('[FAIL] signInPromise rejected:', err);
      passed = false;
    }
  }

  // TEST 3: Cleanup of event listener and interval after successful auth
  console.log('\n--- Test 3: Resource Cleanup (Success Path) ---');
  const messageListenersAfter = listeners['message'] || [];
  console.log('Number of message listeners remaining after auth complete:', messageListenersAfter.length);
  
  if (messageListenersAfter.length === 0) {
    console.log('[PASS] Event listeners cleaned up.');
  } else {
    console.error('[FAIL] Event listeners were not cleaned up.');
    passed = false;
  }

  // TEST 4: User closes the popup manually (Rejection & Cleanup)
  console.log('\n--- Test 4: Popup Closed Manually Fallback ---');
  mockSupabaseAuth.session = null; // Clear session
  mockPopup.closed = false; // Reset mock popup status
  
  const manualSignInPromise = firebaseAuth.googleSignIn();
  // Wait for the async step inside googleSignIn to execute up to window.open
  await new Promise(r => setTimeout(r, 0));
  
  // Verify listener was registered
  console.log('Active message listeners:', listeners['message']?.length);
  
  // Simulate closing popup by setting closed to true. 
  // The checkInterval in googleSignIn runs every 1000ms. We'll run it manually or simulate the interval.
  mockPopup.closed = true;
  
  try {
    await manualSignInPromise;
    console.error('[FAIL] googleSignIn resolved even though the popup was closed manually without credentials.');
    passed = false;
  } catch (err: any) {
    console.log('Promise rejected as expected with error:', err.message);
    if (err.message === 'Login window closed by user.') {
      console.log('[PASS] Correctly rejected with user close error.');
    } else {
      console.error('[FAIL] Rejected with incorrect error message.');
      passed = false;
    }
  }

  // Verify listener was cleaned up on close
  console.log('Message listeners remaining after manual close:', listeners['message']?.length || 0);
  if ((listeners['message']?.length || 0) === 0) {
    console.log('[PASS] Event listener successfully cleaned up after manual close.');
  } else {
    console.error('[FAIL] Event listener leaked after manual close.');
    passed = false;
  }

  // TEST 5: Popup script behavior in main.tsx
  console.log('\n--- Test 5: Popup Page Auth Receiver ---');
  // We mock window.opener and window.close
  let postMessageArgs: any[] = [];
  let isWindowClosed: boolean = false;
  
  const originalOpener = mockWindow.opener;
  const originalClose = mockWindow.close;
  const originalPostMessage = mockWindow.postMessage;
  
  mockWindow.opener = {
    postMessage: (msg: any, origin: string) => {
      postMessageArgs.push({ msg, origin });
    }
  };
  mockWindow.close = () => {
    isWindowClosed = true;
  };
  
  // Setup mock session for supabase auth
  mockSupabaseAuth.session = { access_token: 'popup-token' };
  
  // Transpile and run the receiver logic in src/main.tsx
  // We'll extract only the receiver block to test it.
  const mainPath = path.join(__dirname, 'main.tsx');
  const mainContent = fs.readFileSync(mainPath, 'utf8');
  
  // Let's parse/execute the popup handler block using our mock modules.
  // We execute it in an environment where window.opener is truthy.
  const mainTranspiled = esbuild.transformSync(mainContent, {
    loader: 'tsx',
    format: 'cjs',
    target: 'node18',
  });
  
  // Run main.tsx block
  const runMainPopupBlock = () => {
    const customRequire = (moduleName: string) => {
      if (mockModules[moduleName]) return mockModules[moduleName];
      return require(moduleName);
    };
    
    // We override import() behavior inside main.tsx dynamically
    const mockImport = async (modulePath: string) => {
      if (mockModules[modulePath]) return mockModules[modulePath];
      throw new Error("unsupported mock import: " + modulePath);
    };
    
    const modifiedCode = mainTranspiled.code.replace(/import\(/g, 'mockImport(');
    
    const fn = new Function('require', 'mockImport', 'process', 'global', 'window', modifiedCode);
    fn(customRequire, mockImport, process, global, mockWindow);
  };
  
  runMainPopupBlock();
  
  // Wait a tick for the promise to resolve
  await new Promise(r => setTimeout(r, 100));
  
  console.log('PostMessage called count:', postMessageArgs.length);
  if (postMessageArgs.length > 0) {
    console.log('PostMessage arguments:', postMessageArgs[0]);
  }
  console.log('Window closed:', isWindowClosed);
  
  if (
    postMessageArgs.length === 1 &&
    postMessageArgs[0].msg.type === 'AUTH_COMPLETE' &&
    postMessageArgs[0].msg.session.access_token === 'popup-token' &&
    isWindowClosed
  ) {
    console.log('[PASS] Popup receiver successfully notified opener and closed itself.');
  } else {
    console.error('[FAIL] Popup receiver failed to notify opener or close itself.');
    passed = false;
  }
  
  // Cleanup test mock variables
  mockWindow.opener = originalOpener;
  mockWindow.close = originalClose;

  // TEST 6: Auto-Sync triggers in App.tsx
  console.log('\n--- Test 6: Auto-Sync Triggers on Auth ---');
  // We will inspect App.tsx source code to verify the presence of the automatic synchronization logic.
  const appPath = path.join(__dirname, 'App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');
  
  const hasAutoSyncEffect = appCode.includes('useEffect(() =>') && 
                            appCode.includes('syncPendingChangesToSheets') && 
                            appCode.includes('syncCasesFromSheets') &&
                            appCode.includes('[accessToken, sheetId, sheetName, user?.email');
                            
  console.log('Auto-sync useEffect detected:', hasAutoSyncEffect);
  if (hasAutoSyncEffect) {
    console.log('[PASS] App.tsx contains automatic synchronization useEffect triggered by post-auth credentials.');
  } else {
    console.error('[FAIL] App.tsx is missing the automatic synchronization useEffect.');
    passed = false;
  }

  // Summary
  console.log('\n=======================================');
  if (passed) {
    console.log('RESULT: ALL OAUTH & POPUP FLOW TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('RESULT: OAUTH & POPUP FLOW TESTS FAILED!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

console.log("=== STARTING APP LOGIC VERIFICATION ===");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read App.tsx
const appPath = path.join(__dirname, 'App.tsx');
let appCode = fs.readFileSync(appPath, 'utf8');

// Transpile App.tsx using esbuild to CommonJS so we can run and mock it
const transpiled = esbuild.transformSync(appCode, {
  loader: 'tsx',
  format: 'cjs',
  target: 'node18',
  jsx: 'automatic'
});

// Setup mock scope
const mockState: any = {
  rows: null,
  user: null,
  accessToken: null,
  restoreLoading: false,
  demoMode: false,
  loginError: null,
  sheetId: '1ARJ8AzOwNxqdTZA7bd7zPAacabIoBImXqReqzSTrIy4',
  sheetName: 'Sheet1',
  showConfigPanel: false,
  tempSheetId: '1ARJ8AzOwNxqdTZA7bd7zPAacabIoBImXqReqzSTrIy4',
  tempSheetName: 'Sheet1',
};

// Simple React mock
let currentHookIndex = 0;
const hooks: any[] = [];
let rerenderCallback: (() => void) | null = null;

const ReactMock = {
  useState(initialValue: any) {
    const idx = currentHookIndex++;
    if (hooks[idx] === undefined) {
      let val = typeof initialValue === 'function' ? initialValue() : initialValue;
      hooks[idx] = val;
    }
    const setter = (newVal: any) => {
      if (typeof newVal === 'function') {
        hooks[idx] = newVal(hooks[idx]);
      } else {
        hooks[idx] = newVal;
      }
      if (rerenderCallback) rerenderCallback();
    };
    return [hooks[idx], setter];
  },
  useMemo(factory: () => any, deps: any[]) {
    const idx = currentHookIndex++;
    const prev = hooks[idx];
    if (!prev || !depsEqual(prev.deps, deps)) {
      const val = factory();
      hooks[idx] = { val, deps };
      return val;
    }
    return prev.val;
  },
  useEffect(effect: () => any, deps: any[]) {
    const idx = currentHookIndex++;
    const prev = hooks[idx];
    if (!prev || !depsEqual(prev.deps, deps)) {
      hooks[idx] = { effect, deps, cleanup: null };
      console.log(`[useEffect mock] Scheduling effect for hook index ${idx}`);
      // Schedule running of effect
      process.nextTick(() => {
        console.log(`[useEffect mock] Executing effect for hook index ${idx}`);
        if (hooks[idx].cleanup) hooks[idx].cleanup();
        hooks[idx].cleanup = effect();
        console.log(`[useEffect mock] Finished executing effect for hook index ${idx}`);
      });
    }
  }
};

function depsEqual(a: any[] | undefined, b: any[]) {
  if (!a) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Mock other imports
const mockImports: Record<string, any> = {
  'react': ReactMock,
  'motion/react': {
    motion: {
      div: ({ children, className, ...props }: any) => ({ type: 'motion.div', className, children }),
    }
  },
  'lucide-react': {
    Building: () => 'BuildingIcon',
    RefreshCcw: () => 'RefreshCcwIcon',
    LogOut: () => 'LogOutIcon',
    AlertCircle: () => 'AlertCircleIcon',
    FileSpreadsheet: () => 'FileSpreadsheetIcon',
    Lock: () => 'LockIcon',
    HelpCircle: () => 'HelpCircleIcon',
    Settings: () => 'SettingsIcon',
    Database: () => 'DatabaseIcon',
    Save: () => 'SaveIcon',
    ExternalLink: () => 'ExternalLinkIcon',
  },
  './components/Dashboard': function MockDashboard(props: any) {
    return { type: 'Dashboard', props };
  },
  './components/LoginPage': function MockLoginPage(props: any) {
    return { type: 'LoginPage', props };
  },
  './data/mockData': {
    SEED_CASE_ROWS: [{ bookingId: 'MOCK-1', taskBucket: '' }],
  },
  './lib/firebaseAuth': {
    initAuth: (onUser: any, onUnauth: any) => {
      console.log("[mock firebaseAuth] initAuth called!");
      mockImports['./lib/firebaseAuth']._triggerUser = (u: any, t: any) => {
        console.log("[mock firebaseAuth] _triggerUser triggered with", u?.email);
        onUser(u, t);
      };
      return () => {
        console.log("[mock firebaseAuth] unsubscribe called");
      };
    },
    logout: async () => {
      console.log("[mock firebaseAuth] logout called!");
      if (mockImports['./lib/firebaseAuth']._triggerUser) {
        mockImports['./lib/firebaseAuth']._triggerUser(null, null);
      }
    },
    googleSignIn: async () => {
      console.log("[mock firebaseAuth] googleSignIn called!");
      return { user: { email: 'test@cars24.com', displayName: 'Test User' }, accessToken: 'valid-token' };
    },
    getSharedConfig: async () => {
      console.log("[mock firebaseAuth] getSharedConfig called!");
      return null;
    },
    saveSharedConfig: async () => {
      console.log("[mock firebaseAuth] saveSharedConfig called!");
    }
  },
  './lib/sheetsService': {
    getCleanSpreadsheetId: (id: string) => id,
    fetchSheetDataDirect: async (id: string, name: string, token: string, email: string) => {
      console.log("[mock sheetsService] fetchSheetDataDirect called with token", token);
      if (token === 'error-token') {
        throw new Error('Google Sheets API returned Forbidden (403). Make sure your logged-in Google Account has permission.');
      }
      return [{ bookingId: 'LIVE-1', taskBucket: '' }];
    }
  }
};

// Create eval function with mock environment
const evalInMockEnv = (code: string) => {
  const customRequire = (moduleName: string) => {
    if (mockImports[moduleName]) {
      return mockImports[moduleName];
    }
    // Handle relative imports by resolving them to mockImports keys
    const resolvedName = moduleName.startsWith('../') 
      ? './' + moduleName.substring(3) 
      : moduleName;
    if (mockImports[resolvedName]) {
      return mockImports[resolvedName];
    }
    // Fallback for standard node modules
    return require(moduleName);
  };

  const exports: any = {};
  const module = { exports };
  
  // Custom mock dynamic import function
  const mockImport = async (modulePath: string) => {
    console.log(`[mockImport] importing ${modulePath}`);
    const resolvedPath = modulePath.startsWith('../') 
      ? './' + modulePath.substring(3) 
      : modulePath;
    if (mockImports[resolvedPath]) {
      return mockImports[resolvedPath];
    }
    throw new Error(`Mock import for ${modulePath} not registered`);
  };

  // Compile code replacing standard dynamic imports with mockImport
  const modifiedCode = code.replace(/import\(/g, 'mockImport(');

  const fn = new Function('require', 'exports', 'module', 'mockImport', 'process', 'global', 'localStorage', modifiedCode);
  
  const localStorageMock = {
    getItem: (key: string) => null,
    setItem: (key: string, val: string) => {},
  };

  fn(customRequire, exports, module, mockImport, process, global, localStorageMock);
  return module.exports;
};

// Run evaluations
const { default: App } = evalInMockEnv(transpiled.code);

const runRenderCycle = () => {
  currentHookIndex = 0;
  return App();
};

// Test 1: Initial Render
let output = runRenderCycle();
console.log("Test 1: Initial Render (Expect LoginPage):");
console.log("Rendered type:", output?.type);
const isLoginPage = output?.type === 'LoginPage' || (typeof output?.type === 'function' && output?.type.name === 'MockLoginPage');
if (!isLoginPage) {
  console.error("FAIL: Expected LoginPage component, got", output?.type);
  process.exit(1);
} else {
  console.log("PASS");
}

// Capture setters from LoginPage props
const loginPageProps = output.props;

// Test 2: Trigger Demo Mode
console.log("Test 2: Triggering Demo Mode:");
loginPageProps.onDemoMode();

// Re-render
output = runRenderCycle();
console.log("Rendered type after Demo Mode:", output?.type);
const isDashboard = output?.type === 'div' || output?.type === 'Dashboard';
if (!isDashboard) {
  console.error("FAIL: Still showing LoginPage after onDemoMode()");
  process.exit(1);
} else {
  console.log("PASS: Switched to Dashboard/Main layout.");
}

// Reset state by resetting hooks
hooks.length = 0;

// Test 3: Log in successfully
console.log("Test 3: Sign In with successful data fetch:");
output = runRenderCycle(); // Initial login screen
const loginPageProps2 = output.props;

console.log("[Test 3] Calling onSignIn...");
const signInPromise = loginPageProps2.onSignIn();
console.log("[Test 3] onSignIn called, returning promise. Adding .then callback...");

signInPromise.then(() => {
  console.log("[Test 3] .then callback executed. Checking if _triggerUser is function:", typeof mockImports['./lib/firebaseAuth']._triggerUser);
  // Trigger auth listener callback with successful user
  mockImports['./lib/firebaseAuth']._triggerUser({ email: 'test@cars24.com', displayName: 'Test User' }, 'valid-token');
  
  // Wait for async task and then check render
  process.nextTick(() => {
    output = runRenderCycle();
    console.log("Rendered type after successful login:", output?.type);
    console.log("Rows in Dashboard props:", output?.props?.rows);
    if (output?.props?.rows?.[0]?.bookingId === 'LIVE-1') {
      console.log("PASS: Loaded live rows!");
    } else {
      console.error("FAIL: Dashboard rows not populated with live rows.");
      process.exit(1);
    }
    
    // Test 4: Log in but Sheets API throws a 403 Forbidden error
    console.log("Test 4: Sign In but Sheets API throws 403 Forbidden:");
    hooks.length = 0; // Reset hooks
    output = runRenderCycle(); // LoginPage
    const loginPageProps3 = output.props;
    
    loginPageProps3.onSignIn().then(() => {
      // Trigger auth listener with error-token (which causes 403 error in fetchSheetDataDirect mock)
      mockImports['./lib/firebaseAuth']._triggerUser({ email: 'restricted@cars24.com', displayName: 'Restricted User' }, 'error-token');
      
      // Wait for fetch to fail and re-render
      setTimeout(() => {
        output = runRenderCycle();
        console.log("Rendered type after 403 Sheets Error:", output?.type);
        
        // Wait, did it render the Restricted Access view?
        // Let's inspect the returned element
        const isRestrictedAccess = output?.type === 'motion.div' || output?.children?.[0]?.type === 'motion.div';
        const hasLockIcon = JSON.stringify(output).includes('LockIcon');
        const hasRestrictedMsg = JSON.stringify(output).includes('Access Restricted');
        const rowsLength = output?.props?.rows?.length ?? 0;
        
        console.log("Rows length in state:", rowsLength);
        console.log("Has Restricted Access Message:", hasRestrictedMsg);
        console.log("Has Lock Icon:", hasLockIcon);
        
        if (hasRestrictedMsg && rowsLength === 0) {
          console.log("PASS: Correctly rendered Restricted Access page and loaded 0 rows.");
        } else {
          console.error("FAIL: Did not show Restricted Access screen or rows.length !== 0.", output);
          process.exit(1);
        }

        // Test 5: Verify the choices presented on the Restricted Access screen
        console.log("Test 5: Choices on Restricted Access Screen:");
        const stringified = JSON.stringify(output);
        const hasExploreDemoButton = stringified.includes("Explore with Seed Offline Dataset");
        const hasSignOutButton = stringified.includes("Sign Out / Switch Account");
        
        console.log("Has Explore Demo Option:", hasExploreDemoButton);
        console.log("Has Sign Out Option:", hasSignOutButton);
        
        if (hasExploreDemoButton && hasSignOutButton) {
          console.log("PASS: Both choices are present.");
        } else {
          console.error("FAIL: Missing choice options.");
          process.exit(1);
        }
        
        console.log("=== ALL TESTS PASSED SUCCESSFULLY ===");
        process.exit(0);
      }, 50);
    });
  });
}).catch((err) => {
  console.error("[Test 3] Promise failed:", err);
});

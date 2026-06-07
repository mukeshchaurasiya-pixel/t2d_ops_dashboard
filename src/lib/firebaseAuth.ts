/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */

const provider = new GoogleAuthProvider();
// Request Sheets full read-write scope
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory or restore from session storage if possible.
let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = sessionStorage.getItem('google_sheets_accessToken');
} catch (err) {
  // Gracefully fallback if blocked by storage restrictions in sandboxed environment/incognito
  console.warn('SessionStorage is blocked or unavailable:', err);
}

// Interface for global workspace config synced in Firestore
export interface SharedConfig {
  userId: string;
  sheetId: string;
  sheetName: string;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Reads the globally shared configuration from Firestore
 */
export const getSharedConfig = async (): Promise<SharedConfig | null> => {
  try {
    const docRef = doc(db, 'userConfigs', 'shared');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as SharedConfig;
    }
    return null;
  } catch (error) {
    console.warn('Could not read shared config from Firestore:', error);
    return null;
  }
};

/**
 * Writes the shared configuration to Firestore
 */
export const saveSharedConfig = async (sheetId: string, sheetName: string, updatedByEmail?: string): Promise<void> => {
  try {
    const docRef = doc(db, 'userConfigs', 'shared');
    await setDoc(docRef, {
      userId: 'shared',
      sheetId,
      sheetName,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedByEmail || 'unknown'
    });
  } catch (error) {
    console.error('Failed to write shared config to Firestore:', error);
    throw error;
  }
};

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      try {
        sessionStorage.removeItem('google_sheets_accessToken');
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    try {
      sessionStorage.setItem('google_sheets_accessToken', cachedAccessToken);
    } catch (e) {}
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem('google_sheets_accessToken');
  } catch (e) {}
};

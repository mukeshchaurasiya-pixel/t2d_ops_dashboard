/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth & shared config layer — powered by Supabase.
 * Drop-in replacement for the previous Firebase implementation.
 * Exposes the same public interface so App.tsx requires minimal changes.
 */

import { supabase } from './supabaseClient';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

// ─── Re-export a User shape compatible with the rest of the app ───────────────
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// ─── Shared spreadsheet config stored in Supabase ────────────────────────────
export interface SharedConfig {
  userId: string;
  sheetId: string;
  sheetName: string;
  updatedAt: string;
  updatedBy?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
const TOKEN_CACHE_KEY = 'cars24_google_provider_token';

function cacheProviderToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_CACHE_KEY, token);
  }
}

function getProviderToken(session: Session): string | null {
  // provider_token is available immediately after OAuth but may be null
  // on session restore (PKCE limitation). Fall back to localStorage cache.
  return session.provider_token ?? localStorage.getItem(TOKEN_CACHE_KEY);
}

function sessionToAppUser(session: Session): AppUser {
  const u = session.user;
  return {
    uid: u.id,
    email: u.email ?? null,
    displayName: u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
    photoURL: u.user_metadata?.avatar_url ?? null,
  };
}

// ─── Auth state listener ──────────────────────────────────────────────────────
/**
 * Subscribe to Supabase auth state changes.
 * Calls onAuthSuccess with an AppUser + provider_token on sign-in,
 * and onAuthFailure on sign-out.
 * Returns an unsubscribe function.
 */
export function initAuth(
  onAuthSuccess?: (user: AppUser, token: string | null) => void,
  onAuthFailure?: () => void
): () => void {
  // Check current session immediately
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      const token = getProviderToken(session);
      cacheProviderToken(token);
      if (onAuthSuccess) onAuthSuccess(sessionToAppUser(session), token);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });

  // Subscribe to future changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      if (session) {
        const token = getProviderToken(session);
        cacheProviderToken(token); // persist for session restores
        if (onAuthSuccess) onAuthSuccess(sessionToAppUser(session), token);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    }
  );

  return () => {
    subscription.unsubscribe();
  };
}

// ─── Google Sign-In via Supabase OAuth ───────────────────────────────────────
/**
 * Trigger Google OAuth popup (opens sign-in in a new tab/window).
 * Once completed, the popup notifies the opener and closes itself.
 * Returns the user + access token from the session.
 */
export async function googleSignIn(): Promise<{ user: AppUser; accessToken: string } | null> {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: 'https://www.googleapis.com/auth/spreadsheets',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Supabase Google sign-in error:', error);
    throw new Error(error.message);
  }

  if (!data?.url) {
    throw new Error("Failed to retrieve OAuth authorization URL");
  }

  // Open popup
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;
  const popup = window.open(
    data.url,
    'cars24_google_signin_popup',
    `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
  );

  if (!popup) {
    throw new Error("Popup blocked. Please allow popups for this site.");
  }

  return new Promise((resolve, reject) => {
    let checkInterval: any = null;

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'AUTH_COMPLETE') {
        cleanup();
        const receivedSession = event.data.session;
        if (receivedSession) {
          try {
            cacheProviderToken(receivedSession.provider_token);
            await supabase.auth.setSession({
              access_token: receivedSession.access_token,
              refresh_token: receivedSession.refresh_token
            });
          } catch (setSessionErr) {
            console.warn("Failed to set session in opener via setSession:", setSessionErr);
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          resolve({
            user: sessionToAppUser(session),
            accessToken: getProviderToken(session) ?? '',
          });
        } else {
          reject(new Error("Session not found after auth complete."));
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (checkInterval) clearInterval(checkInterval);
    };

    window.addEventListener('message', handleMessage);

    checkInterval = setInterval(async () => {
      if (popup.closed) {
        cleanup();
        
        // Fallback: Check if session was successfully established in localStorage anyway
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          resolve({
            user: sessionToAppUser(session),
            accessToken: getProviderToken(session) ?? '',
          });
        } else {
          reject(new Error("Login window closed by user."));
        }
      }
    }, 1000);
  });
}

// ─── Get access token from current session ────────────────────────────────────
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

// ─── Sign out ─────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  localStorage.removeItem(TOKEN_CACHE_KEY);
  await supabase.auth.signOut();
}

// ─── Shared spreadsheet config (Supabase table: shared_config) ───────────────
/**
 * Reads the globally shared configuration from the Supabase shared_config table.
 */
export async function getSharedConfig(): Promise<SharedConfig | null> {
  try {
    const { data, error } = await supabase
      .from('shared_config')
      .select('*')
      .eq('id', 'shared')
      .maybeSingle();

    if (error) {
      console.warn('Could not read shared config from Supabase:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      userId: 'shared',
      sheetId: data.sheet_id,
      sheetName: data.sheet_name,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by ?? undefined,
    };
  } catch (err) {
    console.warn('Unexpected error reading shared config:', err);
    return null;
  }
}

/**
 * Writes the shared configuration to the Supabase shared_config table.
 */
export async function saveSharedConfig(
  sheetId: string,
  sheetName: string,
  updatedByEmail?: string
): Promise<void> {
  const { error } = await supabase
    .from('shared_config')
    .upsert(
      {
        id: 'shared',
        sheet_id: sheetId,
        sheet_name: sheetName,
        updated_at: new Date().toISOString(),
        updated_by: updatedByEmail ?? 'unknown',
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('Failed to write shared config to Supabase:', error.message);
    throw new Error(error.message);
  }
}

// ─── Legacy Firebase exports kept for compatibility ───────────────────────────
// These are no-ops or aliases so any remaining imports don't break.
export const auth = null;
export const db = null;

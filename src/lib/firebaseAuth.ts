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
      const token = session.provider_token ?? null;
      if (onAuthSuccess) onAuthSuccess(sessionToAppUser(session), token);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });

  // Subscribe to future changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      if (session) {
        const token = session.provider_token ?? null;
        if (onAuthSuccess) onAuthSuccess(sessionToAppUser(session), token);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    }
  );

  return () => subscription.unsubscribe();
}

// ─── Google Sign-In via Supabase OAuth ───────────────────────────────────────
/**
 * Trigger Google OAuth popup (redirects to Supabase OAuth flow).
 * Supabase will redirect back to the app; the auth state listener picks it up.
 * Returns the user + access token from the current session after redirect.
 */
export async function googleSignIn(): Promise<{ user: AppUser; accessToken: string } | null> {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
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

  // The page will redirect; we return null here.
  // After redirect, initAuth picks up the new session automatically.
  return null;
}

// ─── Get access token from current session ────────────────────────────────────
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token ?? null;
}

// ─── Sign out ─────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
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

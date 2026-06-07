/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Supabase client initialization.
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file
 * or as Vercel Environment Variables.
 *
 * IMPORTANT: flowType is set to 'implicit' so that provider_token
 * (the Google OAuth access token needed for Sheets API calls) is stored
 * in the session and survives page refreshes. PKCE flow (the default)
 * does NOT persist provider_token across reloads.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables missing (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). ' +
    'Authentication will not work until these are set.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      flowType: 'implicit',          // persists provider_token in session storage
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
    },
  }
);

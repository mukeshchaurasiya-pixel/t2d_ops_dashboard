-- SQL Schema Script for CARS24 Dashboard
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
--
-- Notes:
-- - dashboard_cases remains publicly readable so the current cached/demo flow
--   continues to work without forcing login on every read.
-- - write paths are intended for authenticated users or the Supabase service role.
-- - admin-only audit/session reads are currently keyed to the same admin emails
--   used in the SPA; move this to a dedicated roles table when convenient.

CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) IN (
    'mukesh.chaurasiya@cars24.com',
    'chourasiyamukesh008@gmail.com'
  );
$$;

-- 1. Create the dashboard_cases cache table
CREATE TABLE IF NOT EXISTS public.dashboard_cases (
    booking_id TEXT NOT NULL PRIMARY KEY,
    row_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- 2. Create an index on updated_at for faster sorting on reads
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_updated_at ON public.dashboard_cases (updated_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.dashboard_cases ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow public read" ON public.dashboard_cases;
DROP POLICY IF EXISTS "Allow public write" ON public.dashboard_cases;

-- 5. Create RLS Policies
-- Allow anyone (even unauthenticated users) to view dashboard cases
CREATE POLICY "Allow public read" 
ON public.dashboard_cases 
FOR SELECT 
USING (true);

-- Only authenticated users should mutate the shared cache from the browser.
CREATE POLICY "Allow authenticated write" 
ON public.dashboard_cases 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- 6. Create shared spreadsheet configuration table
CREATE TABLE IF NOT EXISTS public.shared_config (
    id TEXT NOT NULL PRIMARY KEY,
    sheet_id TEXT NOT NULL,
    sheet_name TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    updated_by TEXT
);

ALTER TABLE public.shared_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read shared config" ON public.shared_config;
DROP POLICY IF EXISTS "Allow public write shared config" ON public.shared_config;
DROP POLICY IF EXISTS "Allow authenticated read shared config" ON public.shared_config;
DROP POLICY IF EXISTS "Allow authenticated write shared config" ON public.shared_config;

CREATE POLICY "Allow authenticated read shared config"
ON public.shared_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated write shared config"
ON public.shared_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Create the audit_logs table for tracking history
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    column_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT
);

-- Index for fast history lookup by Booking ID
CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_id ON public.audit_logs (booking_id);

-- Enable RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow public write audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow admin read audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated write audit" ON public.audit_logs;

CREATE POLICY "Allow admin read audit" 
ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin_email());

CREATE POLICY "Allow authenticated write audit" 
ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (
  lower(coalesce(auth.jwt() ->> 'email', '')) <> ''
);

-- 8. Create the user_sessions table for tracking activity duration
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    login_time TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    last_active_time TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    duration_minutes INTEGER DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_email ON public.user_sessions (user_email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_login ON public.user_sessions (login_time DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow public write sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow admin read sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow authenticated insert sessions" ON public.user_sessions;
DROP POLICY IF EXISTS "Allow authenticated update own sessions" ON public.user_sessions;

CREATE POLICY "Allow admin read sessions" 
ON public.user_sessions FOR SELECT TO authenticated USING (public.is_admin_email());

CREATE POLICY "Allow authenticated insert sessions" 
ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (
  lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "Allow authenticated update own sessions" 
ON public.user_sessions FOR UPDATE TO authenticated USING (
  lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
) WITH CHECK (
  lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

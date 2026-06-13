-- SQL Schema Script for CARS24 Dashboard
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

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

-- Allow updates, inserts, and deletes (anyone can write to cache, or you can restrict to authenticated users)
CREATE POLICY "Allow public write" 
ON public.dashboard_cases 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- SQL Schema Script for CARS24 Dashboard
-- Run this script in the Supabase SQL Editor.
--
-- This revision moves the dashboard to:
-- 1. authenticated cache reads
-- 2. structured query columns on dashboard_cases
-- 3. server-side pagination and summaries
-- 4. a browser-fast ACTIVE_TOKEN working set backed by indexed reads

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE OR REPLACE FUNCTION public.dashboard_numeric(input_text TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT := nullif(btrim(coalesce(input_text, '')), '');
BEGIN
  IF cleaned IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN cleaned::numeric;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_dashboard_timestamp(input_text TEXT)
RETURNS TIMESTAMP WITHOUT TIME ZONE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT := nullif(btrim(coalesce(input_text, '')), '');
  parts TEXT[];
  parsed_year INTEGER;
  parsed_month INTEGER;
  parsed_day INTEGER;
  parsed_hour INTEGER := 0;
  parsed_minute INTEGER := 0;
  parsed_second INTEGER := 0;
BEGIN
  IF cleaned IS NULL THEN
    RETURN NULL;
  END IF;

  IF cleaned ~ '^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}(?::\d{1,2})?(?::\d{1,2})?)?$' THEN
    parts := regexp_match(cleaned, '^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}))?(?::(\d{1,2}))?(?::(\d{1,2}))?$');
    parsed_year := parts[1]::INTEGER;
    parsed_month := parts[2]::INTEGER;
    parsed_day := parts[3]::INTEGER;
    parsed_hour := coalesce(nullif(parts[4], ''), '0')::INTEGER;
    parsed_minute := coalesce(nullif(parts[5], ''), '0')::INTEGER;
    parsed_second := coalesce(nullif(parts[6], ''), '0')::INTEGER;
    RETURN make_timestamp(parsed_year, parsed_month, parsed_day, parsed_hour, parsed_minute, parsed_second);
  END IF;

  IF cleaned ~ '^\d{1,2}[-/]\d{1,2}[-/](\d{4}|\d{2})(?:[ T]\d{1,2}(?::\d{1,2})?(?::\d{1,2})?)?$' THEN
    parts := regexp_match(cleaned, '^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?:[ T](\d{1,2}))?(?::(\d{1,2}))?(?::(\d{1,2}))?$');
    parsed_day := parts[1]::INTEGER;
    parsed_month := parts[2]::INTEGER;
    parsed_year := parts[3]::INTEGER;
    IF parsed_year < 100 THEN
      parsed_year := CASE WHEN parsed_year < 50 THEN parsed_year + 2000 ELSE parsed_year + 1900 END;
    END IF;
    parsed_hour := coalesce(nullif(parts[4], ''), '0')::INTEGER;
    parsed_minute := coalesce(nullif(parts[5], ''), '0')::INTEGER;
    parsed_second := coalesce(nullif(parts[6], ''), '0')::INTEGER;
    RETURN make_timestamp(parsed_year, parsed_month, parsed_day, parsed_hour, parsed_minute, parsed_second);
  END IF;

  BEGIN
    RETURN cleaned::timestamp;
  EXCEPTION
    WHEN others THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_ordinal_suffix(day_value INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN day_value > 3 AND day_value < 21 THEN 'th'
    WHEN mod(day_value, 10) = 1 THEN 'st'
    WHEN mod(day_value, 10) = 2 THEN 'nd'
    WHEN mod(day_value, 10) = 3 THEN 'rd'
    ELSE 'th'
  END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_format_human_date(input_date DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT concat(
    extract(day from input_date)::INTEGER,
    public.dashboard_ordinal_suffix(extract(day from input_date)::INTEGER),
    ' ',
    trim(to_char(input_date, 'Month'))
  );
$$;

CREATE OR REPLACE FUNCTION public.dashboard_format_human_range(start_date DATE, end_date DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN start_date IS NULL OR end_date IS NULL THEN ''
    WHEN to_char(start_date, 'Month') = to_char(end_date, 'Month') THEN concat(
      extract(day from start_date)::INTEGER,
      public.dashboard_ordinal_suffix(extract(day from start_date)::INTEGER),
      ' to ',
      extract(day from end_date)::INTEGER,
      public.dashboard_ordinal_suffix(extract(day from end_date)::INTEGER),
      ' ',
      trim(to_char(start_date, 'Month'))
    )
    ELSE concat(
      extract(day from start_date)::INTEGER,
      public.dashboard_ordinal_suffix(extract(day from start_date)::INTEGER),
      ' ',
      trim(to_char(start_date, 'Month')),
      ' to ',
      extract(day from end_date)::INTEGER,
      public.dashboard_ordinal_suffix(extract(day from end_date)::INTEGER),
      ' ',
      trim(to_char(end_date, 'Month'))
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_expected_edd_bucket(
  expected_date DATE,
  ref_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  diff_days INTEGER;
BEGIN
  IF expected_date IS NULL THEN
    RETURN 'Blank / Empty';
  END IF;

  diff_days := expected_date - ref_date;

  IF diff_days < 0 THEN
    RETURN 'Overdue / Breached';
  ELSIF diff_days = 0 THEN
    RETURN public.dashboard_format_human_date(ref_date);
  ELSIF diff_days = 1 THEN
    RETURN public.dashboard_format_human_date(ref_date + 1);
  ELSIF diff_days = 2 THEN
    RETURN public.dashboard_format_human_date(ref_date + 2);
  ELSIF diff_days BETWEEN 3 AND 6 THEN
    RETURN public.dashboard_format_human_range(ref_date + 3, ref_date + 6);
  END IF;

  RETURN public.dashboard_format_human_date(ref_date + 7) || ' +';
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_listing_days_bucket(days_value NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN days_value IS NULL THEN NULL
    WHEN days_value >= 0 AND days_value <= 7 THEN '0-7'
    WHEN days_value > 7 AND days_value <= 15 THEN '7-15'
    WHEN days_value > 15 AND days_value <= 30 THEN '15-30'
    WHEN days_value > 30 AND days_value <= 60 THEN '30-60'
    WHEN days_value > 60 THEN '60+'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_split_tasks(task_bucket TEXT)
RETURNS TABLE(task TEXT)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT normalized_task
  FROM (
    SELECT nullif(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(task_bucket, ''), E'\r\n?', E'\n', 'g'),
            E'\n+',
            ' / ',
            'g'
          ),
          '\s+',
          ' ',
          'g'
        )
      ),
      ''
    ) AS normalized_task
  ) normalized
  WHERE normalized_task IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_token_is_rt(token_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(token_value, '')) LIKE '%RT%'
    OR upper(coalesce(token_value, '')) LIKE '%PAID%'
    OR upper(coalesce(token_value, '')) LIKE '%REFUNDABLE%';
$$;

CREATE OR REPLACE FUNCTION public.dashboard_token_is_nrt(token_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(token_value, '')) LIKE '%NRT%';
$$;

CREATE OR REPLACE FUNCTION public.dashboard_token_is_pvt(token_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(token_value, '')) LIKE '%PVT%'
    OR upper(coalesce(token_value, '')) LIKE '%PRIVATE%';
$$;

CREATE OR REPLACE FUNCTION public.dashboard_token_is_gcbl(token_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(coalesce(token_value, '')) LIKE '%GCBL%'
    OR (upper(coalesce(token_value, '')) LIKE '%GREEN%' AND upper(coalesce(token_value, '')) LIKE '%BL%')
    OR (upper(coalesce(token_value, '')) LIKE '%GC%' AND upper(coalesce(token_value, '')) LIKE '%BL%');
$$;

CREATE TABLE IF NOT EXISTS public.dashboard_cases (
  booking_id TEXT NOT NULL PRIMARY KEY,
  row_data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

ALTER TABLE public.dashboard_cases
  ADD COLUMN IF NOT EXISTS token_date DATE,
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS actual_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS cancel_req_date DATE,
  ADD COLUMN IF NOT EXISTS last_payment_date DATE,
  ADD COLUMN IF NOT EXISTS latest_remark_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS expected_od_completion_date DATE,
  ADD COLUMN IF NOT EXISTS edd_reviewer_date DATE,
  ADD COLUMN IF NOT EXISTS gmail_pendency_date DATE,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS hub_name TEXT,
  ADD COLUMN IF NOT EXISTS allocated_rm TEXT,
  ADD COLUMN IF NOT EXISTS assigned_dc TEXT,
  ADD COLUMN IF NOT EXISTS lead_stage TEXT,
  ADD COLUMN IF NOT EXISTS deal_status TEXT,
  ADD COLUMN IF NOT EXISTS task_bucket TEXT,
  ADD COLUMN IF NOT EXISTS payment_type TEXT,
  ADD COLUMN IF NOT EXISTS token_type TEXT,
  ADD COLUMN IF NOT EXISTS token_type_with_nrt TEXT,
  ADD COLUMN IF NOT EXISTS sheet_final_status TEXT,
  ADD COLUMN IF NOT EXISTS form_final_status TEXT,
  ADD COLUMN IF NOT EXISTS gmail_pendency_status TEXT,
  ADD COLUMN IF NOT EXISTS ready_to_deliver TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS final_payment_type TEXT,
  ADD COLUMN IF NOT EXISTS lead_ds_channel TEXT,
  ADD COLUMN IF NOT EXISTS total_listing_days NUMERIC,
  ADD COLUMN IF NOT EXISTS payment_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS customer_key TEXT;

-- Populate existing rows for customer_key and final_payment_type
UPDATE public.dashboard_cases
SET customer_key = nullif(btrim(coalesce(row_data ->> 'userId', '')), '');

UPDATE public.dashboard_cases
SET final_payment_type = nullif(btrim(coalesce(row_data ->> 'finalPaymentType', '')), '')
WHERE final_payment_type IS NULL;

CREATE OR REPLACE FUNCTION public.dashboard_cases_sync_structured_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := coalesce(NEW.updated_at, timezone('utc', now()));
  NEW.token_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'tokenDate')::DATE;
  NEW.expected_delivery_date := coalesce(
    public.parse_dashboard_timestamp(NEW.row_data ->> 'expectedDeliveryTime')::DATE,
    public.parse_dashboard_timestamp(NEW.row_data ->> 'expectedDeliveryDate')::DATE
  );
  NEW.actual_delivery_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'actualDeliveryDate')::DATE;
  NEW.cancel_req_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'cancelReqDate')::DATE;
  NEW.last_payment_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'lastPaymentDate')::DATE;
  NEW.latest_remark_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'latestRemarkDate');
  NEW.expected_od_completion_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'expectedOdCompletionDate')::DATE;
  NEW.edd_reviewer_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'eddReviewerDate')::DATE;
  NEW.gmail_pendency_date := public.parse_dashboard_timestamp(NEW.row_data ->> 'gmailPendencyDate')::DATE;
  NEW.city := nullif(btrim(coalesce(NEW.row_data ->> 'city', '')), '');
  NEW.hub_name := nullif(btrim(coalesce(NEW.row_data ->> 'hubName', '')), '');
  NEW.allocated_rm := nullif(btrim(coalesce(NEW.row_data ->> 'allocatedRm', '')), '');
  NEW.assigned_dc := nullif(btrim(coalesce(NEW.row_data ->> 'assignedDc', '')), '');
  NEW.lead_stage := nullif(btrim(coalesce(NEW.row_data ->> 'leadStage', '')), '');
  NEW.deal_status := nullif(btrim(coalesce(NEW.row_data ->> 'dealStatus', '')), '');
  NEW.task_bucket := nullif(btrim(coalesce(NEW.row_data ->> 'taskBucket', '')), '');
  NEW.payment_type := nullif(btrim(coalesce(NEW.row_data ->> 'paymentType', '')), '');
  NEW.final_payment_type := nullif(btrim(coalesce(NEW.row_data ->> 'finalPaymentType', '')), '');
  NEW.token_type := nullif(btrim(coalesce(NEW.row_data ->> 'tokenType', '')), '');
  NEW.token_type_with_nrt := nullif(btrim(coalesce(NEW.row_data ->> 'tokenTypeWithNrt', '')), '');
  NEW.sheet_final_status := nullif(btrim(coalesce(NEW.row_data ->> 'sheetFinalStatus', '')), '');
  NEW.form_final_status := nullif(btrim(coalesce(NEW.row_data ->> 'formFinalStatus', '')), '');
  NEW.gmail_pendency_status := nullif(btrim(coalesce(NEW.row_data ->> 'gmailPendencyStatus', '')), '');
  NEW.ready_to_deliver := nullif(btrim(coalesce(NEW.row_data ->> 'readyToDeliver', '')), '');
  NEW.cancel_reason := nullif(btrim(coalesce(NEW.row_data ->> 'cancelReason', '')), '');
  NEW.lead_ds_channel := nullif(btrim(coalesce(NEW.row_data ->> 'leadDsChannel', '')), '');
  NEW.total_listing_days := public.dashboard_numeric(NEW.row_data ->> 'totalListingDays');
  NEW.payment_percentage := public.dashboard_numeric(NEW.row_data ->> 'paymentPercentage');
  NEW.customer_key := nullif(btrim(coalesce(NEW.row_data ->> 'userId', '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dashboard_cases_sync_structured_columns ON public.dashboard_cases;
CREATE TRIGGER trg_dashboard_cases_sync_structured_columns
BEFORE INSERT OR UPDATE ON public.dashboard_cases
FOR EACH ROW
EXECUTE FUNCTION public.dashboard_cases_sync_structured_columns();

UPDATE public.dashboard_cases
SET row_data = row_data
WHERE row_data IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dashboard_cases_updated_at ON public.dashboard_cases (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_booking_id_lower ON public.dashboard_cases ((lower(booking_id)));
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_token_date ON public.dashboard_cases (token_date DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_expected_delivery_date ON public.dashboard_cases (expected_delivery_date);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_actual_delivery_date ON public.dashboard_cases (actual_delivery_date);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_cancel_req_date ON public.dashboard_cases (cancel_req_date);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_lead_stage ON public.dashboard_cases (lead_stage);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_city ON public.dashboard_cases (city);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_hub_name ON public.dashboard_cases (hub_name);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_allocated_rm ON public.dashboard_cases (allocated_rm);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_assigned_dc ON public.dashboard_cases (assigned_dc);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_payment_type ON public.dashboard_cases (payment_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_final_payment_type ON public.dashboard_cases (final_payment_type);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_task_bucket ON public.dashboard_cases (task_bucket);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_total_listing_days ON public.dashboard_cases (total_listing_days);
CREATE INDEX IF NOT EXISTS idx_dashboard_cases_customer_key ON public.dashboard_cases (customer_key);

ALTER TABLE public.dashboard_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read" ON public.dashboard_cases;
DROP POLICY IF EXISTS "Allow public write" ON public.dashboard_cases;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.dashboard_cases;
DROP POLICY IF EXISTS "Allow authenticated write" ON public.dashboard_cases;

CREATE POLICY "Allow authenticated read"
ON public.dashboard_cases
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated write"
ON public.dashboard_cases
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.dashboard_matches_text_filter(selected JSONB, row_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_row TEXT := lower(coalesce(nullif(btrim(row_value), ''), ''));
  candidate TEXT;
BEGIN
  IF selected IS NULL OR jsonb_typeof(selected) <> 'array' OR jsonb_array_length(selected) = 0 THEN
    RETURN true;
  END IF;

  FOR candidate IN
    SELECT jsonb_array_elements_text(selected)
  LOOP
    IF lower(btrim(candidate)) = 'blank' AND normalized_row = '' THEN
      RETURN true;
    END IF;

    IF normalized_row <> '' AND normalized_row = lower(btrim(candidate)) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_matches_task_filter(selected JSONB, task_bucket_value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  candidate TEXT;
  normalized_task_bucket TEXT := coalesce(task_bucket_value, '');
BEGIN
  IF selected IS NULL OR jsonb_typeof(selected) <> 'array' OR jsonb_array_length(selected) = 0 THEN
    RETURN true;
  END IF;

  FOR candidate IN
    SELECT jsonb_array_elements_text(selected)
  LOOP
    IF lower(btrim(candidate)) = 'blank' AND NOT EXISTS (
      SELECT 1 FROM public.dashboard_split_tasks(task_bucket_value)
    ) THEN
      RETURN true;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.dashboard_split_tasks(task_bucket_value) split_task
      WHERE lower(split_task.task) = lower(btrim(candidate))
    ) THEN
      RETURN true;
    END IF;

    IF lower(normalized_task_bucket) = lower(btrim(candidate)) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_confidence_score_value_at(
  target_booking_id TEXT,
  boundary_ts TIMESTAMP WITH TIME ZONE,
  current_score NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prior_value TEXT;
  next_old_value TEXT;
BEGIN
  SELECT al.new_value
  INTO prior_value
  FROM public.audit_logs al
  WHERE al.booking_id = target_booking_id
    AND al.column_name = 'confidenceScore'
    AND al.changed_at <= boundary_ts
  ORDER BY al.changed_at DESC, al.id DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN public.dashboard_numeric(prior_value);
  END IF;

  SELECT al.old_value
  INTO next_old_value
  FROM public.audit_logs al
  WHERE al.booking_id = target_booking_id
    AND al.column_name = 'confidenceScore'
    AND al.changed_at > boundary_ts
  ORDER BY al.changed_at ASC, al.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN public.dashboard_numeric(next_old_value);
  END IF;

  RETURN current_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_confidence_trend(
  c public.dashboard_cases,
  stable_delta NUMERIC DEFAULT 0.02,
  ref_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_score NUMERIC := public.dashboard_numeric(c.row_data ->> 'confidenceScore');
  previous_day_score NUMERIC;
  two_days_ago_score NUMERIC;
  baseline_score NUMERIC;
BEGIN
  IF current_score IS NULL THEN
    RETURN NULL;
  END IF;

  previous_day_score := public.dashboard_confidence_score_value_at(
    c.booking_id,
    ref_date::timestamp - interval '1 millisecond',
    current_score
  );

  two_days_ago_score := public.dashboard_confidence_score_value_at(
    c.booking_id,
    (ref_date - 1)::timestamp - interval '1 millisecond',
    current_score
  );

  IF previous_day_score IS NULL OR two_days_ago_score IS NULL THEN
    RETURN NULL;
  END IF;

  baseline_score := (previous_day_score + two_days_ago_score) / 2.0;

  IF abs(current_score - baseline_score) <= stable_delta THEN
    RETURN 'Stable';
  ELSIF current_score < baseline_score - stable_delta THEN
    RETURN 'Decline';
  ELSIF current_score > baseline_score + stable_delta THEN
    RETURN 'Improving';
  END IF;

  RETURN 'Stable';
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_case_has_milestone(c public.dashboard_cases, milestone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE milestone
    WHEN 'Lead Created' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestLeadCreationTimestamp') IS NOT NULL;
    WHEN 'Case Logged In' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestLoginTime') IS NOT NULL
        OR public.parse_dashboard_timestamp(c.row_data ->> 'sheetLoginTimestamp') IS NOT NULL;
    WHEN 'Credit Assessed' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestCreditAssessedTimestamp') IS NOT NULL;
    WHEN 'Diligence Assessed' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestDiligenceAssessedTimestamp') IS NOT NULL;
    WHEN 'T&C Accepted' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'tncAcceptedTimestamp') IS NOT NULL;
    WHEN 'FCU Checked' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestFcuAssessedTimestamp') IS NOT NULL
        OR public.parse_dashboard_timestamp(c.row_data ->> 'fcuSentDate') IS NOT NULL;
    WHEN 'Submitted To Ops' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'submitToOpsTimestamp') IS NOT NULL
        OR public.parse_dashboard_timestamp(c.row_data ->> 'sentToOpsTimestamp') IS NOT NULL;
    WHEN 'Finance Disbursed' THEN
      RETURN public.parse_dashboard_timestamp(c.row_data ->> 'financeDisbursedTimestamp') IS NOT NULL
        OR public.parse_dashboard_timestamp(c.row_data ->> 'opsDisbursalTimestamp') IS NOT NULL;
    ELSE
      RETURN false;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_field_timestamp(c public.dashboard_cases, field_name TEXT)
RETURNS TIMESTAMP WITHOUT TIME ZONE
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE field_name
    WHEN 'tokenDate' THEN RETURN c.token_date::timestamp;
    WHEN 'bookingDate' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'bookingDate');
    WHEN 'expectedDeliveryDate' THEN RETURN c.expected_delivery_date::timestamp;
    WHEN 'actualDeliveryDate' THEN RETURN c.actual_delivery_date::timestamp;
    WHEN 'lastPaymentDate' THEN RETURN c.last_payment_date::timestamp;
    WHEN 'latestRemarkDate' THEN RETURN c.latest_remark_date::timestamp;
    WHEN 'cancellationDate' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'cancellationDate');
    WHEN 'updatedAt' THEN RETURN c.updated_at::timestamp;
    WHEN 'expectedOdCompletionDate' THEN RETURN c.expected_od_completion_date::timestamp;
    WHEN 'eddReviewerDate' THEN RETURN c.edd_reviewer_date::timestamp;
    WHEN 'tokenDateTime' THEN
      RETURN COALESCE(
        public.parse_dashboard_timestamp(c.row_data ->> 'tokenDateTime'),
        CASE
          WHEN (c.row_data ->> 'tokenDateTime') IS NOT NULL AND nullif(btrim(c.row_data ->> 'tokenDateTime'), '') IS NOT NULL 
               AND c.token_date IS NOT NULL THEN
            public.parse_dashboard_timestamp(to_char(c.token_date, 'YYYY-MM-DD') || ' ' || (c.row_data ->> 'tokenDateTime'))
          ELSE
            c.token_date::timestamp
        END
      );
    WHEN 'expectedDeliveryTime' THEN
      RETURN COALESCE(
        public.parse_dashboard_timestamp(c.row_data ->> 'expectedDeliveryTime'),
        CASE
          WHEN (c.row_data ->> 'expectedDeliveryTime') IS NOT NULL AND nullif(btrim(c.row_data ->> 'expectedDeliveryTime'), '') IS NOT NULL 
               AND (c.row_data ->> 'expectedDeliveryDate') IS NOT NULL AND nullif(btrim(c.row_data ->> 'expectedDeliveryDate'), '') IS NOT NULL THEN
            public.parse_dashboard_timestamp((c.row_data ->> 'expectedDeliveryDate') || ' ' || (c.row_data ->> 'expectedDeliveryTime'))
          ELSE
            public.parse_dashboard_timestamp(c.row_data ->> 'expectedDeliveryDate')
        END
      );
    WHEN 'cancelReqDate' THEN RETURN c.cancel_req_date::timestamp;
    WHEN 'latestLeadCreationTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestLeadCreationTimestamp');
    WHEN 'latestLoginTime' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestLoginTime');
    WHEN 'latestCreditAssessedTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestCreditAssessedTimestamp');
    WHEN 'latestDiligenceAssessedTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestDiligenceAssessedTimestamp');
    WHEN 'latestFcuAssessedTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'latestFcuAssessedTimestamp');
    WHEN 'tncGeneratedDate' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'tncGeneratedDate');
    WHEN 'tncAcceptedTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'tncAcceptedTimestamp');
    WHEN 'fcuSentDate' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'fcuSentDate');
    WHEN 'sentToRcuTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'sentToRcuTimestamp');
    WHEN 'sentToOpsTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'sentToOpsTimestamp');
    WHEN 'submitToOpsTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'submitToOpsTimestamp');
    WHEN 'opsDisbursalTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'opsDisbursalTimestamp');
    WHEN 'financeDisbursedTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'financeDisbursedTimestamp');
    WHEN 'lastCallAt' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'lastCallAt');
    WHEN 'followupAt' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'followupAt');
    WHEN 'sheetLoginTimestamp' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'sheetLoginTimestamp');
    WHEN 'gmailPendencyDate' THEN RETURN c.gmail_pendency_date::timestamp;
    WHEN 'mlEstimatedDeliveryDate' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'mlEstimatedDeliveryDate');
    WHEN 'dealStatusUpdatedAt' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'dealStatusUpdatedAt');
    WHEN 'tokenAutoCancellationExtendedDate' THEN RETURN public.parse_dashboard_timestamp(c.row_data ->> 'tokenAutoCancellationExtendedDate');
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_matches_derived_value(c public.dashboard_cases, candidate TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  normalized_candidate TEXT := lower(btrim(candidate));
  task_text TEXT := lower(coalesce(c.task_bucket, ''));
  payment_text TEXT := lower(coalesce(c.payment_type, ''));
  deal_status_text TEXT := upper(coalesce(c.deal_status, ''));
  lead_stage_text TEXT := upper(coalesce(c.lead_stage, ''));
  last_call_ts TIMESTAMP WITHOUT TIME ZONE := public.parse_dashboard_timestamp(c.row_data ->> 'lastCallAt');
  expected_delivery_ts DATE := c.expected_delivery_date;
  actual_delivery_ts DATE := c.actual_delivery_date;
  on_demand_text TEXT := nullif(btrim(coalesce(c.row_data ->> 'onDemandStatus', '')), '');
  is_alert_visible TEXT := lower(coalesce(c.row_data ->> 'isAlertVisible', ''));
  amount_pending NUMERIC := coalesce(public.dashboard_numeric(c.row_data ->> 'amountPending'), 0);
  amount_collected NUMERIC := coalesce(public.dashboard_numeric(c.row_data ->> 'amountCollected'), 0);
  payment_percentage_normalized NUMERIC := coalesce(c.payment_percentage, 0);
  is_cancelled BOOLEAN := lead_stage_text IN ('CANCELLED', 'RETURNED') OR deal_status_text = 'CANCEL';
BEGIN
  IF normalized_candidate = 'alert cases' THEN
    RETURN task_text <> '' AND is_alert_visible <> 'false';
  ELSIF normalized_candidate = 'edd missing' THEN
    RETURN lead_stage_text = 'ACTIVE_TOKEN' AND expected_delivery_ts IS NULL;
  ELSIF normalized_candidate = 'edd breached' THEN
    RETURN expected_delivery_ts IS NOT NULL AND actual_delivery_ts IS NULL AND expected_delivery_ts < CURRENT_DATE;
  ELSIF normalized_candidate = 'pmax stuck' THEN
    RETURN task_text LIKE '%p_max%' OR task_text LIKE '%pmax%';
  ELSIF normalized_candidate = 'customer connect pending' THEN
    RETURN task_text LIKE '%customer connect%'
      OR (last_call_ts IS NOT NULL AND last_call_ts::DATE < CURRENT_DATE - 2)
      OR (last_call_ts IS NULL AND lead_stage_text = 'ACTIVE_TOKEN');
  ELSIF normalized_candidate = 'high payment pending delivery' THEN
    RETURN payment_percentage_normalized >= 0.75 AND lead_stage_text <> 'DELIVERED';
  ELSIF normalized_candidate = 'cancelled after payment' THEN
    RETURN is_cancelled AND amount_collected > 0;
  ELSIF normalized_candidate = 'od pending' THEN
    RETURN on_demand_text IS NOT NULL AND actual_delivery_ts IS NULL;
  ELSIF normalized_candidate = 'blank payment type' THEN
    RETURN payment_text = '';
  ELSIF normalized_candidate = 'payment pending' THEN
    RETURN amount_pending > 0;
  ELSIF normalized_candidate = 'any active task' THEN
    RETURN task_text <> '';
  END IF;

  RETURN task_text LIKE '%' || normalized_candidate || '%';
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_case_tags(c public.dashboard_cases)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
SELECT jsonb_build_object(
  'isC2D', (
    ((c.lead_stage IN ('CANCELLED', 'RETURNED') OR c.deal_status = 'CANCEL')
     AND EXISTS (
       SELECT 1 FROM public.dashboard_cases d
       WHERE d.customer_key = c.customer_key
         AND d.lead_stage = 'DELIVERED'
         AND coalesce(d.actual_delivery_date, d.token_date) >= c.token_date
     ))
    OR
    (c.lead_stage = 'DELIVERED'
     AND EXISTS (
       SELECT 1 FROM public.dashboard_cases d
       WHERE d.customer_key = c.customer_key
         AND (d.lead_stage IN ('CANCELLED', 'RETURNED') OR d.deal_status = 'CANCEL')
         AND coalesce(c.actual_delivery_date, c.token_date) >= d.token_date
     ))
  ),
  'isC2A', (
    ((c.lead_stage IN ('CANCELLED', 'RETURNED') OR c.deal_status = 'CANCEL')
     AND EXISTS (
       SELECT 1 FROM public.dashboard_cases d
       WHERE d.customer_key = c.customer_key
         AND d.lead_stage = 'ACTIVE_TOKEN'
         AND (
           d.token_date >= c.token_date
           OR (
             EXISTS (
               SELECT 1 FROM public.dashboard_cases prev
               WHERE prev.customer_key = c.customer_key
                 AND prev.token_date < c.token_date
             )
             AND d.token_date >= (
               SELECT max(prev.token_date) FROM public.dashboard_cases prev
               WHERE prev.customer_key = c.customer_key
                 AND prev.token_date < c.token_date
             )
             AND d.token_date <= c.token_date
           )
         )
     ))
    OR
    (c.lead_stage = 'ACTIVE_TOKEN'
     AND EXISTS (
       SELECT 1 FROM public.dashboard_cases d
       WHERE d.customer_key = c.customer_key
         AND (d.lead_stage IN ('CANCELLED', 'RETURNED') OR d.deal_status = 'CANCEL')
         AND (
           c.token_date >= d.token_date
           OR (
             EXISTS (
               SELECT 1 FROM public.dashboard_cases prev
               WHERE prev.customer_key = d.customer_key
                 AND prev.token_date < d.token_date
             )
             AND c.token_date >= (
               SELECT max(prev.token_date) FROM public.dashboard_cases prev
               WHERE prev.customer_key = d.customer_key
                 AND prev.token_date < d.token_date
             )
             AND c.token_date <= d.token_date
           )
         )
     ))
  ),
  'isCR2D', (
    c.lead_stage = 'DELIVERED'
    AND c.cancel_reason IS NOT NULL
    AND c.cancel_reason <> ''
  )
);
$$;

CREATE OR REPLACE FUNCTION public.dashboard_case_matches_filters(
  c public.dashboard_cases,
  input_filters JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  search_query TEXT := nullif(btrim(coalesce(input_filters ->> 'searchQuery', '')), '');
  funnel_candidate TEXT;
  derived_candidate TEXT;
  ready_value TEXT := nullif(btrim(coalesce(c.ready_to_deliver, '')), '');
  field_name TEXT;
  field_ts TIMESTAMP WITHOUT TIME ZONE;
  start_ts TIMESTAMP WITHOUT TIME ZONE;
  end_ts TIMESTAMP WITHOUT TIME ZONE;
  date_filter JSONB;
  normalized_threshold NUMERIC;
  c2d_filter TEXT := nullif(btrim(coalesce(input_filters ->> 'c2dFilter', '')), '');
BEGIN
  IF search_query IS NOT NULL THEN
    search_query := lower(search_query);
    RETURN lower(coalesce(c.booking_id, '')) LIKE '%' || search_query || '%'
      OR lower(coalesce(c.row_data ->> 'carRegNo', '')) LIKE '%' || search_query || '%'
      OR lower(coalesce(c.row_data ->> 'userId', '')) LIKE '%' || search_query || '%'
      OR lower(coalesce(c.row_data ->> 'make', '')) LIKE '%' || search_query || '%'
      OR lower(coalesce(c.row_data ->> 'model', '')) LIKE '%' || search_query || '%'
      OR lower(coalesce(c.row_data ->> 'appointmentId', '')) LIKE '%' || search_query || '%';
  END IF;

  IF NOT public.dashboard_matches_text_filter(input_filters -> 'city', c.city) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'hubName', c.hub_name) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'tokenType', c.token_type) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'tokenTypeWithNrt', c.token_type_with_nrt) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'rmName', c.allocated_rm) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'dcName', c.assigned_dc) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'paymentType', c.payment_type) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'leadStage', c.lead_stage) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'dealStatus', c.deal_status) THEN RETURN false; END IF;

  IF input_filters ? 'funnelStage' AND jsonb_typeof(input_filters -> 'funnelStage') = 'array' AND jsonb_array_length(input_filters -> 'funnelStage') > 0 THEN
    DECLARE
      funnel_matched BOOLEAN := false;
    BEGIN
      FOR funnel_candidate IN
        SELECT jsonb_array_elements_text(input_filters -> 'funnelStage')
      LOOP
        IF funnel_candidate IN (
          'Lead Created',
          'Case Logged In',
          'Credit Assessed',
          'Diligence Assessed',
          'T&C Accepted',
          'FCU Checked',
          'Submitted To Ops',
          'Finance Disbursed'
        ) THEN
          IF public.dashboard_case_has_milestone(c, funnel_candidate) THEN
            funnel_matched := true;
            EXIT;
          END IF;
        ELSIF lower(coalesce(c.row_data ->> 'funnelStage', '')) = lower(btrim(funnel_candidate)) THEN
          funnel_matched := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT funnel_matched THEN
        RETURN false;
      END IF;
    END;
  END IF;

  normalized_threshold := public.dashboard_numeric(input_filters ->> 'minPaymentPercentage');
  IF normalized_threshold IS NOT NULL THEN
    IF coalesce(CASE WHEN c.payment_percentage > 1 THEN c.payment_percentage / 100.0 ELSE c.payment_percentage END, 0) < normalized_threshold / 100.0 THEN
      RETURN false;
    END IF;
  END IF;

  IF NOT public.dashboard_matches_text_filter(input_filters -> 'sheetFinalStatus', c.sheet_final_status) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'formFinalStatus', c.form_final_status) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'gmailPendencyStatus', c.gmail_pendency_status) THEN RETURN false; END IF;
  IF input_filters ? 'confidenceTrend' AND jsonb_typeof(input_filters -> 'confidenceTrend') = 'array' AND jsonb_array_length(input_filters -> 'confidenceTrend') > 0 THEN
    IF NOT public.dashboard_matches_text_filter(input_filters -> 'confidenceTrend', public.dashboard_confidence_trend(c)) THEN
      RETURN false;
    END IF;
  END IF;
  IF NOT public.dashboard_matches_text_filter(input_filters -> 'onDemandStatus', c.row_data ->> 'onDemandStatus') THEN RETURN false; END IF;

  IF nullif(coalesce(input_filters ->> 'listingDaysBucket', ''), '') IS NOT NULL THEN
    IF public.dashboard_listing_days_bucket(c.total_listing_days) IS DISTINCT FROM input_filters ->> 'listingDaysBucket' THEN
      RETURN false;
    END IF;
  END IF;

  IF NOT public.dashboard_matches_task_filter(input_filters -> 'taskBucket', c.task_bucket) THEN RETURN false; END IF;

  IF input_filters ? 'derivedStatus' AND jsonb_typeof(input_filters -> 'derivedStatus') = 'array' AND jsonb_array_length(input_filters -> 'derivedStatus') > 0 THEN
    DECLARE
      derived_matched BOOLEAN := false;
    BEGIN
      FOR derived_candidate IN
        SELECT jsonb_array_elements_text(input_filters -> 'derivedStatus')
      LOOP
        IF public.dashboard_matches_derived_value(c, derived_candidate) THEN
          derived_matched := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT derived_matched THEN
        RETURN false;
      END IF;
    END;
  END IF;

  field_name := nullif(coalesce(input_filters ->> 'dateField', ''), '');
  IF field_name IS NOT NULL THEN
    field_ts := public.dashboard_field_timestamp(c, field_name);
    IF coalesce((input_filters ->> 'filterBlankDates')::BOOLEAN, false) THEN
      IF field_ts IS NOT NULL THEN
        RETURN false;
      END IF;
    ELSE
      IF field_ts IS NULL THEN
        RETURN false;
      END IF;

      start_ts := public.parse_dashboard_timestamp(input_filters ->> 'startDate');
      end_ts := public.parse_dashboard_timestamp(input_filters ->> 'endDate');

      IF start_ts IS NOT NULL AND field_ts < date_trunc('day', start_ts) THEN
        RETURN false;
      END IF;

      IF end_ts IS NOT NULL AND field_ts >= date_trunc('day', end_ts) + interval '1 day' THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  IF input_filters ? 'dateFilters' AND jsonb_typeof(input_filters -> 'dateFilters') = 'array' THEN
    FOR date_filter IN
      SELECT value FROM jsonb_array_elements(input_filters -> 'dateFilters')
    LOOP
      field_name := nullif(coalesce(date_filter ->> 'field', ''), '');
      IF field_name IS NULL THEN
        CONTINUE;
      END IF;

      field_ts := public.dashboard_field_timestamp(c, field_name);
      IF coalesce((date_filter ->> 'filterBlankDates')::BOOLEAN, false) THEN
        IF field_ts IS NOT NULL THEN
          RETURN false;
        END IF;
      ELSE
        IF field_ts IS NULL THEN
          RETURN false;
        END IF;

        start_ts := public.parse_dashboard_timestamp(date_filter ->> 'startDate');
        end_ts := public.parse_dashboard_timestamp(date_filter ->> 'endDate');

        IF start_ts IS NOT NULL AND field_ts < date_trunc('day', start_ts) THEN
          RETURN false;
        END IF;

        IF end_ts IS NOT NULL AND field_ts >= date_trunc('day', end_ts) + interval '1 day' THEN
          RETURN false;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF nullif(coalesce(input_filters ->> 'eddStatus', ''), '') IS NOT NULL THEN
    IF public.dashboard_expected_edd_bucket(c.expected_delivery_date) IS DISTINCT FROM input_filters ->> 'eddStatus' THEN
      RETURN false;
    END IF;
  END IF;

  IF NOT public.dashboard_matches_text_filter(input_filters -> 'cancelReason', c.cancel_reason) THEN RETURN false; END IF;
  IF NOT public.dashboard_matches_text_filter(
    input_filters -> 'leadDsChannel',
    coalesce(
      nullif(btrim(c.lead_ds_channel), ''),
      nullif(btrim(c.row_data ->> 'leadDsChannel'), '')
    )
  ) THEN RETURN false; END IF;

  IF input_filters ? 'readyToDeliver' AND jsonb_typeof(input_filters -> 'readyToDeliver') = 'array' AND jsonb_array_length(input_filters -> 'readyToDeliver') > 0 THEN
    IF NOT public.dashboard_matches_text_filter(input_filters -> 'readyToDeliver', ready_value) THEN
      RETURN false;
    END IF;
  END IF;

  IF c2d_filter IS NOT NULL AND c2d_filter <> 'All' THEN
    IF c2d_filter = 'C2D' THEN
      IF NOT (
        ((c.lead_stage IN ('CANCELLED', 'RETURNED') OR c.deal_status = 'CANCEL')
         AND EXISTS (
           SELECT 1
           FROM public.dashboard_cases d
           WHERE d.customer_key = c.customer_key
             AND d.lead_stage = 'DELIVERED'
             AND coalesce(d.actual_delivery_date, d.token_date) >= c.token_date
         ))
        OR
        (c.lead_stage = 'DELIVERED'
         AND EXISTS (
           SELECT 1
           FROM public.dashboard_cases d
           WHERE d.customer_key = c.customer_key
             AND (d.lead_stage IN ('CANCELLED', 'RETURNED') OR d.deal_status = 'CANCEL')
             AND coalesce(c.actual_delivery_date, c.token_date) >= d.token_date
         ))
      ) THEN
        RETURN false;
      END IF;
    ELSIF c2d_filter = 'C2A' THEN
      IF NOT (
        ((c.lead_stage IN ('CANCELLED', 'RETURNED') OR c.deal_status = 'CANCEL')
         AND EXISTS (
           SELECT 1
           FROM public.dashboard_cases d
           WHERE d.customer_key = c.customer_key
             AND d.lead_stage = 'ACTIVE_TOKEN'
             AND (
               d.token_date >= c.token_date
               OR (
                 EXISTS (
                   SELECT 1
                   FROM public.dashboard_cases prev
                   WHERE prev.customer_key = c.customer_key
                     AND prev.token_date < c.token_date
                 )
                 AND d.token_date >= (
                   SELECT max(prev.token_date)
                   FROM public.dashboard_cases prev
                   WHERE prev.customer_key = c.customer_key
                     AND prev.token_date < c.token_date
                 )
                 AND d.token_date <= c.token_date
               )
             )
         ))
        OR
        (c.lead_stage = 'ACTIVE_TOKEN'
         AND EXISTS (
           SELECT 1
           FROM public.dashboard_cases d
           WHERE d.customer_key = c.customer_key
             AND (d.lead_stage IN ('CANCELLED', 'RETURNED') OR d.deal_status = 'CANCEL')
             AND (
               c.token_date >= d.token_date
               OR (
                 EXISTS (
                   SELECT 1
                   FROM public.dashboard_cases prev
                   WHERE prev.customer_key = d.customer_key
                     AND prev.token_date < d.token_date
                 )
                 AND c.token_date >= (
                   SELECT max(prev.token_date)
                   FROM public.dashboard_cases prev
                   WHERE prev.customer_key = d.customer_key
                     AND prev.token_date < d.token_date
                 )
                 AND c.token_date <= d.token_date
               )
             )
         ))
      ) THEN
        RETURN false;
      END IF;
    ELSIF c2d_filter = 'CR2D' THEN
      IF NOT (
        c.lead_stage = 'DELIVERED'
        AND c.cancel_reason IS NOT NULL
        AND c.cancel_reason <> ''
      ) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_case_page(
  input_filters JSONB DEFAULT '{}'::JSONB,
  input_sort_field TEXT DEFAULT 'tokenDate',
  input_sort_direction TEXT DEFAULT 'desc',
  input_page INTEGER DEFAULT 1,
  input_page_size INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  safe_sort_direction TEXT := CASE WHEN lower(coalesce(input_sort_direction, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  safe_page INTEGER := greatest(coalesce(input_page, 1), 1);
  safe_page_size INTEGER := least(greatest(coalesce(input_page_size, 15), 1), 200);
  safe_offset INTEGER := (greatest(coalesce(input_page, 1), 1) - 1) * least(greatest(coalesce(input_page_size, 15), 1), 200);
  sort_expression TEXT;
  fallback_expression TEXT := 'lower(c.booking_id)';
  result JSONB;
BEGIN
  sort_expression := CASE input_sort_field
    WHEN 'bookingId' THEN 'lower(c.booking_id)'
    WHEN 'loanId' THEN 'lower(coalesce(c.row_data ->> ''loanId'', ''''))'
    WHEN 'tokenDate' THEN 'c.token_date'
    WHEN 'hubName' THEN 'lower(coalesce(c.hub_name, ''''))'
    WHEN 'allocatedRm' THEN 'lower(coalesce(c.allocated_rm, ''''))'
    WHEN 'paymentType' THEN 'lower(coalesce(c.payment_type, ''''))'
    WHEN 'leadStage' THEN 'lower(coalesce(c.lead_stage, ''''))'
    WHEN 'taskBucket' THEN 'lower(coalesce(c.task_bucket, ''''))'
    WHEN 'expectedDeliveryDate' THEN 'c.expected_delivery_date'
    WHEN 'readyToDeliver' THEN 'lower(coalesce(c.ready_to_deliver, ''''))'
    WHEN 'expectedOdCompletionDate' THEN 'c.expected_od_completion_date'
    WHEN 'city' THEN 'lower(coalesce(c.city, ''''))'
    WHEN 'totalListingDays' THEN 'c.total_listing_days'
    WHEN 'paymentPercentage' THEN 'c.payment_percentage'
    WHEN 'updatedAt' THEN 'c.updated_at'
    ELSE format('lower(coalesce(c.row_data ->> %L, ''''))', input_sort_field)
  END;

  EXECUTE format(
    'WITH filtered AS MATERIALIZED (
       SELECT c.booking_id, c.row_data
       FROM public.dashboard_cases c
       WHERE public.dashboard_case_matches_filters(c, $1)
     ),
     total_rows AS (
       SELECT count(*)::INTEGER AS total_count
       FROM filtered
     ),
     paged AS (
       SELECT c.row_data || jsonb_build_object(''confidenceTrendStatus'', public.dashboard_confidence_trend(c)) || public.dashboard_case_tags(c) as row_data
       FROM public.dashboard_cases c
       INNER JOIN filtered f ON f.booking_id = c.booking_id
       ORDER BY %s %s NULLS LAST, %s ASC
       LIMIT %s OFFSET %s
     )
     SELECT jsonb_build_object(
       ''rows'', coalesce((SELECT jsonb_agg(row_data) FROM paged), ''[]''::jsonb),
       ''totalCount'', coalesce((SELECT total_count FROM total_rows), 0),
       ''page'', %s,
       ''pageSize'', %s
     )',
    sort_expression,
    safe_sort_direction,
    fallback_expression,
    safe_page_size,
    safe_offset,
    safe_page,
    safe_page_size
  )
  INTO result
  USING input_filters;

  RETURN coalesce(result, jsonb_build_object(
    'rows', '[]'::jsonb,
    'totalCount', 0,
    'page', safe_page,
    'pageSize', safe_page_size
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_token_cases(input_limit INTEGER DEFAULT 1000)
RETURNS TABLE(row_data JSONB)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT c.row_data 
         || jsonb_build_object('confidenceTrendStatus', public.dashboard_confidence_trend(c)) 
         || public.dashboard_case_tags(c) AS row_data
  FROM public.dashboard_cases c
  WHERE c.lead_stage = 'ACTIVE_TOKEN'
  ORDER BY c.token_date DESC NULLS LAST
  LIMIT input_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_filter_options()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH base AS MATERIALIZED (
  SELECT *
  FROM public.dashboard_cases
),
distinct_hubs AS (
  SELECT DISTINCT city, hub_name
  FROM base
  WHERE city IS NOT NULL AND hub_name IS NOT NULL
),
hubs_by_city AS (
  SELECT jsonb_object_agg(city, hubs) AS value
  FROM (
    SELECT city, jsonb_agg(hub_name ORDER BY hub_name) AS hubs
    FROM distinct_hubs
    GROUP BY city
  ) grouped
),
task_values AS (
  SELECT DISTINCT task
  FROM base
  CROSS JOIN LATERAL public.dashboard_split_tasks(base.task_bucket)
),
funnel_values AS (
  SELECT DISTINCT nullif(btrim(row_data ->> 'funnelStage'), '') AS value
  FROM base
  WHERE nullif(btrim(row_data ->> 'funnelStage'), '') IS NOT NULL
)
SELECT jsonb_build_object(
  'cities', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT city AS value FROM base WHERE city IS NOT NULL) cities), '[]'::jsonb),
  'hubs', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT hub_name AS value FROM base WHERE hub_name IS NOT NULL) hubs), '[]'::jsonb),
  'hubsByCity', coalesce((SELECT value FROM hubs_by_city), '{}'::jsonb),
  'tokenTypes', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT token_type AS value FROM base WHERE token_type IS NOT NULL) token_types), '[]'::jsonb),
  'tokenTypesWithNrt', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT token_type_with_nrt AS value FROM base WHERE token_type_with_nrt IS NOT NULL) token_types_nrt), '[]'::jsonb),
  'rms', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT allocated_rm AS value FROM base WHERE allocated_rm IS NOT NULL) rms), '[]'::jsonb),
  'dcs', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT assigned_dc AS value FROM base WHERE assigned_dc IS NOT NULL) dcs), '[]'::jsonb),
  'paymentTypes', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT payment_type AS value FROM base WHERE payment_type IS NOT NULL) payment_types), '[]'::jsonb),
  'leadStages', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT lead_stage AS value FROM base WHERE lead_stage IS NOT NULL) lead_stages), '[]'::jsonb),
  'dealStatuses', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT deal_status AS value FROM base WHERE deal_status IS NOT NULL) deal_statuses), '[]'::jsonb),
  'funnelStages', to_jsonb(ARRAY[
    'Lead Created',
    'Case Logged In',
    'Credit Assessed',
    'Diligence Assessed',
    'T&C Accepted',
    'FCU Checked',
    'Submitted To Ops',
    'Finance Disbursed'
  ]) || coalesce(
    (
      SELECT jsonb_agg(value ORDER BY value)
      FROM funnel_values
      WHERE value NOT IN (
        'Lead Created',
        'Case Logged In',
        'Credit Assessed',
        'Diligence Assessed',
        'T&C Accepted',
        'FCU Checked',
        'Submitted To Ops',
        'Finance Disbursed'
      )
    ),
    '[]'::jsonb
  ),
  'sheetFinalStatuses', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT sheet_final_status AS value FROM base WHERE sheet_final_status IS NOT NULL) sheet_statuses), '[]'::jsonb),
  'formFinalStatuses', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT form_final_status AS value FROM base WHERE form_final_status IS NOT NULL) form_statuses), '[]'::jsonb),
  'gmailPendencyStatuses', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT gmail_pendency_status AS value FROM base WHERE gmail_pendency_status IS NOT NULL) gmail_statuses), '[]'::jsonb),
  'onDemandStatuses', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT nullif(btrim(row_data ->> 'onDemandStatus'), '') AS value FROM base WHERE nullif(btrim(row_data ->> 'onDemandStatus'), '') IS NOT NULL) on_demand_statuses), '[]'::jsonb),
  'tasks', coalesce((SELECT jsonb_agg(task ORDER BY task) FROM task_values), '[]'::jsonb),
  'cancelReasons', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT cancel_reason AS value FROM base WHERE cancel_reason IS NOT NULL) cancel_reasons), '[]'::jsonb),
  'leadDsChannels', coalesce((
    SELECT jsonb_agg(value ORDER BY value)
    FROM (
      SELECT DISTINCT coalesce(
        nullif(btrim(lead_ds_channel), ''),
        nullif(btrim(row_data ->> 'leadDsChannel'), '')
      ) AS value
      FROM base
      WHERE coalesce(
        nullif(btrim(lead_ds_channel), ''),
        nullif(btrim(row_data ->> 'leadDsChannel'), '')
      ) IS NOT NULL
    ) lead_channels
  ), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  input_filters JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
WITH filtered AS MATERIALIZED (
  SELECT *
  FROM public.dashboard_cases c
  WHERE public.dashboard_case_matches_filters(c, input_filters)
),
filtered_cancelled_c2d AS (
  SELECT count(*)::INTEGER AS total
  FROM filtered f
  WHERE (f.lead_stage IN ('CANCELLED', 'RETURNED') OR f.deal_status = 'CANCEL')
    AND EXISTS (
      SELECT 1
      FROM public.dashboard_cases d
      WHERE d.customer_key = f.customer_key
        AND d.lead_stage = 'DELIVERED'
        AND coalesce(d.actual_delivery_date, d.token_date) >= f.token_date
    )
),
filtered_cancelled_c2a AS (
  SELECT count(*)::INTEGER AS total
  FROM filtered f
  WHERE (f.lead_stage IN ('CANCELLED', 'RETURNED') OR f.deal_status = 'CANCEL')
    AND EXISTS (
      SELECT 1
      FROM public.dashboard_cases d
      WHERE d.customer_key = f.customer_key
        AND d.lead_stage = 'ACTIVE_TOKEN'
        AND (
          d.token_date >= f.token_date
          OR (
            EXISTS (
              SELECT 1
              FROM public.dashboard_cases prev
              WHERE prev.customer_key = f.customer_key
                AND prev.token_date < f.token_date
            )
            AND d.token_date >= (
              SELECT max(prev.token_date)
              FROM public.dashboard_cases prev
              WHERE prev.customer_key = f.customer_key
                AND prev.token_date < f.token_date
            )
            AND d.token_date <= f.token_date
          )
        )
    )
),
filtered_cancelled_cr2d AS (
  SELECT count(*)::INTEGER AS total
  FROM filtered f
  WHERE f.lead_stage = 'DELIVERED'
    AND f.cancel_reason IS NOT NULL
    AND f.cancel_reason <> ''
),
task_counts AS (
  SELECT
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.dashboard_split_tasks(filtered.task_bucket)
    ))::INTEGER AS bookings_with_tasks,
    count(split_task.task)::INTEGER AS total_task_instances
  FROM filtered
  LEFT JOIN LATERAL public.dashboard_split_tasks(filtered.task_bucket) split_task ON true
)
SELECT jsonb_build_object(
  'kpis', jsonb_build_object(
    'totalCases', (SELECT count(*)::INTEGER FROM filtered),
    'activeTokens', (SELECT count(*)::INTEGER FROM filtered WHERE lead_stage = 'ACTIVE_TOKEN'),
    'delivered', (SELECT count(*)::INTEGER FROM filtered WHERE lead_stage = 'DELIVERED'),
    'cancelled', (SELECT count(*)::INTEGER FROM filtered WHERE lead_stage IN ('CANCELLED', 'RETURNED') OR deal_status = 'CANCEL'),
    'bookingsWithTasks', coalesce((SELECT bookings_with_tasks FROM task_counts), 0),
    'totalTaskInstances', coalesce((SELECT total_task_instances FROM task_counts), 0),
    'pmaxCases', (SELECT count(*)::INTEGER FROM filtered WHERE lower(coalesce(payment_type, '')) = 'pmax'),
    'paymentPending', (
      SELECT count(*)::INTEGER
      FROM filtered
      WHERE coalesce(public.dashboard_numeric(row_data ->> 'amountPending'), 0) > 0
    ),
    'totalCollected', coalesce((
      SELECT sum(coalesce(public.dashboard_numeric(row_data ->> 'amountCollected'), 0))
      FROM filtered
    ), 0),
    'totalPending', coalesce((
      SELECT sum(coalesce(public.dashboard_numeric(row_data ->> 'amountPending'), 0))
      FROM filtered
    ), 0),
    'avgPaymentPercentage', coalesce((
      SELECT avg(payment_percentage)
      FROM filtered
      WHERE payment_percentage IS NOT NULL AND payment_percentage > 0
    ), 0)
  ),
  'charts', jsonb_build_object(
    'leadStage', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(lead_stage, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'dealStatus', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(deal_status, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'city', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(city, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'hub', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt
        FROM (
          SELECT coalesce(nullif(hub_name, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
          FROM filtered
          GROUP BY 1
          ORDER BY cnt DESC, bucket
          LIMIT 15
        ) ranked
      ) grouped
    ), '{}'::jsonb),
    'rm', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt
        FROM (
          SELECT coalesce(nullif(allocated_rm, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
          FROM filtered
          GROUP BY 1
          ORDER BY cnt DESC, bucket
          LIMIT 15
        ) ranked
      ) grouped
    ), '{}'::jsonb),
    'dc', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt
        FROM (
          SELECT coalesce(nullif(assigned_dc, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
          FROM filtered
          GROUP BY 1
          ORDER BY cnt DESC, bucket
          LIMIT 15
        ) ranked
      ) grouped
    ), '{}'::jsonb),
    'readyToDeliver', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt, sort_order
        FROM (
          SELECT 'Blank' AS bucket, count(*)::INTEGER AS cnt, 1 AS sort_order
          FROM filtered
          WHERE nullif(btrim(coalesce(ready_to_deliver, '')), '') IS NULL
          UNION ALL
          SELECT 'Yes', count(*)::INTEGER, 2
          FROM filtered
          WHERE lower(coalesce(ready_to_deliver, '')) = 'yes'
          UNION ALL
          SELECT 'No', count(*)::INTEGER, 3
          FROM filtered
          WHERE lower(coalesce(ready_to_deliver, '')) = 'no'
        ) ordered_values
        WHERE cnt > 0
        ORDER BY sort_order
      ) grouped
    ), '{}'::jsonb),
    'onDemandStatusDistribution', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(btrim(row_data ->> 'onDemandStatus'), ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'totalExpectedAmountDistribution', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt, sort_order
        FROM (
          SELECT '<3 Lac' AS bucket, count(*)::INTEGER AS cnt, 1 AS sort_order
          FROM filtered
          WHERE coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) > 0
            AND coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) < 300000
          UNION ALL
          SELECT '3-6 Lac', count(*)::INTEGER, 2
          FROM filtered
          WHERE coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) >= 300000
            AND coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) < 600000
          UNION ALL
          SELECT '6-9 Lac', count(*)::INTEGER, 3
          FROM filtered
          WHERE coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) >= 600000
            AND coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) < 900000
          UNION ALL
          SELECT '9+ Lac', count(*)::INTEGER, 4
          FROM filtered
          WHERE coalesce(public.dashboard_numeric(row_data ->> 'totalExpectedAmount'), 0) >= 900000
        ) ordered_values
        WHERE cnt > 0
        ORDER BY sort_order
      ) grouped
    ), '{}'::jsonb),
    'tokenType', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(token_type, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'tokenTypeWithNrt', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(token_type_with_nrt, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'paymentType', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(payment_type, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'funnelStage', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt
        FROM (
          SELECT coalesce(nullif(btrim(row_data ->> 'funnelStage'), ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
          FROM filtered
          GROUP BY 1
          ORDER BY cnt DESC, bucket
          LIMIT 15
        ) ranked
      ) grouped
    ), '{}'::jsonb),
    'taskBucket', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt
        FROM (
          SELECT task AS bucket, count(*)::INTEGER AS cnt
          FROM filtered
          CROSS JOIN LATERAL public.dashboard_split_tasks(filtered.task_bucket) task_value
          GROUP BY 1
          UNION ALL
          SELECT 'Blank', count(*)::INTEGER
          FROM filtered
          WHERE NOT EXISTS (
            SELECT 1 FROM public.dashboard_split_tasks(filtered.task_bucket)
          )
        ) counts
        ORDER BY cnt DESC, bucket
        LIMIT 15
      ) grouped
    ), '{}'::jsonb),
    'cancellationReason', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT bucket, cnt
        FROM (
          SELECT coalesce(nullif(cancel_reason, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
          FROM filtered
          GROUP BY 1
          ORDER BY cnt DESC, bucket
          LIMIT 15
        ) ranked
      ) grouped
    ), '{}'::jsonb),
    'sheetFinalStatus', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(sheet_final_status, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'formFinalStatus', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(nullif(form_final_status, ''), 'Blank') AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'eddDistribution', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT public.dashboard_expected_edd_bucket(expected_delivery_date) AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'leadDsChannel', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT coalesce(
          nullif(btrim(lead_ds_channel), ''),
          nullif(btrim(row_data ->> 'leadDsChannel'), ''),
          'Blank'
        ) AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb),
    'listingDaysDistribution', coalesce((
      SELECT jsonb_object_agg(bucket, cnt)
      FROM (
        SELECT public.dashboard_listing_days_bucket(total_listing_days) AS bucket, count(*)::INTEGER AS cnt
        FROM filtered
        WHERE public.dashboard_listing_days_bucket(total_listing_days) IS NOT NULL
        GROUP BY 1
      ) grouped
    ), '{}'::jsonb)
  ),
  'filteredCancelledC2dCount', coalesce((SELECT total FROM filtered_cancelled_c2d), 0),
  'filteredCancelledC2aCount', coalesce((SELECT total FROM filtered_cancelled_c2a), 0),
  'filteredCancelledCr2dCount', coalesce((SELECT total FROM filtered_cancelled_cr2d), 0)
);
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_matrix_summary(
  input_filters JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  non_date_filters JSONB;
  has_date_filter BOOLEAN;
  custom_label TEXT := 'Selected Range';
  custom_sub_label TEXT := 'Custom Range';
  custom_start TIMESTAMP;
  custom_end TIMESTAMP;
  custom_end_ts TIMESTAMP;
  result_json JSONB;
BEGIN
  -- Strip date fields from input_filters for the standard cohort comparison
  non_date_filters := input_filters - 'dateField' - 'startDate' - 'endDate' - 'filterBlankDates' - 'dateFilters';

  has_date_filter := (
    (input_filters ->> 'dateField' IS NOT NULL AND input_filters ->> 'dateField' <> 'All')
    OR (input_filters -> 'dateFilters' IS NOT NULL AND jsonb_array_length(input_filters -> 'dateFilters') > 0)
  );

  custom_end_ts := COALESCE(
    public.parse_dashboard_timestamp(input_filters ->> 'endDate'),
    (date_trunc('day', now())::date)::timestamp - interval '1 millisecond'
  );

  IF has_date_filter THEN
    IF input_filters ->> 'dateField' IS NOT NULL AND input_filters ->> 'dateField' <> 'All' THEN
      custom_start := public.parse_dashboard_timestamp(input_filters ->> 'startDate');
      custom_end := public.parse_dashboard_timestamp(input_filters ->> 'endDate');
      IF custom_start IS NOT NULL AND custom_end IS NOT NULL THEN
        custom_sub_label := to_char(custom_start, 'DD/MM/YYYY') || ' - ' || to_char(custom_end, 'DD/MM/YYYY');
      ELSIF coalesce((input_filters ->> 'filterBlankDates')::BOOLEAN, false) THEN
        custom_sub_label := 'Blank Dates';
      END IF;
    END IF;
  END IF;

  RETURN (
    WITH filtered AS MATERIALIZED (
      SELECT *
      FROM public.dashboard_cases c
      WHERE public.dashboard_case_matches_filters(c, non_date_filters)
    ),
    enriched AS MATERIALIZED (
      SELECT
        f.*,
        f.token_date::timestamp AS token_ts,
        f.actual_delivery_date::timestamp AS actual_delivery_ts,
        public.parse_dashboard_timestamp(f.row_data ->> 'cancellationDate') AS cancellation_ts,
        public.parse_dashboard_timestamp(coalesce(f.row_data ->> 'latestLoginTime', f.row_data ->> 'sheetLoginTimestamp')) AS login_ts,
        public.parse_dashboard_timestamp(f.row_data ->> 'sheetLoginTimestamp') AS sheet_login_ts,
        (public.dashboard_case_tags(f) ->> 'isC2D')::boolean AS is_c2d,
        (public.dashboard_case_tags(f) ->> 'isC2A')::boolean AS is_c2a,
        (public.dashboard_case_tags(f) ->> 'isCR2D')::boolean AS is_cr2d
      FROM filtered f
    ),
    base_date AS (
      SELECT date_trunc('day', now())::date - 1 AS base_day
    ),
    timeframes AS (
      SELECT 'mtd'::text AS key, 'MTD'::text AS label,
        to_char(date_trunc('month', base_day)::date, 'FMDD/FMMon/YYYY') AS ignored_label,
        public.dashboard_format_human_date(date_trunc('month', base_day)::date) AS ignored_label_2,
        to_char(date_trunc('month', base_day)::date, 'DD/MM/YYYY') || ' - ' || to_char(base_day, 'DD/MM/YYYY') AS sub_label,
        date_trunc('month', base_day)::timestamp AS start_ts,
        (base_day + 1)::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'last_mtd', 'Last MTD',
        '', '',
        to_char(date_trunc('month', (base_day - interval '1 month'))::date, 'DD/MM/YYYY') || ' - ' ||
          to_char(
            make_date(
              extract(year from (base_day - interval '1 month'))::integer,
              extract(month from (base_day - interval '1 month'))::integer,
              least(
                extract(day from base_day)::integer,
                extract(day from (date_trunc('month', (base_day - interval '1 month')) + interval '1 month - 1 day'))::integer
              )
            ),
            'DD/MM/YYYY'
          ) AS sub_label,
        date_trunc('month', (base_day - interval '1 month'))::timestamp AS start_ts,
        (
          make_date(
            extract(year from (base_day - interval '1 month'))::integer,
            extract(month from (base_day - interval '1 month'))::integer,
            least(
              extract(day from base_day)::integer,
              extract(day from (date_trunc('month', (base_day - interval '1 month')) + interval '1 month - 1 day'))::integer
            )
          ) + 1
        )::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'llm', 'LLM', '', '',
        to_char(date_trunc('month', (base_day - interval '1 month'))::date, 'DD/MM/YYYY') || ' - ' ||
          to_char((date_trunc('month', base_day)::date - 1), 'DD/MM/YYYY') AS sub_label,
        date_trunc('month', (base_day - interval '1 month'))::timestamp AS start_ts,
        date_trunc('month', base_day)::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'w', 'W', '', '',
        to_char((base_day - ((extract(isodow from base_day)::integer) - 1))::date, 'DD/MM/YYYY') || ' - ' || to_char(base_day, 'DD/MM/YYYY') AS sub_label,
        (base_day - ((extract(isodow from base_day)::integer) - 1))::timestamp AS start_ts,
        (base_day + 1)::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'lw', 'LW', '', '',
        to_char(((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 7), 'DD/MM/YYYY') || ' - ' ||
          to_char((((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 7) + 6), 'DD/MM/YYYY') AS sub_label,
        ((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 7)::timestamp AS start_ts,
        ((((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 7) + 7)::timestamp - interval '1 millisecond') AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'llw', 'LLW', '', '',
        to_char(((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 14), 'DD/MM/YYYY') || ' - ' ||
          to_char((((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 14) + 6), 'DD/MM/YYYY') AS sub_label,
        ((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 14)::timestamp AS start_ts,
        ((((base_day - ((extract(isodow from base_day)::integer) - 1))::date - 14) + 7)::timestamp - interval '1 millisecond') AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'd1', to_char(base_day, 'DD/MM/YYYY'), '','Yesterday',
        'Yesterday' AS sub_label,
        base_day::timestamp AS start_ts,
        (base_day + 1)::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'd2', to_char(base_day - 1, 'DD/MM/YYYY'), '','T-2',
        'T-2' AS sub_label,
        (base_day - 1)::timestamp AS start_ts,
        base_day::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
      UNION ALL
      SELECT 'd3', to_char(base_day - 2, 'DD/MM/YYYY'), '','T-3',
        'T-3' AS sub_label,
        (base_day - 2)::timestamp AS start_ts,
        (base_day - 1)::timestamp - interval '1 millisecond' AS end_ts
      FROM base_date
    ),
    metrics AS (
      SELECT
        tf.key,
        tf.label,
        tf.sub_label,
        count(*) FILTER (WHERE e.actual_delivery_ts BETWEEN tf.start_ts AND tf.end_ts)::numeric AS gd,
        (
          count(*) FILTER (WHERE e.actual_delivery_ts BETWEEN tf.start_ts AND tf.end_ts)
          - count(*) FILTER (
              WHERE e.actual_delivery_ts BETWEEN tf.start_ts AND tf.end_ts
                AND (e.cancellation_ts IS NOT NULL OR nullif(btrim(coalesce(e.cancel_reason, '')), '') IS NOT NULL)
            )
        )::numeric AS nd,
        count(*) FILTER (WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts)::numeric AS inflow_count,
        count(*) FILTER (WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts AND public.dashboard_token_is_rt(e.token_type))::numeric AS rt_inflow,
        count(*) FILTER (WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts AND public.dashboard_token_is_nrt(e.token_type))::numeric AS nrt_inflow,
        count(*) FILTER (WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts AND public.dashboard_token_is_pvt(e.token_type))::numeric AS pvt_inflow,
        count(*) FILTER (
          WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts
            AND public.dashboard_token_is_gcbl(coalesce(e.token_type, e.lead_ds_channel))
        )::numeric AS gcbl_inflow,
        count(*) FILTER (
          WHERE e.token_ts IS NOT NULL
            AND e.token_ts <= tf.end_ts
            AND (e.actual_delivery_ts IS NULL OR e.actual_delivery_ts > tf.end_ts)
            AND (e.cancellation_ts IS NULL OR e.cancellation_ts > tf.end_ts)
        )::numeric AS active_count,
        avg(
          CASE
            WHEN e.token_ts IS NOT NULL
              AND e.token_ts <= tf.end_ts
              AND (e.actual_delivery_ts IS NULL OR e.actual_delivery_ts > tf.end_ts)
              AND (e.cancellation_ts IS NULL OR e.cancellation_ts > tf.end_ts)
            THEN greatest(extract(epoch from (tf.end_ts - e.token_ts)) / 86400.0, 0)
            ELSE NULL
          END
        )::numeric AS avg_age,
        count(*) FILTER (
          WHERE e.token_ts IS NOT NULL
            AND e.token_ts <= tf.end_ts
            AND (e.actual_delivery_ts IS NULL OR e.actual_delivery_ts > tf.end_ts)
            AND (e.cancellation_ts IS NULL OR e.cancellation_ts > tf.end_ts)
            AND public.dashboard_token_is_rt(e.token_type)
        )::numeric AS active_rt_count,
        count(*) FILTER (
          WHERE e.token_ts IS NOT NULL
            AND e.token_ts <= tf.end_ts
            AND (e.actual_delivery_ts IS NULL OR e.actual_delivery_ts > tf.end_ts)
            AND (e.cancellation_ts IS NULL OR e.cancellation_ts > tf.end_ts)
            AND public.dashboard_token_is_rt(e.token_type)
            AND greatest(extract(epoch from (tf.end_ts - e.token_ts)) / 86400.0, 0) > 4
        )::numeric AS active_rt_over4_count,
        count(*) FILTER (
          WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts
            AND public.dashboard_token_is_nrt(coalesce(e.token_type_with_nrt, e.token_type))
        )::numeric AS nrt_upgrades,
        count(*) FILTER (
          WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts
            AND public.dashboard_token_is_pvt(coalesce(e.token_type, e.token_type_with_nrt))
        )::numeric AS pvt_upgrades,
        count(*) FILTER (
          WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts
            AND (
              e.login_ts IS NOT NULL
              OR nullif(btrim(coalesce(e.row_data ->> 'sheetLoginPartner', '')), '') IS NOT NULL
              OR upper(coalesce(e.lead_stage, '')) = 'LOGIN_COMPLETED'
            )
        )::numeric AS login_count,
        count(*) FILTER (
          WHERE e.token_ts BETWEEN tf.start_ts AND tf.end_ts
            AND e.login_ts IS NOT NULL
            AND extract(epoch from (e.login_ts - e.token_ts)) >= 86400
        )::numeric AS login_t1_count,
        count(*) FILTER (
          WHERE e.actual_delivery_ts BETWEEN tf.start_ts AND tf.end_ts
            AND upper(coalesce(e.final_payment_type, '')) = 'CF'
            AND e.cancellation_ts IS NULL
        )::numeric AS cf_attached_count,
        count(*) FILTER (
          WHERE e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
        )::numeric AS cohort_cancelled_count,
        count(*) FILTER (
          WHERE e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
            AND public.dashboard_token_is_rt(e.token_type)
        )::numeric AS cohort_rt_cancelled,
        count(*) FILTER (
          WHERE e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
            AND public.dashboard_token_is_nrt(e.token_type)
        )::numeric AS cohort_nrt_cancelled,
        count(*) FILTER (
          WHERE e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
            AND public.dashboard_token_is_pvt(e.token_type)
        )::numeric AS cohort_pvt_cancelled,
        count(*) FILTER (
          WHERE e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
            AND e.is_c2d
        )::numeric AS c2d_count,
        count(*) FILTER (
          WHERE e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
            AND e.is_c2a
        )::numeric AS c2a_count,
        count(*) FILTER (
          WHERE coalesce(e.cancellation_ts, e.actual_delivery_ts) BETWEEN tf.start_ts AND tf.end_ts
            AND e.is_cr2d
        )::numeric AS cr2d_count,
        avg(
          CASE
            WHEN e.actual_delivery_ts BETWEEN tf.start_ts AND tf.end_ts AND e.token_ts IS NOT NULL
            THEN extract(epoch from (e.actual_delivery_ts - e.token_ts)) / 86400.0
            ELSE NULL
          END
        )::numeric AS delivery_tat,
        avg(
          CASE
            WHEN e.cancellation_ts BETWEEN tf.start_ts AND tf.end_ts
              AND e.token_ts IS NOT NULL
            THEN extract(epoch from (e.cancellation_ts - e.token_ts)) / 86400.0
            ELSE NULL
          END
        )::numeric AS cancellation_tat
      FROM timeframes tf
      LEFT JOIN enriched e ON true
      GROUP BY tf.key, tf.label, tf.sub_label, tf.start_ts, tf.end_ts
    ),
    custom_enriched AS (
      SELECT
        c.*,
        c.token_date::timestamp AS token_ts,
        c.actual_delivery_date::timestamp AS actual_delivery_ts,
        public.parse_dashboard_timestamp(c.row_data ->> 'cancellationDate') AS cancellation_ts,
        public.parse_dashboard_timestamp(coalesce(c.row_data ->> 'latestLoginTime', c.row_data ->> 'sheetLoginTimestamp')) AS login_ts,
        (public.dashboard_case_tags(c) ->> 'isC2D')::boolean AS is_c2d,
        (public.dashboard_case_tags(c) ->> 'isC2A')::boolean AS is_c2a,
        (public.dashboard_case_tags(c) ->> 'isCR2D')::boolean AS is_cr2d
      FROM public.dashboard_cases c
      WHERE public.dashboard_case_matches_filters(c, input_filters)
    ),
    custom_metrics AS (
      SELECT
        'custom_range'::text AS key,
        custom_label::text AS label,
        custom_sub_label::text AS sub_label,
        count(*) FILTER (WHERE actual_delivery_ts IS NOT NULL)::numeric AS gd,
        (
          count(*) FILTER (WHERE actual_delivery_ts IS NOT NULL)
          - count(*) FILTER (
              WHERE actual_delivery_ts IS NOT NULL
                AND (cancellation_ts IS NOT NULL OR nullif(btrim(coalesce(cancel_reason, '')), '') IS NOT NULL)
            )
        )::numeric AS nd,
        count(*) FILTER (WHERE token_ts IS NOT NULL)::numeric AS inflow_count,
        count(*) FILTER (WHERE token_ts IS NOT NULL AND public.dashboard_token_is_rt(token_type))::numeric AS rt_inflow,
        count(*) FILTER (WHERE token_ts IS NOT NULL AND public.dashboard_token_is_nrt(token_type))::numeric AS nrt_inflow,
        count(*) FILTER (WHERE token_ts IS NOT NULL AND public.dashboard_token_is_pvt(token_type))::numeric AS pvt_inflow,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND public.dashboard_token_is_gcbl(coalesce(token_type, lead_ds_channel))
        )::numeric AS gcbl_inflow,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND token_ts <= custom_end_ts
            AND (actual_delivery_ts IS NULL OR actual_delivery_ts > custom_end_ts)
            AND (cancellation_ts IS NULL OR cancellation_ts > custom_end_ts)
        )::numeric AS active_count,
        avg(
          CASE
            WHEN token_ts IS NOT NULL
              AND token_ts <= custom_end_ts
              AND (actual_delivery_ts IS NULL OR actual_delivery_ts > custom_end_ts)
              AND (cancellation_ts IS NULL OR cancellation_ts > custom_end_ts)
            THEN greatest(extract(epoch from (custom_end_ts - token_ts)) / 86400.0, 0)
            ELSE NULL
          END
        )::numeric AS avg_age,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND token_ts <= custom_end_ts
            AND (actual_delivery_ts IS NULL OR actual_delivery_ts > custom_end_ts)
            AND (cancellation_ts IS NULL OR cancellation_ts > custom_end_ts)
            AND public.dashboard_token_is_rt(token_type)
        )::numeric AS active_rt_count,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND token_ts <= custom_end_ts
            AND (actual_delivery_ts IS NULL OR actual_delivery_ts > custom_end_ts)
            AND (cancellation_ts IS NULL OR cancellation_ts > custom_end_ts)
            AND public.dashboard_token_is_rt(token_type)
            AND greatest(extract(epoch from (custom_end_ts - token_ts)) / 86400.0, 0) > 4
        )::numeric AS active_rt_over4_count,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND public.dashboard_token_is_nrt(coalesce(token_type_with_nrt, token_type))
        )::numeric AS nrt_upgrades,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND public.dashboard_token_is_pvt(coalesce(token_type, token_type_with_nrt))
        )::numeric AS pvt_upgrades,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND (
              login_ts IS NOT NULL
              OR nullif(btrim(coalesce(row_data ->> 'sheetLoginPartner', '')), '') IS NOT NULL
              OR upper(coalesce(lead_stage, '')) = 'LOGIN_COMPLETED'
            )
        )::numeric AS login_count,
        count(*) FILTER (
          WHERE token_ts IS NOT NULL
            AND login_ts IS NOT NULL
            AND extract(epoch from (login_ts - token_ts)) >= 86400
        )::numeric AS login_t1_count,
        count(*) FILTER (
          WHERE actual_delivery_ts IS NOT NULL
            AND upper(coalesce(final_payment_type, '')) = 'CF'
            AND cancellation_ts IS NULL
        )::numeric AS cf_attached_count,
        count(*) FILTER (
          WHERE cancellation_ts IS NOT NULL
        )::numeric AS cohort_cancelled_count,
        count(*) FILTER (
          WHERE cancellation_ts IS NOT NULL
            AND public.dashboard_token_is_rt(token_type)
        )::numeric AS cohort_rt_cancelled,
        count(*) FILTER (
          WHERE cancellation_ts IS NOT NULL
            AND public.dashboard_token_is_nrt(token_type)
        )::numeric AS cohort_nrt_cancelled,
        count(*) FILTER (
          WHERE cancellation_ts IS NOT NULL
            AND public.dashboard_token_is_pvt(token_type)
        )::numeric AS cohort_pvt_cancelled,
        count(*) FILTER (
          WHERE cancellation_ts IS NOT NULL
            AND is_c2d
        )::numeric AS c2d_count,
        count(*) FILTER (
          WHERE cancellation_ts IS NOT NULL
            AND is_c2a
        )::numeric AS c2a_count,
        count(*) FILTER (
          WHERE coalesce(cancellation_ts, actual_delivery_ts) IS NOT NULL
            AND is_cr2d
        )::numeric AS cr2d_count,
        avg(
          CASE
            WHEN actual_delivery_ts IS NOT NULL AND token_ts IS NOT NULL
            THEN extract(epoch from (actual_delivery_ts - token_ts)) / 86400.0
            ELSE NULL
          END
        )::numeric AS delivery_tat,
        avg(
          CASE
            WHEN cancellation_ts IS NOT NULL
              AND token_ts IS NOT NULL
            THEN extract(epoch from (cancellation_ts - token_ts)) / 86400.0
            ELSE NULL
          END
        )::numeric AS cancellation_tat
      FROM custom_enriched
    ),
    combined_metrics AS (
      SELECT * FROM metrics
      UNION ALL
      SELECT * FROM custom_metrics WHERE has_date_filter
    ),
    columns_json AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', key,
          'label', label,
          'subLabel', sub_label
        )
        ORDER BY array_position(ARRAY['mtd','last_mtd','llm','w','lw','llw','d1','d2','d3','custom_range'], key)
      ) AS value
      FROM combined_metrics
    ),
    row_specs AS (
      SELECT *
      FROM (VALUES
        (1, 'Overall', 'GD', false),
        (2, 'Overall', 'ND', false),
        (3, 'Overall', 'Unique Token (Inflow)', false),
        (4, 'Overall', 'RT Share (Overall)', true),
        (5, 'Overall', 'NRT Share (Overall)', true),
        (6, 'Overall', 'PVT Share (Overall)', true),
        (7, 'Overall', 'GCBL Share (Overall)', true),
        (8, 'Token', 'Active token (Till End Date)', false),
        (9, 'Token', 'Token Age', false),
        (10, 'Token', 'RT Share', true),
        (11, 'Token', 'RT Share (>4 Days)', true),
        (12, 'Upgrade', 'NRT Upgrade', true),
        (13, 'Upgrade', 'PVT Upgrade', true),
        (14, 'CF', 'Login on Token base', true),
        (15, 'CF', 'Login >=(T+1)', true),
        (16, 'CF', 'CF attached (%)', true),
        (17, 'Cancellation', 'Unique Token Cancellation %', true),
        (18, 'Cancellation', 'RT - Token base', true),
        (19, 'Cancellation', 'NRT - Token Base', true),
        (20, 'Cancellation', 'PVT - Token Base', true),
        (21, 'Cancellation', 'C2D', false),
        (22, 'Cancellation', 'C2A', false),
        (23, 'Cancellation', 'CR2D', false),
        (24, 'TAT', 'Delivery TAT', false),
        (25, 'TAT', 'Cancellation TAT', false)
      ) AS rows(sort_order, category, name, is_percent)
    ),
    rows_json AS (
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', rs.category,
          'name', rs.name,
          'isPercent', rs.is_percent,
          'indent', true,
          'values', metric_values.value
        )
        ORDER BY rs.sort_order
      ) AS value
      FROM row_specs rs
      CROSS JOIN LATERAL (
        SELECT jsonb_object_agg(
          m.key,
          to_jsonb(
            CASE rs.name
              WHEN 'GD' THEN m.gd
              WHEN 'ND' THEN m.nd
              WHEN 'Unique Token (Inflow)' THEN m.inflow_count
              WHEN 'RT Share (Overall)' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.rt_inflow / m.inflow_count END
              WHEN 'NRT Share (Overall)' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.nrt_inflow / m.inflow_count END
              WHEN 'PVT Share (Overall)' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.pvt_inflow / m.inflow_count END
              WHEN 'GCBL Share (Overall)' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.gcbl_inflow / m.inflow_count END
              WHEN 'Active token (Till End Date)' THEN m.active_count
              WHEN 'Token Age' THEN round(coalesce(m.avg_age, 0)::numeric, 2)
              WHEN 'RT Share' THEN CASE WHEN m.active_count = 0 THEN 0 ELSE m.active_rt_count / m.active_count END
              WHEN 'RT Share (>4 Days)' THEN CASE WHEN m.active_rt_count = 0 THEN 0 ELSE m.active_rt_over4_count / m.active_rt_count END
              WHEN 'NRT Upgrade' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.nrt_upgrades / m.inflow_count END
              WHEN 'PVT Upgrade' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.pvt_upgrades / m.inflow_count END
              WHEN 'Login on Token base' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.login_count / m.inflow_count END
              WHEN 'Login >=(T+1)' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.login_t1_count / m.inflow_count END
              WHEN 'CF attached (%)' THEN CASE WHEN m.nd = 0 THEN 0 ELSE m.cf_attached_count / m.nd END
              WHEN 'Unique Token Cancellation %' THEN CASE WHEN m.inflow_count = 0 THEN 0 ELSE m.cohort_cancelled_count / m.inflow_count END
              WHEN 'RT - Token base' THEN CASE WHEN m.rt_inflow = 0 THEN 0 ELSE m.cohort_rt_cancelled / m.rt_inflow END
              WHEN 'NRT - Token Base' THEN CASE WHEN m.nrt_inflow = 0 THEN 0 ELSE m.cohort_nrt_cancelled / m.nrt_inflow END
              WHEN 'PVT - Token Base' THEN CASE WHEN m.pvt_inflow = 0 THEN 0 ELSE m.cohort_pvt_cancelled / m.pvt_inflow END
              WHEN 'C2D' THEN coalesce(m.c2d_count, 0)
              WHEN 'C2A' THEN coalesce(m.c2a_count, 0)
              WHEN 'CR2D' THEN coalesce(m.cr2d_count, 0)
              WHEN 'Delivery TAT' THEN round(coalesce(m.delivery_tat, 0)::numeric, 2)
              WHEN 'Cancellation TAT' THEN round(coalesce(m.cancellation_tat, 0)::numeric, 2)
              ELSE 0
            END
          )
        ) AS value
        FROM combined_metrics m
      ) metric_values
    )
    SELECT jsonb_build_object(
      'columns', coalesce((SELECT value FROM columns_json), '[]'::jsonb),
      'rows', coalesce((SELECT value FROM rows_json), '[]'::jsonb)
    )
  );
END;
$$;

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

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  column_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_id ON public.audit_logs (booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_confidence_changed_at
  ON public.audit_logs (booking_id, changed_at DESC)
  WHERE column_name = 'confidenceScore';

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

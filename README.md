<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# CARS24 T2D Ops Dashboard

This repository contains the CARS24 T2D Operations Dashboard. It is a React + Vite + TypeScript single-page app that:

- authenticates operators with Supabase Google OAuth
- reads and caches T2D case data in Supabase
- uses Google Sheets as the live operational source for sheet-backed actions
- supports a demo/offline dataset when live access is unavailable

The app can be deployed on Vercel. An optional GitHub Actions workflow can sync a private Google Sheet into Supabase, but that workflow now skips cleanly when backend credentials are not configured.

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Run Locally](#run-locally)
3. [Deploy to Vercel](#deploy-to-vercel)
4. [Supabase Setup](#supabase-setup)
5. [Authentication and Access Model](#authentication-and-access-model)
6. [OAuth & Sync Architecture and Fixes](#oauth-sync-architecture-and-fixes)
7. [Optional Background Sync](#optional-background-sync)
8. [Operational Notes](#operational-notes)

## Tech Stack

- React 19
- Vite 6
- TypeScript
- Tailwind CSS 4
- Supabase Auth + Postgres
- Google Sheets API v4
- GitHub Actions for optional background sync

## Run Locally

### Prerequisites
- Node.js 18+
- npm 9+
- a Supabase project

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill in at least:
   ```env
   VITE_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
   ```

3. Start the app:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`.

### Verification
```bash
npm run lint
npm run build
```

## Deploy to Vercel

### Required Vercel Environment Variables
Set these in the Vercel project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Deployment Flow
1. Import the GitHub repository into Vercel.
2. Keep the detected framework preset as `Vite`.
3. Keep the default build command `npm run build`.
4. Keep the output directory as `dist`.
5. Add the environment variables listed above.
6. Deploy.

The repository already contains `vercel.json`, which rewrites all routes to `index.html` for SPA routing.

## Supabase Setup

To set up your Supabase database, run the complete SQL script in `supabase_schema.sql` in the Supabase SQL Editor.

### Database Components Created
The schema script configures:
1. **Tables**:
   - `dashboard_cases`: Caches the details of T2D operations cases. Stores raw payload as `row_data` (JSONB) and parses fields into structured table columns for faster queries.
   - `shared_config`: Holds the globally shared Google Spreadsheet ID (`sheet_id`) and worksheet name (`sheet_name`) for the active workspace.
   - `audit_logs`: An append-only audit trail logging user details (`changed_by`), target booking, modified columns, and old/new values.
   - `user_sessions`: Records operator logins, tracking user emails, login timestamps, and active session duration (minutes).

2. **Database Trigger and Functions**:
   - `trg_dashboard_cases_sync_structured_columns`: Runs BEFORE INSERT OR UPDATE on `dashboard_cases` to invoke the trigger function `dashboard_cases_sync_structured_columns()`. This function parses raw JSON dates/values (like `tokenDate`) into structured relational columns (such as `token_date`) automatically.
   - Custom parsing helpers like `parse_dashboard_timestamp()` and `dashboard_numeric()` handle string conversions robustly.

3. **Performance Indexes**:
   - `idx_dashboard_cases_updated_at` (descending order for sorting).
   - `idx_dashboard_cases_booking_id_lower` (case-insensitive search optimization).
   - Structured column indexes like `idx_dashboard_cases_token_date`, `idx_dashboard_cases_expected_delivery_date`, etc.
   - `idx_audit_logs_booking_id` and compound indexes for confidence trends.
   - `idx_user_sessions_email` and `idx_user_sessions_login`.

4. **Row-Level Security (RLS) Policies**:
   - **`dashboard_cases`**:
     * `Allow authenticated read`: Select queries allowed for any authenticated user.
     * `Allow authenticated write`: Inserts/updates/deletes allowed for any authenticated user.
   - **`shared_config`**:
     * `Allow authenticated read shared config`: Select allowed for authenticated users.
     * `Allow authenticated write shared config`: All operations allowed for authenticated users.
   - **`audit_logs`**:
     * `Allow authenticated write audit`: Any authenticated user can insert logs.
     * `Allow admin read audit`: Access restricted to admin users verified by the `is_admin_email()` helper (e.g., `mukesh.chaurasiya@cars24.com`, `chourasiyamukesh008@gmail.com`).
   - **`user_sessions`**:
     * `Allow admin read sessions`: Access restricted to admin users verified by the `is_admin_email()` helper.
     * `Allow authenticated insert sessions` & `Allow authenticated update own sessions`: Users can only record or update session heartbeats for their own email.

### Verification of Supabase Setup
To verify that the database schema and security constraints are correctly configured:
1. **Table Check**: Check the Supabase Database dashboard to confirm all 4 tables are present and active.
2. **RLS Verification**: Query the PostgreSQL database to confirm row security is enabled:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   -- Expected: true for dashboard_cases, shared_config, audit_logs, and user_sessions.
   ```
3. **Trigger Validation**: Insert a test record with raw JSON and verify that relational columns are automatically populated:
   ```sql
   INSERT INTO public.dashboard_cases (booking_id, row_data)
   VALUES ('TEST-12345', '{"tokenDate": "2026-06-19 10:00:00", "city": "Delhi"}'::jsonb);
   
   SELECT booking_id, token_date, city FROM public.dashboard_cases WHERE booking_id = 'TEST-12345';
   -- Expected: token_date should show '2026-06-19', and city should be 'Delhi'.
   ```
4. **RLS Policy Verification**:
   - Log in to the application dashboard with a non-admin authenticated email. Attempt to query `audit_logs` or `user_sessions` via the API/console. Supabase should return zero rows or block the request.
   - Log in with one of the configured admin emails (e.g., `mukesh.chaurasiya@cars24.com`) and navigate to the Admin Console to verify session records and system audit feeds load correctly.

## Authentication and Access Model

### Operator Login
- The frontend uses Supabase Google OAuth.
- The Google Sheets scope requested is:
  - `https://www.googleapis.com/auth/spreadsheets`

### Live Sheet Access
- Users still need Google Sheet access in order to read/write live sheet-backed data from the browser.
- A successful access verification is cached for 7 days per `user + sheet` in the browser to reduce forced re-logins.

### Access Denied Behavior
- If a signed-in user does not have permission on the configured sheet, the UI shows a restricted-access state instead of rendering live data.
- Users can still fall back to the demo dataset.

### Demo Mode
- Demo mode uses `SEED_CASE_ROWS` from `src/data/mockData.ts`.
- In demo mode, Google Sheets writes are bypassed.

## OAuth & Sync Architecture and Fixes

The application's authentication flow, multi-tab coordination, and Google Sheets synchronization have been hardened to eliminate authentication race conditions, state leakages, and synchronizer loop bugs.

### Core Architecture
- **Supabase Authentication**: Handled via Google OAuth popup integration. The system requests Google Sheets scope and forwards tokens to the client.
- **Provider Token Fallback**: Google provider tokens are transient and sent only during login redirect. The system captures and caches the token locally to persist it for session restores and API calls.
- **Auto-Sync Mechanism**: Post-login, the dashboard monitors connection state changes and automatically triggers synchronization of pending offline modifications, followed by syncing fresh case rows down from the configured Google Sheet.

### Implemented Fixes
* **OAuth Popup Bug (Synchronous Callback)**:
  * *Issue*: In `src/main.tsx`, if the OAuth redirection popup tries to close and unsubscribe from the auth listener synchronously in the `onAuthStateChange` callback, it could lead to browser execution halts or failed parent window notifications.
  * *Fix*: Defer the subscription cleanup using `setTimeout(() => { subscription.unsubscribe(); }, 0)`. This allows the listener loop to complete execution, post its `AUTH_COMPLETE` message safely to the parent window, and then unsubscribe cleanly before the window closes.
* **Credential Sync Race**:
  * *Issue*: When the parent window receives `AUTH_COMPLETE`, invoking `supabase.auth.setSession` can trigger auth state changes immediately before the provider token is parsed or saved, leading to a race condition where API calls trigger with missing credentials.
  * *Fix*: Pre-cached the Google provider token (`receivedSession.provider_token`) in the opener window's `localStorage` *prior* to executing `setSession`. Added a fallback in `getProviderToken` to retrieve the token from the cache when the Supabase session state does not supply a transient `provider_token` (such as during PKCE restores or reloads).
* **Redundant Listeners**:
  * *Issue*: Custom storage event listeners (`window.addEventListener('storage', ...)`) were manually polling localStorage to synchronize auth state across tabs, creating race conditions and redundant triggers.
  * *Fix*: Removed the custom storage listeners in `initAuth`. Supabase's native cross-tab synchronization maintains auth states reliably, reducing active listener complexity.
* **Sign-out Reset**:
  * *Issue*: Logging out did not fully reset application states or delete cached workspace credentials, allowing visual state leaks or permission bleed-throughs to subsequent users.
  * *Fix*: Added a central cleanup block in `useAuthBootstrap.ts` and `firebaseAuth.ts`. It clears the transient google provider token, removes all sheet access cache entries (`verifiedKey`, `timeKey`, `legacyVerifiedKey`, `legacyTimeKey`), resets `demoMode` to `false`, and restores the dashboard's case rows state back to the original `SEED_CASE_ROWS` mock data.
* **Auto-Sync**:
  * *Issue*: Operators had to manually sync after logging in, leading to outdated visual states.
  * *Fix*: Integrated a quiet `useEffect` hook in `App.tsx` that monitors credentials. Once `accessToken` and `sheetId` are established post-login, the app automatically triggers a sync of pending offline modifications and downloads latest rows from Google Sheets.

## Optional Background Sync

The repository includes `.github/workflows/sync-sheets.yml` and `scripts/sync-sheets.js` for syncing a private Google Sheet into Supabase.

### Current Behavior
- If the required backend secrets are missing, the workflow skips cleanly.
- This means the app can still deploy and run even when backend private-sheet sync is unavailable.

### Required GitHub Secrets to Enable Background Sync
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### If Service Accounts Are Blocked
If your org does not allow Google service accounts, leave the secrets unset. The workflow will skip and the app will continue using the browser-based Google Sheets path for authorized operators.

## Operational Notes

### Current Limitations
- The app still has large client components, especially:
  - `src/App.tsx`
  - `src/components/Dashboard.tsx`
- The production bundle is still large and `vite build` warns about chunk size.
- The background sync path is optional and not active unless backend secrets are configured.

### Current Scripts
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run preview`
- `npm run sync:sheets`

### Rollback Reference
Recent hardening changes were introduced in these commits:
- `f9a96e3` `Harden sheet sync and cache paths`
- `6344f98` `Add private sheet sync worker`
- `68948d5` `Skip private sync when secrets are missing`

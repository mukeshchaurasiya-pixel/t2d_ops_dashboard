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
6. [Optional Background Sync](#optional-background-sync)
7. [Operational Notes](#operational-notes)

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

The repository already contains [vercel.json](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/vercel.json), which rewrites all routes to `index.html` for SPA routing.

## Supabase Setup

Run the SQL in [supabase_schema.sql](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/supabase_schema.sql) in the Supabase SQL Editor before using the app.

That script creates:

- `dashboard_cases`
- `shared_config`
- `audit_logs`
- `user_sessions`
- supporting indexes and RLS policies

### Important Behavior
- `dashboard_cases` is readable without forcing login so cached/demo flows continue to work.
- audit log and session reads are restricted to the configured admin emails in the SQL helper function.
- authenticated users can write shared config and session/cache updates through the app.

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
- Demo mode uses `SEED_CASE_ROWS` from [src/data/mockData.ts](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/src/data/mockData.ts).
- In demo mode, Google Sheets writes are bypassed.

## Optional Background Sync

The repository includes [.github/workflows/sync-sheets.yml](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/.github/workflows/sync-sheets.yml) and [scripts/sync-sheets.js](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/scripts/sync-sheets.js) for syncing a private Google Sheet into Supabase.

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
  - [src/App.tsx](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/src/App.tsx)
  - [src/components/Dashboard.tsx](/abs/path/c:/Users/41157/Documents/cars24-t2d-ops-dashboard/src/components/Dashboard.tsx)
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


# Original User Request

## Initial Request — 2026-06-07T21:54:26+05:30

The goal of this project is to successfully configure and prepare the React + Vite CARS24 T2D Ops Dashboard for free hosting on Vercel, ensuring it can support up to 50 active users. Access control must be validated so that only users with Google Sheet permissions can access live data, while others see mock data in Demo Mode or are blocked with a 403 error message.

Working directory: C:\Users\41157\Documents\cars24-t2d-ops-dashboard
Integrity mode: development

## Requirements

### R1. Vercel Cloud Deployment Setup
Configure the application for hosting on Vercel by creating any required configuration files (e.g., `vercel.json`) to handle single-page application routing redirects (`/index.html`) correctly.

### R2. Access Control and Mock Data Fallback
Verify that users with access to the configured Google Sheet can fetch live data successfully upon Google Sign-In, and unauthorized/unauthenticated users are either redirected, blocked with a 403 error, or see mock data (Demo Mode) as appropriate.

### R3. Deployment and Git Integration Guide
Create a comprehensive, step-by-step README update and/or deployment guide specifically for the user to import their repository to Vercel and run it independently with no local build effort.

## Acceptance Criteria

### Build & Configuration
- [ ] A valid `vercel.json` is configured in the root directory to handle SPA routing redirects.
- [ ] The codebase builds successfully for production without any bundling errors.

### Security & Access Verification
- [ ] Double-check that Google OAuth scope (`https://www.googleapis.com/auth/spreadsheets`) is correctly requested during sign-in.
- [ ] Verify that if the Sheets API returns a 403 Forbidden error, the UI correctly displays a restricted access message and loads no live rows.
- [ ] Verify that "Explore with Seed Offline Dataset" loads mock data correctly without logging in.

### Documentation
- [ ] The repository includes clear instructions for the user on how to connect their private GitHub repo to Vercel for automatic deployment.

## Follow-up — 2026-06-18T20:21:44Z

The project aims to fix the Google OAuth sign-in / redirect flow in the Cars24 T2D Ops Dashboard so that users can successfully authenticate and synchronize sheet data.

Working directory: C:\Users\41157\Documents\cars24-t2d-ops-dashboard

## Requirements

### R1. Fix Google OAuth sign-in flow
Diagnose and resolve the issue preventing successful sign-in in the `feature/unified-side-panel` branch (currently throwing "Login window closed by user" or failing to complete credential exchange).

### R2. Enable automatic data synchronization
Ensure that once sign-in is successful, the dashboard automatically retrieves credentials and runs the sheets sync process.

## Acceptance Criteria

### Authentication Success
- [ ] Users can click "Sign in with Google" and successfully authenticate.
- [ ] The app tab automatically receives access credentials post-authentication and synchronizes data.
- [ ] Multi-tab sync works (authenticating in one tab syncs other open tabs).
- [ ] No compilation or runtime console errors during the auth flow.

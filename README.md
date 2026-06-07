<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# CARS24 T2D Ops Dashboard

This repository contains the CARS24 T2D Operations Dashboard, built with React, Vite, TypeScript, Tailwind CSS, and integrated directly with Google Sheets API v4 using Firebase Authentication.

View your app in AI Studio: [AI Studio App](https://ai.studio/apps/75c57192-5be7-4a3d-95a3-5d5a078ee81e)

---

## Table of Contents
1. [Run Locally](#run-locally)
2. [Deployment Guide (Vercel)](#deployment-guide-vercel)
3. [Firebase Console OAuth Configuration](#firebase-console-oauth-configuration)
4. [Access Control & Security Architecture](#access-control--security-architecture)

---

## Run Locally

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **NPM** (v9 or higher)

### Setup Steps
1. **Clone the Repository** (if not already done).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Set Environment Variables**:
   Create a `.env.local` file in the root directory (based on `.env.example`) and add your keys:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   # Optional: Custom Firebase API Key to override default config
   # VITE_FIREBASE_API_KEY="your-custom-firebase-api-key"
   ```
4. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser to view the application.

---

## Deployment Guide (Vercel)

This project is configured for **zero local build effort** automatic deployment on Vercel.

### Step 1: Connect Private GitHub Repository to Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click the **Add New...** button in the top right corner and select **Project**.
3. Under the **Import Git Repository** section:
   - If your GitHub account is not connected, click **Add GitHub Account** and follow the prompts.
   - If the repository is not visible in the list, click the namespace dropdown and choose **Configure GitHub App**. Grant Vercel access to either "All repositories" or specifically select the private `cars24-t2d-ops-dashboard` repository.
4. Click the **Import** button next to the `cars24-t2d-ops-dashboard` repository.

### Step 2: Configure the Vercel Project
In the project configuration screen, review the following settings:
- **Project Name**: Leave as default or customize.
- **Framework Preset**: Vercel automatically detects the configuration and selects **Vite**. Keep this selected.
- **Root Directory**: Leave as `./` (root).
- **Build and Output Settings**:
  - Keep the defaults. Vercel automatically extracts commands from `package.json`:
    - **Build Command**: `npm run build` (which runs `vite build`)
    - **Output Directory**: `dist`
    - **Install Command**: `npm install`
- **Environment Variables**:
  - Add any custom environment variables such as `GEMINI_API_KEY` or `VITE_FIREBASE_API_KEY` (if you want to override the default Firebase project config).
- **Routing Support**:
  - The project contains a root-level `vercel.json` file. This instructs Vercel to redirect all routes back to `/index.html` (Single Page Application routing), preventing `404 Not Found` errors when users refresh virtual routes.

### Step 3: Deploy
1. Click **Deploy**.
2. Vercel will clone the private repository, install dependencies, compile the TypeScript code, and host the production build.
3. Every subsequent push to the main/default branch on GitHub will automatically trigger a new deployment.

---

## Firebase Console OAuth Configuration

To support Google Auth and live Google Sheets API calls, Firebase must be configured to permit authentication from your Vercel domains.

### Step 1: Enable Google Auth Provider
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your Firebase project (e.g., `auspicious-chalice-t224x`).
3. In the left sidebar, navigate to **Build** -> **Authentication**.
4. Go to the **Sign-in method** tab.
5. Click **Add new provider**, select **Google**, toggle it to **Enabled**, set the project support email, and click **Save**.

### Step 2: Google Sheets OAuth Scopes
- The Google Sheets API full read/write scope (`https://www.googleapis.com/auth/spreadsheets`) is requested programmatically inside the React client-side code (`src/lib/firebaseAuth.ts`) using:
  ```typescript
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  ```
- **No scope registration is required in the Google/Firebase Console** since scope authorization is handled dynamically during the client-side popup consent flow.

### Step 3: Configure Authorized Domains for Vercel
To prevent unauthorized domains from invoking your Firebase authentication flow, you must whitelist your Vercel domains:
1. In the **Authentication** -> **Sign-in method** tab of the Firebase Console, scroll down to the **Authorized domains** section.
2. Click **Add domain**.
3. Enter your deployed Vercel domain (e.g., `cars24-t2d-ops-dashboard.vercel.app`). Do not include protocol prefixes (`https://`) or trailing slashes.
4. *Important Note*: Firebase Auth does not support wildcard domains (e.g., `*.vercel.app`) for OAuth callbacks. You must add each specific domain (production domains, branch domains, or preview domains) that will run the login flow. Local domains (`localhost`, `127.0.0.1`) are pre-configured by default.

---

## Access Control & Security Architecture

The dashboard is designed as a secure client-side application with no intermediate database, meaning users fetch data directly from their Google Sheets.

### 1. Spreadsheet Permissions Check
- When an operator logs in, Google Auth returns a secure OAuth 2.0 Access Token to the browser.
- The application fetches data via the official Google Sheets API v4 endpoints:
  - Fetching rows: `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{tabName}`
  - Writing manual updates: `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchUpdate`
- Google validates the bearer access token to ensure the logged-in Google Account has been granted **Viewer** or **Editor** permissions on the specific Google Sheet.

### 2. Forbidden (403) Handling & Access Restriction Screen
- If the logged-in user lacks permissions to the target spreadsheet, the Google Sheets API responds with an HTTP **403 Forbidden** status code.
- In `src/lib/sheetsService.ts`, the application catches the 403 status and throws an error indicating the account lacks appropriate rights.
- In `src/App.tsx`, the application monitors authentication and fetch errors. If a user successfully logs in but the sheet load fails (yielding `rows.length === 0` and a spreadsheet load error), the app overrides the default view and displays the **Access Restricted** screen:
  - This screen blocks access to the empty dashboard grid.
  - It displays the explicit error details (e.g., checking if the logged-in Google Account has permission).
  - It offers options to either **Explore with Seed Offline Dataset** (Demo Mode) or **Sign Out / Switch Account**.

### 3. Demo Mode & Seed Offline Dataset
- Users can bypass authentication or access restriction by clicking **Explore with Seed Offline Dataset**.
- This enables **Demo Mode** (`demoMode = true`), which loads a static mock database from `src/data/mockData.ts` (`SEED_CASE_ROWS`).
- While in Demo Mode:
  - The dashboard header displays a yellow **Demo Mode** indicator.
  - A persistent notification bar is displayed, warning that any edits made to comments, checklists, or data overrides will exist only within the current in-memory React session.
  - Google Sheets API calls are bypassed (`accessToken` is set to `null` for the dashboard components), preventing any remote writes or unauthorized read queries.

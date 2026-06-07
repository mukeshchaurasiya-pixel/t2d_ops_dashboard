# Project: CARS24 T2D Ops Dashboard Vercel Integration & Access Control

## Architecture
- **Framework**: React + Vite + TypeScript.
- **State Management & UI**: Tailwind CSS (presumably), custom components, `App.tsx` and `Dashboard.tsx`.
- **Authentication**: Firebase Authentication with Google OAuth.
- **Data Integration**: Google Sheets API for fetching live operational data.
- **Mock Data Fallback**: Demo Mode ("Explore with Seed Offline Dataset") reading from `src/data/mockData.ts`.

## Code Layout
- `src/App.tsx`: Main entry component, routes, state of authenticating user.
- `src/components/Dashboard.tsx`: Main dashboard display containing widgets, data grid, filters.
- `src/components/LoginPage.tsx`: Login UI handles sign-in flow.
- `src/lib/firebaseAuth.ts`: Firebase OAuth sign-in functions.
- `src/lib/sheetsService.ts`: Service methods to load sheets data and verify permissions.
- `src/data/mockData.ts`: seed database for offline mode.
- `src/data/csvParser.ts`: CSV parser helpers.
- `vercel.json`: Root level configuration for Vercel deployment (redirects for SPA).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Exploration & Analysis | Run code exploration to locate OAuth scopes, 403 handling, mock data trigger, and vercel.json needs. | None | DONE (IDs: f6453772-3caf-4010-827f-7accc1f817c8, fb1d109e-6993-401c-b9bf-a80b555b84bc, 9d583265-6a41-4ac4-a6bf-a216e02e7fa3) |
| M2 | Vercel & Access Control Implementation | Configure vercel.json, verify/update OAuth scopes, handle 403 sheets error with fallback screen and message, fix any build issues. | M1 | DONE (ID: afa10826-1124-47a2-b696-df7d6cead6b4) |
| M3 | Verification & Auditing | Run reviews, write/run tests, challenger audits, forensic audit to verify correctness. | M2 | DONE (IDs: 1fe15973-d47f-49d7-bdfd-80dd2563604a, 2677fcb5-419b-43cb-aa92-643abd9c1c93, 3e11d624-6a31-464d-a3a0-2cee2c7494ba, 34153380-153a-4e7c-8fff-d30190fa5abd, b7bad5bf-bc9b-4539-85fb-a96bcebfe015) |
| M4 | Documentation | Document step-by-step instructions for the user to import repository to Vercel and deploy. | M3 | DONE (ID: e605a8f3-7339-461a-9627-da521c5a3fa1) |

## Interface Contracts
### sheetsService.ts ↔ Dashboard.tsx
- Function `loadSheetsData`: Fetches active sheet data using OAuth token. Should throw/return 403 error if the user doesn't have read access to the sheet.
- Error handling: UI must catch 403 sheets error and display appropriate access-denied message without crash.

# Project: CARS24 T2D Ops Dashboard

## Current Architecture
- Frontend: React + Vite + TypeScript SPA
- Auth: Supabase Google OAuth
- Read store: Supabase Postgres cache (`dashboard_cases`)
- Live operational source: Google Sheets
- Admin data: Supabase `audit_logs` and `user_sessions`
- Optional backend sync: GitHub Actions worker in `scripts/sync-sheets.js`

## Important Runtime Notes
- Operators with Google Sheet access can use the live browser-based sheet flow.
- Access verification is cached for 7 days per `user + sheet`.
- Demo mode uses `src/data/mockData.ts`.
- Private-sheet background sync is optional and skips cleanly when secrets are absent.

## Key Files
- `src/App.tsx`: top-level auth, sync, config, admin view
- `src/components/Dashboard.tsx`: filters, table, edit flow, exports
- `src/lib/firebaseAuth.ts`: Supabase auth wrapper
- `src/lib/supabaseDb.ts`: cache, sessions, audit persistence
- `src/lib/sheetsService.ts`: Google Sheets read/write helpers
- `src/data/caseRowSchema.js`: shared sheet-column mapping
- `scripts/sync-sheets.js`: optional private-sheet sync worker
- `supabase_schema.sql`: DB schema and RLS

## Milestones for OAuth & Sync Fix (Follow-up)
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M5 | OAuth & Sync Diagnosis | Spawn 3 explorers to analyze popup close, credential exchange & auto-sync | None | DONE |
| M6 | OAuth & Sync Implementation | Apply changes for popup/redirect auth flow, sync triggers, and multi-tab sync | M5 | DONE |
| M7 | Verification & Audit | Validate auth popup, multi-tab sync, clean build, and Forensic Audit | M6 | DONE |
| M8 | Documentation Update | Update README and verify no console/runtime compilation errors | M7 | DONE |

## Open Engineering Debt
- `src/App.tsx` and `src/components/Dashboard.tsx` are still too large.
- The production bundle is still larger than ideal.
- Background private-sheet sync requires backend credentials that may not be available in all environments.

# PRD v2: Unified Booking Side Panel

## Summary
This revision defines the booking side panel against the actual runtime contract used by the app:

- `dashboard_cases.row_data` is the primary payload for the panel.
- Structured Supabase columns are used where available for filtering, sorting, and rendering.
- Workbook-only fields are treated as optional/raw-only unless the schema is expanded later.
- The panel is optimized for fast operator scanning, edit safety, and explicit blank-state handling.

## Data Contract

### Runtime Source Hierarchy
1. `dashboard_cases.row_data`
2. Structured `dashboard_cases` columns
3. Audit stream from `audit_logs`
4. Workbook-only or raw-only fields from `row_data` when present

### Field Rules

| UI area | Label / field | Primary source | Fallback source | Editable | Blank behavior | Persistence target |
|---|---|---|---|---|---|---|
| Header | Booking ID | `booking_id` | `row_data.bookingId` | No | Always show if present | N/A |
| Header | Car reg no | `row_data.carRegNo` | N/A | No | Hide when blank | N/A |
| Header | Vehicle make/model/variant | `row_data.make`, `row_data.model`, `row_data.variant` | N/A | No | Hide entirely if all blank | N/A |
| Header badges | `lead_stage` | structured `lead_stage` | `row_data.leadStage` | No | Hide when blank | N/A |
| Header badges | `token_type` | structured `token_type` | `row_data.tokenType` | No | Hide when blank | N/A |
| Header badges | `lead_status` | `row_data.leadStatus` | N/A | No | Hide when blank | N/A |
| Header badges | `deal_status` | structured `deal_status` | `row_data.dealStatus` | No | Hide when blank | N/A |
| Blocker banner | Cancel request date | structured `cancel_req_date` | `row_data.cancelReqDate` | No | Banner hidden if blank | N/A |
| Blocker banner | Cancel reason | `row_data.cancelReason` | `row_data.reason` | No | Default to `System Auto-Cancelled / No Explicit Reason Logged` when missing | N/A |
| Action block | Ready to Deliver? | `row_data.readyToDeliver` | structured `ready_to_deliver` | Yes | Hide label if blank | Sheets + Supabase |
| Action block | Expected OD Completion Date | `row_data.expectedOdCompletionDate` | structured `expected_od_completion_date` | Yes | Hide label if blank | Sheets + Supabase |
| Action block | EDD Date (Reviewer) | `row_data.eddReviewerDate` | structured `edd_reviewer_date` | Yes | Hide label if blank | Sheets + Supabase |
| Action block | Add Remark | append-only remark editor | `row_data.reviewerRemarks` | Yes | Blank input only; never preload editable area with log text | Sheets + Supabase |
| Read-only context | Latest remark | `row_data.latestRemark` | `row_data.reviewerRemarks` first line | No | Hide if blank | N/A |
| Read-only context | Recent context feed | `row_data.reviewerRemarks` | N/A | No | Omit system-style variable logs from this feed | N/A |
| Milestones | Lead Created | `row_data.latestLeadCreationTimestamp` | N/A | No | Hide if blank | N/A |
| Milestones | Case Logged In | `row_data.latestLoginTime` | `row_data.sheetLoginTimestamp` | No | Hide if blank | N/A |
| Milestones | Credit Assessed | `row_data.latestCreditAssessedTimestamp` | N/A | No | Hide if blank | N/A |
| Milestones | Diligence Assessed | `row_data.latestDiligenceAssessedTimestamp` | N/A | No | Hide if blank | N/A |
| Milestones | T&C Accepted | `row_data.tncAcceptedTimestamp` | N/A | No | Hide if blank | N/A |
| Milestones | FCU Checked | `row_data.latestFcuAssessedTimestamp` | N/A | No | Hide if blank | N/A |
| Milestones | Submitted to Ops | `row_data.submitToOpsTimestamp` | N/A | No | Hide if blank | N/A |
| Milestones | Finance Disbursed | `row_data.financeDisbursedTimestamp` | N/A | No | Hide if blank | N/A |
| CRM accordion | Attempts / Connected | `row_data.totalCallAttempts`, `row_data.totalConnectedCalls` | N/A | No | Hide if both blank/zero | N/A |
| CRM accordion | Latest outcome | `row_data.latestCallOutcome` | `row_data.aggLatestCallOutcome` if present in raw data | No | Hide if blank | N/A |
| Finance accordion | Payment type | `row_data.paymentType` | N/A | No | Hide if blank | N/A |
| Finance accordion | Credit LTV / ROI | `row_data.creditLtv`, `row_data.dsRoi`, `row_data.finalRoi` | N/A | No | Hide if blank | N/A |
| Finance accordion | Sales price | `row_data.agreedSalesPrice` | N/A | No | Hide if blank | N/A |
| Ops accordion | Hub / city / yard | `row_data.hubName`, `row_data.city`, `row_data.sheetYardName` | `row_data.sheetYardCity` | No | Hide any blank field individually | N/A |
| Ops accordion | Delivery params | `row_data.expectedDeliveryDate`, `row_data.actualDeliveryDate`, `row_data.deliverySegment`, `row_data.deliveryStatus` | `row_data.expectedDeliveryTime` as raw-only | No | Hide any blank field individually | N/A |
| AI accordion | Confidence score | `row_data.confidenceScore` | N/A | No | Hide entire accordion if blank | N/A |
| AI accordion | ML estimated delivery date | `row_data.mlEstimatedDeliveryDate` | N/A | No | Hide if blank | N/A |
| AI accordion | Gmail pendency status / reason | `row_data.gmailPendencyStatus`, `row_data.gmailPendencyReason` | N/A | No | Hide if blank | N/A |
| Revision history | Field diffs | `audit_logs` | N/A | No | Show empty state if no logs | N/A |

### Workbook-Only / Raw-Only Fields
These are allowed in `row_data` and the PRD may surface them only when present, but they are not required by the structured Supabase schema:

- `leadStatus`
- `dealStatusUpdatedAt`
- `callResponsePercentage`
- `loginFlag`
- `creditApprovalFlag`
- `dcApprovalFlag`
- `fcuApprovalFlag`
- `agreementFlag`
- `deliverySegment`
- any other workbook export artifact not mapped into `dashboard_cases`

## Panel Composition

### 1. Sticky Header
The header must remain pinned while the side panel scrolls.

Required elements:
- booking ID
- car registration number
- vehicle make/model/variant
- four status pills:
  - `lead_stage`
  - `token_type`
  - `lead_status` when present
  - `deal_status`
- quick actions:
  - click-to-call
  - WhatsApp redirect
  - copy record link

### 2. Critical Blocker Banner
Render only when at least one blocker exists.

Trigger conditions:
- `cancel_req_date` is present
- `credit_rejection_reason` contains text
- `diligence_rejection_reason` contains text

Display rules:
- show cancellation date and reason in a high-visibility amber/red banner
- if `cancel_req_date` exists but no reason exists, use:
  - `System Auto-Cancelled / No Explicit Reason Logged`
- show rejection reasons in bold when present

### 3. Action and Execution Block
This section is always visible and must be placed above the read-only context feed.

Editable fields:
- Ready to Deliver?
- Expected OD Completion Date
- EDD Date (Reviewer)
- Add Remark

Editor rules:
- these are the only write-access fields in the side panel
- date inputs may use browser date pickers, but persisted values must remain DD/MM/YYYY for Sheets
- the Add Remark box must start blank and must never preload the full remark history
- save action appends a new remark line, it does not overwrite the prior log
- button label: `Save & Sync to Spreadsheet`

### 4. Latest Remark and Context Feed
Show the latest human-readable remark prominently, then show a short chronological feed below it.

Parsing rules:
- hide system-generated field-change strings from this feed
- preserve manual conversational remarks
- keep the feed read-only

### 5. Lead Milestones Tracker
Show the journey as a compact stepper.

Behavior:
- completed stages use green check marks
- current active stage uses blue highlighting
- future or null stages remain muted
- if a stage lacks a value, it should not render a fake date

### 6. Underwriting, Finance, Ops, and AI Accordions
These remain read-only and should be grouped by the existing domain split.

Accordion rules:
- CRM & Journey Health starts open
- Finance & Underwriting starts closed
- Ops & Logistics starts closed
- AI Co-Pilot & ML is hidden when `confidence_score` is blank

Content rules:
- render only non-empty fields
- keep labels short and operator-oriented
- do not expose workbook noise or empty technical placeholders

### 7. Revision History
Revision History must be split into two explicit streams:

1. Human remarks
   - parsed from the append-only remarks cell
   - rendered as a chronological context feed

2. Audit diffs
   - sourced from `audit_logs`
   - grouped by field
   - show old/new values with operator and timestamp

Diff rules:
- old values render as muted red with a minus prefix
- new values render as muted green with a plus prefix
- blank old values render as `- Empty`
- blank new values render as `+ Empty`

## Date and Formatting Rules

- UI date controls may use browser date inputs for ease of use.
- On write, Sheets-bound date fields must serialize to DD/MM/YYYY.
- Supabase typed columns remain `date` or `timestamptz` as defined in the schema.
- Structured DB reads should use typed values where possible instead of parsing display strings.

## Non-Goals

- Adding new Supabase columns
- Promoting workbook-only fields to required structured columns
- Reintroducing dark mode in the side panel
- Turning the read-only accordions into editable forms

## Test Plan

- Validate the revised PRD against `supabase_schema.sql` and the current `CaseRow` shape.
- Verify every field in the Data Contract is either structured, present in `row_data`, or explicitly marked raw-only.
- Confirm the PRD does not require fields that the DB does not store.
- Verify the panel order matches the current `CaseDetailsSidebar.tsx` behavior.
- Confirm the only editable fields are the four write-access controls listed above.

## Assumptions

- `dashboard_cases` is the canonical runtime source for the panel.
- Google Sheets remains the upstream operational source, but the PRD describes the panel in DB terms.
- `audit_logs` remains the source of truth for structural field diffs.
- No schema migration is included in this PRD revision.

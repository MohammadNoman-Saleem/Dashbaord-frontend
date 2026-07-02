# Saleem Web: Project Status

The self-contained Saleem internal dashboard and the medical-travel
case-manager **cockpit**. Next.js 16 (App Router) + React 19 + TypeScript,
Tailwind v4, TanStack Query, lucide-react. The backend lives in this app's own
route handlers under `app/api/*` (the `{ data, meta }` envelope). This document
is the single status reference: what the app is, what is implemented, and what
remains before go-live.

Last updated: 2026-06-27.

---


## 1. What this app is

- The internal dashboard UI plus its own API. Route groups `app/(auth)` (login)
  and `app/(dash)` (the dashboard shell + pages); the API is `app/api/*`.
- One data seam: `lib/api/fetcher.ts` (`fetchEnvelope`, `mutateEnvelope`),
  with a per-endpoint `fixture | live` switch in `config/endpoints.ts`. A
  panel never knows which it got. All cockpit endpoints are `live`; the
  fixtures stay type-aligned for dev smoke and the contract guard.
- Contract types are hand-written in `lib/api/contract.ts`.
- API origin via `NEXT_PUBLIC_API_BASE`, which **defaults to same-origin `''`**
  (the API is this app's own route handlers, so requests hit `/api/*` on the
  same host); requests use `credentials: 'include'` for the `saleem_session`
  cookie.
- Privacy: `PatientRef` (`components/ui/PatientRef.tsx`) is the only file
  allowed to render `patient_name` (CI enforced). The API only sends the name,
  patient phone, and WhatsApp message to viewers with `sees_patient_names`
  (Fatima, Razan), so the UI shows them only to those viewers. Name-seers see
  the patient name with the Zoho ID/case reference together; everyone else
  sees the ID and initials.
- **Budget exception**: `patient_budget` is intentionally surfaced to all
  signed-in staff, not gated to name-seers. The cockpit service sets it on the
  case file unconditionally (only name, phone, and WhatsApp message sit behind
  the name-seer gate). This is an accepted exception to the name-seer gating,
  decided 2026-06-27: budget is treatment-planning data the whole case team
  needs, and it carries no patient identity on its own.

## 2. The cockpit case file

`app/(dash)/cockpit` + `components/cockpit/`. The queue, parked pool, and the
per-case file. The cockpit **defaults to showing every active lead and deal to
every viewer** (the queue and parked routes pass `person='all'` unless an
explicit `?person=` is given), so a case manager sees all cases regardless of
owner and nothing is missed. The case file carries gated write controls.

The cockpit write path is **one-step, direct to Zoho**: a single POST per change
to `/api/cockpit/case/[id]/write`, where the route validates, writes to Zoho,
and audits in one call. The earlier two-step prepare/commit write gate was
removed. Nothing writes until the case manager confirms in the UI, and the
route still refuses unless `WRITE_GATE_ENABLED` is on server-side.

| Control | File | Applies to | State |
|---|---|---|---|
| Send first contact | `SendFirstContact.tsx` | deals (first-contact step) | shipped |
| Set follow-up date | `SetFollowUp.tsx` | deals | shipped |
| Move stage | `StageMove.tsx` | deals (loss reason + double confirm into Lost) | shipped |
| Edit case details (budget, treatment dates) | `EditCaseDetails.tsx` | deals | shipped |
| Lead actions (convert / status / park) | `LeadActions.tsx` | leads | shipped |
| WhatsApp click-to-chat | in `CaseFile.tsx` | deals, name-seers | shipped |
| Mark an event (manual SLA stamps) | `MarkEvents.tsx` | deals | commented out |
| Build quotation | `BuildQuotation.tsx` | deals, name-seers | disabled |
| Draft + build referral | `DraftReferral.tsx` | deals, name-seers | disabled |

- **WhatsApp** is a `wa.me` deep link built from the case's `patient_phone`
  and a step-aware `whatsapp_message`. It opens WhatsApp to the patient's chat
  with the message pre-filled; the case manager reviews and sends from their own
  WhatsApp. There is no backend call. It renders only for name-seers and only
  when a number is on file.
- **MarkEvents** (the manual SLA stamp control) is **commented out** in
  `CaseFile.tsx` (the import and the render site). The SLA is now status-based,
  so the case manager no longer marks events by hand. It is kept importable for
  an easy revert.
- **Build quotation / draft referral** are **disabled**: `CaseBody` hardcodes
  `canUseDocuments = false`, so neither control renders. Document generation is
  deferred. There are **no `/api/documents/*` routes** in this app; the
  `documents_*` endpoint keys exist in `config/endpoints.ts` but have no live
  route behind them. Restore by reverting `canUseDocuments` to
  `data.record_type === "deal" && seesNames` once the document routes land.
- **Lead actions**: Convert to deal (pipeline + stage pickers, Zoho lead
  conversion), update status, and park. Changing a dropdown does nothing until
  Review change → confirm.

## 3. SLA model (status-based)

The SLA is **status-based and shipped** (`lib/server/services/sla.ts`,
2026-06-25). Every active clock is driven by one anchor, the time the record
entered its current status/stage: a deal's `Stage_Entry_Date`, a lead's
`Last_Status_Change` (with the created time as a proxy when the status-change
time is missing). No manual event stamps drive the clock, which is why
MarkEvents was removed. The queue is sorted by this SLA, and the authored SLA
policy tables are served verbatim through `cockpit_sla_policy`.

## 4. Provider board

`app/(dash)/provider-board` + `components/provider-board/` + the API under
`app/api/provider-board/*`, backed by Supabase (migration
`0022_provider_board_custom_hospitals.sql`). The hospital-by-hospital board:
GET the board, POST a patient onto a column, DELETE a card. The whole board is
gated to name-seers server-side. **Shipped.**

## 5. Shell and other pages

- `components/shell/` AppShell + Sidebar. Sidebar footer has the person block
  (with view-as for permitted roles) and a **Sign out** button (clears the
  session and returns to login).
- Other pages (Command Center, Cases & Pipeline, Board, Funnels, Marketing,
  Financials, KPIs, Agents, Payouts, Admin) are built and live.

## 6. Quality gates (CI)

`npm run ci` runs: `check:dashes` (no em/en dashes), `check:red` (no color
literals outside tokens), `check:hype` (no hype words), `check:patient`
(patient PII fields confined per field: `patient_name` only in `PatientRef.tsx`
and `BuildQuotation.tsx`; `patient_phone` and `whatsapp_message` only in
`CaseFile.tsx`; scan covers `app/` and `components/`), `typecheck`, `lint`. The
`smoke:fixtures` and `build` scripts are separate.

## 7. Implemented

- The cockpit case file with the shipped write controls above: send first
  contact, set follow-up, stage move, edit case details, lead
  convert/status/park, and WhatsApp click-to-chat. All write through the
  one-step direct-to-Zoho route, gated by role and by the server-side
  `WRITE_GATE_ENABLED` flag.
- The cockpit shows all leads and deals to every viewer by default.
- Status-based SLA (queue sort + authored policy tables).
- The provider board.
- Name-seer privacy gating for patient name, phone, and WhatsApp message;
  `patient_budget` deliberately ungated (section 1).
- Sign out; the rest of the dashboard pages.

## 8. Deferred / not shipped

- **Document generation (quotation + referral)**: disabled via
  `canUseDocuments = false`; no `/api/documents/*` routes exist. This is the
  main deferred surface.
- **Manual SLA event stamps (MarkEvents)**: commented out; superseded by the
  status-based SLA.
- Possible follow-ups: WhatsApp link on leads too (currently deals-only); a
  document list / download history in the case file once document generation is
  enabled; richer referral editing.
- Note: a few CRM phone numbers lack a country code and will not deep-link
  correctly in WhatsApp until corrected in Zoho (a data issue, not a UI one).

## 9. How to run locally

```
npm install
npm run dev            # http://localhost:3000
```
The API is same-origin (`app/api/*`), so no separate backend host is needed;
`NEXT_PUBLIC_API_BASE` stays unset (defaults to `''`). Log in as Fatima or
Razan to see patient names, phone numbers, and the name-seer surfaces. The
write controls require `WRITE_GATE_ENABLED=true` server-side.

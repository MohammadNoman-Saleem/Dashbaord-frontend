# Saleem Web: Project Status

Frontend for the Saleem internal dashboard and the medical-travel case-manager
**cockpit**. Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4,
TanStack Query, lucide-react. Talks to `saleem-api` over the `{ data, meta }`
envelope. This document is the single status reference: what the app is, what
is implemented, and what remains before go-live.

Last updated: 2026-06-20.

---

## 1. What this app is

- The internal dashboard UI. Route groups `app/(auth)` (login) and
  `app/(dash)` (the dashboard shell + pages).
- One data seam: `lib/api/fetcher.ts` (`fetchEnvelope`, `mutateEnvelope`),
  with a per-endpoint `fixture | live` switch in `config/endpoints.ts`. A
  panel never knows which it got. All cockpit endpoints are `live`; the
  fixtures stay type-aligned for dev smoke and the contract guard.
- Contract types are hand-written in `lib/api/contract.ts` and verified
  against the backend's OpenAPI.
- Backend origin via `NEXT_PUBLIC_API_BASE` (defaults to
  `http://localhost:4000`); requests use `credentials: 'include'` for the
  `saleem_session` cookie.
- Privacy: `PatientRef` (`components/ui/PatientRef.tsx`) is the only file
  allowed to render `patient_name` (CI enforced). The API only sends the name,
  patient phone, and WhatsApp message to viewers with `sees_patient_names`
  (Fatima, Razan), so the UI shows them only to those viewers. Name-seers see
  the patient name with the Zoho ID/case reference together; everyone else
  sees the ID and initials.

## 2. The cockpit case file

`app/(dash)/cockpit` + `components/cockpit/`. The queue, parked pool, and the
per-case file. The case file now carries gated write controls, each following
the same prepare → confirm modal → commit pattern against the backend write
gate (nothing writes until the case manager confirms; the server enforces the
`WRITE_GATE_ENABLED` flag):

| Control | File | Applies to |
|---|---|---|
| Set follow-up date | `SetFollowUp.tsx` | deals |
| Move stage | `StageMove.tsx` | deals (loss reason + double confirm into Lost) |
| Mark an event (4 SLA stamps) | `MarkEvents.tsx` | deals |
| Edit case details (budget, treatment dates) | `EditCaseDetails.tsx` | deals |
| Build quotation | `BuildQuotation.tsx` | deals, name-seers |
| Draft + build referral | `DraftReferral.tsx` | deals, name-seers |
| Lead actions (convert / status / park) | `LeadActions.tsx` | leads |
| WhatsApp click-to-chat | in `CaseFile.tsx` | deals, name-seers |

- **WhatsApp** is a `wa.me` deep link built from the case's `patient_phone`
  and a step-aware `whatsapp_message` (decision step gets the final-response
  chase). It opens WhatsApp to the patient's chat with the message pre-filled;
  the case manager reviews and sends from their own WhatsApp. It renders only
  for name-seers and only when a number is on file. This replaced the old
  disabled "Send on WhatsApp / Snooze / Coming soon" placeholder.
- **Build quotation / referral** call the backend, receive the DOCX as base64,
  and trigger a browser download. Referral is a two-step flow: draft from
  pasted report text, review/edit the clinical sections, then build (the
  backend's Razan-clearance reminder shows in the review step).
- **Lead actions**: Convert to deal (pipeline + stage pickers, Zoho lead
  conversion), update status, and park. Changing a dropdown does nothing until
  Review change → confirm.

## 3. Shell and other pages

- `components/shell/` AppShell + Sidebar. Sidebar footer has the person block
  (with view-as for permitted roles) and a **Sign out** button (clears the
  session and returns to login).
- Other pages (Command Center, Cases & Pipeline, Board, Funnels, Marketing,
  Financials, KPIs, Agents, Admin) are built and live, unchanged by the
  cockpit work.

## 4. Quality gates (CI)

`npm run ci` runs: `check:dashes` (no em/en dashes), `check:red` (no color
literals outside tokens), `check:hype` (no hype words), `check:patient`
(`patient_name` only in `PatientRef`), `typecheck`, `lint`. The `smoke:fixtures`
and `build` scripts are separate and not yet chained into `ci`, and no CI
workflow enforces any of these yet (see `docs/GO_LIVE_REMEDIATION.md`, FE-CI-1).

## 5. Implemented

- The full cockpit case-file control set above, gated by role and by the
  server-side write flag.
- WhatsApp click-to-chat, quotation generation, referral draft + build, lead
  conversion/status/park.
- Name-seer privacy gating throughout; name + ID shown together for Fatima and
  Razan.
- Sign out; the rest of the dashboard pages.

## 6. What is left

- **Go-live is server-side**: all frontend endpoints are already `live`, so
  the controls light up as the backend flags are flipped
  (`WRITE_GATE_ENABLED`, `DRIVE_DOCS_ENABLED`, `REFERRAL_AI_DRAFTING_ENABLED`)
  and the viewer is a name-seer. No frontend cutover switch remains for these.
- Deferred / possible follow-ups:
  - WhatsApp link on leads too (currently deals-only; leads get
    convert/status/park by design).
  - A document list / download history in the case file once Drive storage is
    enabled (today documents download directly; Drive storage is behind the
    backend `DRIVE_DOCS_ENABLED` flag pending residency sign-off).
  - Richer referral editing (the dated-group `functional_findings` is edited
    as plain text in v1).
- Note: a few CRM phone numbers lack a country code and will not deep-link
  correctly in WhatsApp until corrected in Zoho (a data issue, not a UI one).

## 7. How to run locally

```
npm install
npm run dev            # http://localhost:3000
```
Point at the backend with `NEXT_PUBLIC_API_BASE` if it is not on
`http://localhost:4000`. Log in as Fatima or Razan to see patient names,
phone numbers, and the document controls. The write controls require the
backend's `WRITE_GATE_ENABLED=true`.

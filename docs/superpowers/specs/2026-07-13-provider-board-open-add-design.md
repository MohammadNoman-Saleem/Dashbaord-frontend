# Provider board: open viewing and adding to everyone

Date: 2026-07-13
Branch: feature/provider-board-open-add
Status: approved design

## Goal

Let every signed-in person view the provider board and add a patient to a
hospital column, not just viewers who can see patient names. Patient names stay
hidden from non-name-seers throughout (per-field gate plus the global sweep).

## Starting point and the base-branch decision

Two different states of the provider board exist in the repo:

- `origin/main`: the whole board is name-seer gated. `page.tsx` shows a
  "Restricted" note, the GET route 403s non-name-seers, and the nav item is
  hidden for them.
- Commit `59f2ca9` (on `origin/debug/cockpit-sla-freshness` and
  `feature/commission-rules-admin`, not yet merged to main): opens the board to
  all for viewing, adding hospitals, and removing cards, but keeps "add patient"
  name-seer only because it is driven by the name-seer-gated patient search.

This branch is based on `origin/main` by decision, and folds in the
provider-board half of `59f2ca9` (open the board to all) plus the new work
(open "add patient" to all by Zoho reference). The financials/payouts/access
half of `59f2ca9` is out of scope and is not reproduced here.

Merge note: because this reproduces the provider-board changes from `59f2ca9`,
merging both lines into main later may need a manual reconcile on the provider
board files. Accepted by the requester.

## What changes

### Reopen the board to all (provider-board half of 59f2ca9)

- `app/(dash)/provider-board/page.tsx`: render `<ProviderBoard />` for every
  signed-in viewer (drop the name-seer gate and the "Restricted" card).
- `app/api/provider-board/route.ts` GET: drop `assertNameSeer`. Names are gated
  per-field in the service and the global sweep is the backstop.
- `app/api/provider-board/[id]/route.ts` DELETE and
  `app/api/provider-board/hospital/route.ts` POST: drop `assertNameSeer`, keep
  person-only.
- `components/shell/Sidebar.tsx`: show the "Provider board" nav item to
  everyone (remove the `seesNames` gate on that item only). Leave the
  financials nav item as `origin/main` has it.

### Open "add patient" to all, by Zoho reference (new work)

The write itself is safe to open: it needs only a hospital, a record reference,
and a kind, validates the record against the live Zoho reads, and audits ids and
kind only, never a name. Only the name/phone patient search stays name-seer
gated (unchanged).

- `app/api/provider-board/route.ts` POST: drop `assertNameSeer`, keep
  person-only. Make `record_kind` optional in the request schema. Audit the
  resolved kind and resolved internal id (not the raw input reference).
- `lib/server/services/provider-board.ts` `addReferral`: accept an optional
  `record_kind`. Add a resolver that maps the entered reference to a record by
  matching against BOTH the internal record id and the `Zoho_ID` field. When the
  kind is provided (name-seer search flow) it matches within that collection.
  When the kind is omitted (add-by-reference flow) it auto-detects: internal-id
  match first (deals then leads), then `Zoho_ID` match (deals then leads). It
  stores the resolved internal id and kind, and returns them so the route can
  audit the resolved values. Zoho record ids are unique across modules, so a
  reference resolves to at most one record.
- `components/provider-board/ProviderBoard.tsx`: show "Add patient" (top button
  and per-column) to everyone. Name-seers open the existing `AddReferralModal`
  (name/phone/id search). Non-name-seers open the new `AddByReferenceModal`.
- `components/provider-board/AddByReferenceModal.tsx` (new): pick a hospital,
  enter the Zoho reference shown on a card or in the case file, submit. No
  search, no patient name anywhere in the file. Posts `{ hospital_id, zoho_id }`
  with no `record_kind`; the server infers the kind. Surfaces the server's
  plain-language errors ("That Zoho reference was not found in leads or deals.",
  "That patient is already on this hospital column.").
- `config/endpoints.ts`: refresh the now-stale `provider_board` comment.

### Out of scope (unchanged)

- `/api/cockpit/search` (name/phone/id patient search): stays name-seer gated.
- The cockpit case-file Hospitals section.
- Financials, payouts, and the `lib/access.ts` financials gate.

## Data flow (add by reference)

1. Non-name-seer clicks "Add patient" on the board -> `AddByReferenceModal`.
2. They pick a hospital and paste the Zoho reference from a card or the case
   file, then submit.
3. `POST /api/provider-board` with `{ hospital_id, zoho_id }` (person-only).
4. The service resolves the reference to a record and kind, validates the
   hospital, checks for a duplicate on that column, inserts, and returns
   `{ id, record_kind, zoho_id }`.
5. The route audits actor, action, resolved kind, resolved id, hospital id.
   Never a name.
6. The board query is invalidated and the new card appears (anonymized ref for
   non-name-seers).

## Privacy and compliance

This widens who can create a patient-to-hospital link to every signed-in person.
Names are never exposed to non-name-seers (per-field gate plus global sweep), the
name/phone search stays gated, and the audit stays ids-and-kind only. The board
already shows these links anonymized to everyone under the reopen, so the write
is consistent with what non-name-seers can already see.

## Verification

- `npm run ci` (this repo has no unit-test runner; CI is the check scripts plus
  tsc plus eslint, including the dash, red, hype, and patient_name checks).
- Drive the flow: as a non-name-seer, add by reference (valid id, valid Zoho_ID
  ref, and a bad reference for the error path); as a name-seer, confirm the
  existing search add still works; confirm `/api/cockpit/search` still 403s a
  non-name-seer.

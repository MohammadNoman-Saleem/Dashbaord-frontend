# Case file hospital links (send a patient to hospitals from the cockpit)

Date: 2026-07-05
Status: approved, implementing

## Problem

From the cockpit Case file panel, a case manager should be able to add the open
patient to one or more hospitals, the same way she adds a tag today. One patient
can be linked to many hospitals.

## Key finding: the link already exists

The patient to hospital link is not new. The Provider board already records it in
the Postgres `provider_referrals` table: which patient (a Zoho lead or deal) was
sent to which hospital, one active row per hospital, soft removed, with a waiting
clock. The service (`ProviderBoardService.addReferral` / `removeReferral` in
`lib/server/services/provider-board.ts`) and the routes (`POST /api/provider-board`,
`DELETE /api/provider-board/[id]`) already do the writes, gated to name-seers and
audited with ids only.

So this feature is a new control in the case file that reads and writes those same
referrals. Nothing about the data model changes.

## Approach

Load the case file's hospital links as its own case sub-resource, exactly like the
Notes panel already does in the same component, rather than embedding them in the
cached Zoho case DTO. Provider links are Postgres data on a separate change cycle,
so a separate read keeps the boundary clean.

The add and remove reuse the existing provider-board endpoints so their gating and
audit are not duplicated. Only a lightweight per-patient read is new.

## Scope

In scope:
- A name-seer only "Hospitals" section in the case file: the linked hospitals as
  removable chips, plus a dropdown of pickable hospitals and an Add button.
- Add and remove keep the case file and the provider board in sync.

Out of scope for v1 (matches the board's Add referral flow, which is pick only):
- Creating a brand new custom hospital from the case file. That stays on the
  provider board. Easy to add later via `POST /api/provider-board/hospital`.
- Showing the waiting clock or status per hospital in the case file. The board is
  the place for that; the case file shows a compact chip list.

## Backend

`lib/server/services/provider-board.ts`:
- Extract `buildHospitalColumns(hospitalRecords, customHospitals)` from `getBoard`
  (the dedup by name plus custom-hospital columns), returning
  `{ hospitals, repByRecordId, columnIds }`. `getBoard` calls it; behavior
  unchanged.
- Add `listHospitals(): Promise<ProviderBoardHospital[]>`: the deduped pickable
  hospital list (Zoho directory plus board custom hospitals), sorted by name.
- Add `referralsForPatient(zohoId): Promise<Array<{ referral_id, hospital_id,
  hospital_name }>>`: the patient's active links.

New route `app/api/cockpit/case/[id]/providers/route.ts` (GET), sibling to the
existing `write` and `notes` routes. `[id]` is the patient Zoho id. Returns
`{ linked, available }`. Gated to name-seers (`viewerMustNotSeePii`), same as the
board read. No new write route: the client reuses `POST /api/provider-board` and
`DELETE /api/provider-board/[id]`.

## Types and keys

`lib/api/contract.ts`:
```
export interface CaseProviderLink {
  referral_id: string
  hospital_id: string
  hospital_name: string
}
export interface CaseProvidersData {
  linked: CaseProviderLink[]
  available: Array<{ id: string; name: string; country: string }>
}
```

`config/endpoints.ts`: register `cockpit_case_providers` as `live` (the GET route
is real). Writes reuse the existing `provider_board` key.

`lib/api/keys.ts`: add `cockpitCaseProviders: (id) => ['cockpit', 'case', id,
'providers']`.

## Frontend

`components/cockpit/useCaseProviders.ts`:
- `useCaseProviders(caseId, enabled)`: reads `CaseProvidersData` from the new GET.
- `useCaseProviderWrite(caseId, recordKind)`: an add mutation
  (`POST /provider-board` with `{ hospital_id, record_kind, zoho_id: caseId }`) and
  a remove mutation (`DELETE /provider-board/{referral_id}`). Both invalidate
  `qk.cockpitCaseProviders(caseId)` and `qk.providerBoard()` so the board stays in
  sync.

`components/cockpit/CaseProviders.tsx`: mirrors `CaseTags`. Chips for the linked
hospitals each with a remove (x), and an add control that is a hospital dropdown
(`FieldSelect`, like the board's Add referral modal) with already-linked hospitals
filtered out, plus an Add button. Loading, empty ("Not sent to any hospital yet"),
and error states in the cockpit style.

`components/cockpit/CaseFile.tsx`: render `<CaseProviders caseId=
{data.lead_ref.zoho_id} recordKind={data.record_type} />` inside the `seesNames`
guard, as its own section near "Partners on this case". Works for deals and leads.

## Privacy and gating

Which hospital a patient was sent to is patient health data, so the whole section
is name-seer only, on the client (`seesNames`) and the server (the new GET and the
reused board endpoints all enforce `viewerMustNotSeePii`). Writes stay person only
(the service viewer is rejected). Audit records ids and kind only, never a name,
which the reused endpoints already do. No patient name flows through this feature;
identity is by Zoho id only.

## Error handling

- Add: the service rejects a duplicate link with a plain conflict message; the
  dropdown also hides already-linked hospitals so a double-add is hard to trigger.
- Remove: conservative. The chip stays until the server confirms, then the refetch
  drops it, mirroring the tag control.
- Network or server errors surface as a toast with the plain server message.

## Verification

The repo has no service unit-test runner (only `npm run ci` for house rules,
typecheck and lint, plus smoke fixtures). Verify by:
1. `npm run ci` passes.
2. In the running app: open a case, add a hospital, confirm the chip appears and
   the same card appears on the provider board, then remove it and confirm both
   drop it.

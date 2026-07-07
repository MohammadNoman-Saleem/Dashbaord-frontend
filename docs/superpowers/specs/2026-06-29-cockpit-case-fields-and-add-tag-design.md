# Cockpit case file: patient detail fields and add-tag

Date: 2026-06-29
Status: design approved, pending spec review
Branch: dev

## Context and goal

The cockpit case file (`components/cockpit/CaseFile.tsx`, served by
`lib/server/services/cockpit.ts`) shows a small patient-detail grid (today:
Condition, Destination, Origin, Source) plus the gated WhatsApp control. The
case manager needs four more things on that panel so she can act without
leaving the case:

1. The patient phone number, shown so she can call or copy it.
2. The reason for treatment.
3. The preferred country for treatment.
4. The case tags, shown, plus the ability to add a tag.

All four are sourced from Zoho, and three of them are already fetched
server-side, so most of this is contract and render work. Adding a tag is the
one new write and goes through the existing gated write path.

## Scope

In scope:

- Show patient phone, reason for treatment, and preferred country on the case
  file, with the correct privacy gating for each.
- Show case tags and add a gated control to add a tag.

Out of scope:

- Removing or editing tags (add only). A `remove_tag` kind can follow later with
  the same mechanism if needed.
- Tag-based filtering or search in the queue.
- Any change to the document-generation surfaces, which stay disabled.

## Field 1: Phone number

- Source: already flowing. `patient_phone` is on the case contract and set by
  the service (`Patient_Mobile` on Deals, `Phone` on Leads), gated to name-seers
  in `withPatientContact` (`cockpit.ts` near line 703). It currently only drives
  the WhatsApp control.
- Gating: name-seers only (Fatima, Razan), unchanged.
- Change: add a "Phone" row to the patient-detail area inside
  `components/cockpit/CaseFile.tsx`, rendered only when the viewer sees names,
  showing the number with a tap-to-call (`tel:`) link next to the existing
  WhatsApp control. No service or contract change.
- Privacy note: `patient_phone` may be referenced only in `CaseFile.tsx`
  (CI enforced by `scripts/check-patient-name.mjs`), which is where the row
  lives, so no allowlist change is needed.

## Field 2: Reason for treatment

- Source: already read. Maps to the Zoho field
  `Main_Concern_Reason_for_Consultation`, normalized onto `NormalizedCase`
  as `concernRaw` (`cockpit.ts` near line 228).
- Current behavior: `conditionOf` (`cockpit.ts` near line 466) shows this raw
  concern as the "Condition" field for name-seers, and the derived specialty
  label for everyone else.
- Gating decision (approved): name-seers only. This matches how raw clinical
  free-text is already handled today.
- De-duplication decision (approved, please confirm at review): make "Condition"
  show the derived specialty label for everyone, and move the raw concern to a
  new "Reason for treatment" row that is shown only to name-seers. This avoids
  showing the same text twice to name-seers. If you prefer not to touch
  "Condition", the fallback is to add the new row only and accept that
  name-seers see the text in both places.
- Change: add an optional `reason_for_treatment` field to the case contract
  (`lib/api/contract.ts`, `CockpitCaseData`), set in `cockpit.ts` only when
  `viewer.sees_patient_names`, and render a "Reason for treatment" row for
  name-seers. This field is gated in the service exactly like `conditionOf`; it
  is clinical text but not an identifier, so (consistent with the existing raw
  concern) it is not added to `PATIENT_PII_KEYS` in `lib/server/privacy.ts`.

## Field 3: Preferred country

- Source: already read. Maps to the Zoho field
  `Prefered_Country_of_Treatment_Consultation` (note Zoho's spelling). Today it
  is folded into the grouped "Destination" label via `destinationGroupOf`.
- Gating: none. Shown to all signed-in staff.
- Change: add an explicit `preferred_country` field to the case contract and
  set it in `cockpit.ts` with the exact (ungrouped) value, then render a
  "Preferred country" row. "Destination" stays as the grouped label.

## Field 4: Tags (show and add)

Tags are not fetched today, so this has a read part and a write part.

### Read

- Add `Tags` to the Zoho field lists for both Deals and Leads in
  `lib/server/crm-read.ts` (the `deals()` and `leads()` field strings), and to
  the `DealRecord` and `LeadRecord` interfaces.
- Bump the cache key versions (`zoho_crm:deals_v9` to `_v10`,
  `zoho_crm:leads_v7` to `_v8`) following the repo convention, so a warm cache
  entry can never serve a shape without the new field.
- Normalize Zoho's tag shape (an array of tag objects) to `string[]` on
  `NormalizedCase`, add `tags: string[]` to `CockpitCaseData`, and set it in
  `cockpit.ts`.
- Render the tags as chips (the existing `Chip` component, `variant="mut"`),
  following the Checklist section pattern, in a new section after the
  patient-detail grid in `CaseFile.tsx`.
- Gating: none for display. Tags are case metadata, not patient PII.

### Write (add tag)

Follows the existing one-step, direct-to-Zoho, gated write path used by every
other case-file control. No new route.

- Vocabulary: add `{ kind: 'add_tag'; tag_names: string[] }` to the proposed
  change union in `lib/server/services/write-gate-changes.ts`, add `add_tag` to
  `ACTIVE_CHANGE_KINDS`, and add a `describeChange` case that returns plain
  language (for example, "Add tags: urgent, follow-up").
- Route validation: add the matching member to the discriminated `ChangeSchema`
  in `app/api/cockpit/case/[id]/write/route.ts`, with a non-empty array of
  non-empty strings.
- Zoho client: add a tag-add method to the write client in
  `lib/server/integrations/zoho/client.ts` using the Zoho CRM add-tags action.
  The exact endpoint version and response shape will be verified against the
  existing client methods during implementation (see open items).
- Service: branch `add_tag` in both `applyDealChange` and `applyLeadChange`
  in `lib/server/services/cockpit-write.ts`, calling the new client method,
  then audit keys only (`after: { fields: ['Tags'] }`, never the tag values),
  and invalidate the CRM cache.
- Client: add `add_tag` to the `CockpitWriteChange` union in
  `components/cockpit/useCockpitWrite.ts`, and add an `AddTag` control modeled on
  `SetFollowUp.tsx` that builds the change and calls the shared mutation. Render
  it in the new tags section.
- Gating: the route already refuses unless `WRITE_GATE_ENABLED` is set
  server-side, so add-tag inherits that gate. No name-seer gate (tags are not
  PII). Works for both Deals and Leads.

## Cross-cutting requirements

- Contract sync: `lib/api/contract.ts` is hand-written and must match what the
  route returns. The fixtures use `satisfies` against the contract, so the
  cockpit case fixture in `lib/fixtures` must be updated for the new fields, and
  `npm run smoke:fixtures` must still pass.
- CI gates: `npm run ci` must pass (no em or en dashes, no color literals
  outside tokens, no hype words, patient-field confinement, typecheck, lint).
- Next.js: per `AGENTS.md`, read the relevant guide under
  `node_modules/next/dist/docs/` before writing any route code.

## Testing and verification

- Typecheck, lint, and the contract or fixture guard pass.
- As a name-seer (Fatima or Razan): the Phone and Reason for treatment rows
  appear; "Condition" shows the specialty label (per the de-dup decision).
- As a non-name-seer: Phone and Reason for treatment rows are absent; Preferred
  country and tags are visible.
- With `WRITE_GATE_ENABLED` on: adding a tag writes to Zoho, the chip appears
  after the case refetch, and the audit records the action by field key only,
  never the tag text. With the gate off, the add control's request is refused
  and the failure message is shown.

## Open items to verify during implementation

- The exact Zoho add-tags endpoint version and response shape, confirmed against
  the existing methods in `lib/server/integrations/zoho/client.ts`.
- The exact shape Zoho returns for the `Tags` field and the normalization to
  `string[]`.
- Confirm both Deals and Leads accept the tag-add and the tag read.
- Confirm the de-duplication of "Condition" and "Reason for treatment" at spec
  review.

## Relationship to the stale-read bug

This feature touches the case read path (`cockpit.ts` `caseFile`, `crm-read.ts`
field lists, the case contract). The separate stale-read-after-write
investigation may also change that read path. The two will be sequenced so they
do not conflict; the cache key version bump here is compatible with either
outcome of the bug fix.

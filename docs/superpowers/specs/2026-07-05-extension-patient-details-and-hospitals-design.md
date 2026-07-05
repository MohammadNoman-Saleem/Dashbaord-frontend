# Extension panel: more patient details and a hospitals control

Date: 2026-07-05
Status: approved, implementing

## Problem

Two additions to the Saleem WhatsApp side panel:
- show more patient fields (condition, reason for treatment, preferred country,
  destination, origin, source), and
- let the case manager add the open patient to hospitals and remove them, the
  same way the case-file hospital-link feature works, reusing the same data.

## Key findings

Part A needs no backend. All six fields already ship in the lookup response
inside `case.details` (each an item `{ k, v }`), assembled by the caseFile
service from existing Zoho fields. Reason for treatment is already name-seer gated
server-side. The panel simply does not render `case.details` yet.

Part B reuses the existing provider board, which already runs on the shared
Supabase database (the `provider_referrals` table and the `getPool()` connection).
No new table, no migration, no new endpoints:
- `GET /api/provider-board` returns the hospital directory (`hospitals[]`) and all
  active cards grouped by hospital (`cardsByHospital`). The open patient's
  hospitals are the cards whose `patient_ref.zoho_id` matches, and each such card
  carries its referral id for removal.
- `POST /api/provider-board` adds a patient to a hospital.
- `DELETE /api/provider-board/[id]` removes a link.

One small backend touch is required: the CORS allow-list in `proxy.ts` currently
permits `GET, POST, OPTIONS` for the extension origin. Removing a hospital is a
cross-origin `DELETE`, which the browser blocks unless `DELETE` is in that list.
So `CORS_METHODS` gains `DELETE`. This adds no logic and no endpoint; it only lets
the extension call the remove endpoint that already exists.

## Design

Part A (`extension/panel.js`, `panel.html`): render `case.details` as rows in the
patient card (reusing the existing row styles), below the existing fields. Values
the service marks "Not set" show as provided.

Part B, all reuse:
- `extension/service-worker.js`: a GET of the board cached in
  `chrome.storage.session`, plus `getHospitals(caseId)` that derives the patient's
  linked hospitals (referral id, hospital id, name) and the pickable directory
  from that board. `addHospital` (POST) and `removeHospital` (DELETE) invalidate
  the cached board on success. New message handlers: `get_hospitals`,
  `action_add_hospital`, `action_remove_hospital`.
- `extension/panel.js`, `panel.html`: a "Hospitals" card showing the linked
  hospitals as removable chips (like tags) plus a dropdown of the directory and an
  Add button. Loaded when a patient case is open; hidden otherwise. A stale
  response from a fast chat switch is dropped.
- `proxy.ts`: add `DELETE` to `CORS_METHODS`.

## Privacy and safety

Hospital links are patient health data, so the board endpoints are already
name-seer gated and person-only for writes. The extension user is a name-seer and
a person, so the gates pass. The table stores only ids and the hospital's business
name, never patient data. The panel shows only the open patient's hospitals.

## Error handling and verification

Fetches fail soft with a plain "could not load hospitals" line; add and remove
report a status and refresh on success. No test harness exists for the panel or
service worker; verify by loading the unpacked extension: open a chat, confirm the
six detail rows render, add a hospital from the dropdown and confirm the chip
appears and the same card shows on the provider board, then remove it. Also run
`node --check` on the edited JS, `node extension/adapter/wa-dom.test.mjs`, and
`npm run ci` for the proxy.ts change.

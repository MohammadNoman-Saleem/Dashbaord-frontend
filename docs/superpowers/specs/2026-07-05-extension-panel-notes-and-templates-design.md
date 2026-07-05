# Extension side panel: recent notes and templates

Date: 2026-07-05
Status: approved, implementing

## Problem

The Saleem WhatsApp side panel (the `extension/` folder) should bring two case
file capabilities to the case manager while she is in WhatsApp Web:
- show the last few case notes (adding a note already works), and
- show the WhatsApp templates so she can view them and copy one to paste.

## Key finding

Everything needed is already reachable from the extension with its Bearer token
and the existing CORS on all `/api` routes. No backend changes.

- Templates: `GET /api/whatsapp/templates` returns `{ templates: [{ id, title,
  body }] }`, open to any signed-in viewer. Bodies carry `{{first_name}}` and
  `{{full_name}}` placeholders that the dashboard fills client-side from the
  patient name. No patient data is stored in a template.
- Notes: `GET /api/cockpit/case/[id]/notes?module=Deals|Leads` returns
  `[{ id, title, body, author_name, created_at }]`, newest first. The body is
  server-sanitized HTML (a small set of formatting tags, no attributes). It is
  name-seer gated, which is not a new constraint: the extension's own lookup is
  already name-seer gated, so any panel user can read notes. The lookup response
  does not carry these notes (it returns an empty list), so a separate GET is
  needed.

## Decisions (confirmed)

- Notes: show the last 5, newest first, keeping the light formatting.
- Templates: fill `{{first_name}}` and `{{full_name}}` with the open patient's
  name before showing and copying.
- Get a template into WhatsApp by Copy to clipboard (she pastes and sends), so
  the extension's "never sends" rule holds and WhatsApp's markup is untouched.

## Design

All changes are in `extension/`.

`service-worker.js`:
- Refactor the single POST `api()` into a shared `request(method, path, body)`
  that keeps the same "never throws, returns { ok, status, data, error }" shape;
  `api()` becomes `request('POST', ...)`.
- Add `getNotes(caseId, module)` (GET the notes sub-resource) and `getTemplates()`
  (GET the template list, cached in `chrome.storage.session` so it is fetched
  once per browser session).
- Add two message handlers: `get_notes` and `get_templates`.

`panel.js`:
- After a lookup resolves to a patient, request the notes for that case id and
  module and render the 5 newest into a "Recent notes" card. Titles and relative
  time (a small local `fmtAgo`) with the sanitized body rendered as formatted
  HTML.
- Load the template list once, render each template with the patient's name
  filled into the placeholders (first token for first_name, full string for
  full_name), each with a Copy button that writes the filled text to the
  clipboard and shows a brief "Copied" status.
- Both cards show only when a patient case is open, and are hidden in the
  not-configured, empty, and loading states. (Trivial to always-show templates
  later if wanted.)

`panel.html`:
- Add a "Recent notes" card (before the Actions card) and a "Templates" card
  (after Actions), plus scoped CSS for note formatting and the template rows.

`manifest.json`:
- Add the `clipboardWrite` permission so the Copy button works reliably.

## Privacy and safety

- The extension is name-seer only already, so surfacing notes and a name-filled
  template does not widen who sees patient data.
- Note bodies are rendered from server-sanitized HTML (formatting tags only, all
  attributes stripped), so `innerHTML` is safe here, the same as the dashboard.
- Templates carry no patient data; the name is filled only in the browser at
  render and copy time, never sent anywhere. The extension still never sends a
  WhatsApp message.

## Error handling and verification

- Both fetches fail soft: the card shows a plain "could not load" line and the
  rest of the panel is unaffected. Copy failures show "could not copy".
- There is no test harness for the panel or service worker (only the wa-dom
  adapter has a node test). Verify by loading the unpacked extension: open a
  chat, confirm the recent notes render and a template copies with the name
  filled in. Also run `node --check` on the edited JS to catch syntax errors and
  `node extension/adapter/wa-dom.test.mjs` to confirm the adapter still passes.

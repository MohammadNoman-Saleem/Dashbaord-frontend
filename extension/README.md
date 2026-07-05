# Saleem WhatsApp panel (Chrome extension)

Private, unpacked MV3 extension. It identifies the active WhatsApp Web chat
against Zoho and shows the patient's case in a docked side panel, with one-click
write-back (advance stage, log note, set follow up). It never sends WhatsApp
messages: the case manager still types and sends replies herself.

## How it fits together

```
content.js (isolated world)         service-worker.js               backend (this Next app)
  reads active chat via     -->  chrome.runtime message  -->  POST /api/extension/lookup   (Bearer)
  adapter/wa-dom.js (data-id)      does the fetch (CORS-ok,     POST /api/cockpit/case/:id/write
                                   host_permissions)            POST /api/cockpit/case/:id/notes
panel.html/.js  <-----------------  panel_update broadcast
```

- All WhatsApp DOM knowledge is isolated in `adapter/wa-dom.js`. When WhatsApp
  reshuffles its markup and the panel stops matching, fix that ONE file.
- Secrets never live in the extension. It stores only a session JWT (from the
  options page) and calls the backend with `Authorization: Bearer <jwt>`.

## Backend it needs (already in this repo)

- `POST /api/auth/token` issues the JWT (header auth; the cookie will not ride a
  chrome-extension:// fetch).
- `POST /api/extension/lookup` returns `{ match, case, stage_options }`.
- `POST /api/cockpit/case/:id/write` and `.../notes` do the write-back.
- `proxy.ts` adds CORS for the extension origin. `WRITE_GATE_ENABLED=true` must be
  set for writes (it already is in local `.env`; writes hit real Zoho).

## Load it

1. Run the backend: `npm run dev` (http://localhost:3000).
2. Chrome -> `chrome://extensions` -> enable Developer mode -> Load unpacked ->
   pick this `extension/` folder.
3. Open the extension Options, set the backend URL and sign in (username +
   password) to store the token.
4. Open https://web.whatsapp.com, click the toolbar icon to open the side panel,
   open a chat whose number exists in Zoho.

## Styling and theme

The panel and the options page follow the dashboard design system. Because the
extension is unpacked and has no build step, the design tokens are inlined in each
HTML file's `<style>` block as an exact mirror of `styles/tokens.css`. If those
tokens change, update the block in `panel.html` and `options.html` too. Colours may
live inline in `.html` because the CI colour gate (`scripts/check-red.mjs`) scans
`.ts/.tsx/.css` only; do not move them into an `extension/*.css` file, which would
be scanned and fail.

Fonts (Inter and Libre Baskerville, latin subset) are bundled in `fonts/` so the
panel matches the dashboard offline. The theme follows the operating system via
`prefers-color-scheme`, using the dashboard dark palette.

## Test the fragile part offline

```
node extension/adapter/wa-dom.test.mjs
```

## Later (out of scope for v1)

- AI copilot section (suggested reply / stage / note).
- A stable extension id (`key` in the manifest) so CORS can pin the origin
  instead of trusting any `chrome-extension://` origin.

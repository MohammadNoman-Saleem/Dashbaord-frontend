# WhatsApp panel restyle and layout cleanup

Date: 2026-07-06
Status: implemented on branch `feature/extension-panel-restyle`

## Goal

Bring the Chrome extension side panel (`extension/panel.html` and the setup page
`extension/options.html`) onto the dashboard design system, and make the panel
easier to use in a narrow column beside WhatsApp Web. Behaviour is unchanged: the
message protocol, service worker, and every write-back flow stay as they were.

## Constraints that shaped the approach

- The extension is loaded unpacked and has no build step, so it cannot import the
  app's Tailwind build or `styles/tokens.css`.
- CI `scripts/check-red.mjs` forbids colour literals outside `styles/tokens.css`,
  but it scans `.ts/.tsx/.css` only. A new `extension/*.css` file would be scanned
  and fail; inline `<style>` in `.html` is not scanned. So the tokens are inlined
  in each HTML file and kept in sync with `tokens.css` by hand (noted in a comment).
- `scripts/check-dashes.mjs` does scan `.html`, so no em or en dashes in the panel.
- `panel.js` selects elements by id. Every id it reads was preserved, so the
  markup could be restructured without touching the script.

## What changed

Foundation
- Replaced the drifted partial token block with the complete, exact token set from
  `tokens.css` (light values plus the full dark set under
  `@media (prefers-color-scheme: dark)`), and `color-scheme: light dark`. The panel
  now follows the operating system theme using the real design-system dark palette.

Typography
- Bundled Inter (variable) and Libre Baskerville (regular) as latin-subset woff2 in
  `extension/fonts/`, wired with `@font-face` and `font-display: swap`. Body is
  Inter; headings and the patient name use Baskerville in `--title`, weight 400,
  matching `app/globals.css`. Both fonts are SIL OFL licensed and work offline.

Layout (panel)
- Sticky patient header: name, reference, and a stage pill stay pinned while the
  body scrolls. The name flexes and truncates; the pill caps width and truncates.
- Four cards with the system shadow and radius: Case, Case details, Actions, and a
  collapsible History (closed by default).
- Buttons restyled to the system accent; the add-tag action became a ghost button.
- Loading, empty, and not-configured states restyled onto system cards; status text
  uses accent, never colour-coded severity.
- The developer test-lookup moved into a collapsed `<details>` block at the bottom.
- Body uses the thin scrollbar and the system focus-visible ring.

Options page
- Restyled onto the same tokens and fonts, with a card container and the accent
  Sign in button (was an off-system green). `options.js` now sets its status colour
  from CSS variables instead of hardcoded hex.

## Verification

- `npm run ci` passes (dashes, red, hype, patient, typecheck, lint).
- Rendered `panel.html` and `options.html` headless at a true 360px width (inside a
  fixed-width iframe, since headless Chrome clamps window width) with a privacy-safe
  sample case (initials only, no patient name), in forced light and dark. Confirmed:
  no horizontal overflow, readable stage pill in both themes, correct fonts, and the
  empty and options surfaces styled consistently.

## Flagged, not changed

- `panel.js` renders `match.patient_name` directly. Hard rule 5 confines patient
  names to `PatientRef`. This internal panel sits beside WhatsApp where the case
  manager already sees the name, and changing it is a data-behaviour decision
  outside this styling work. Left as a possible follow-up.

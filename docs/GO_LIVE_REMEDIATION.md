# Go-live remediation plan (saleem-web)

Owner: Mohammad (CTO). Compiled: 2026-06-20 from a dual-codebase review
(saleem-api + saleem-web) run with Claude Code, with findings adversarially
re-checked by independent agents and the highest-stakes items re-verified by
hand against the code.

This file is the frontend half of the plan. The backend half lives in
`docs/GO_LIVE_REMEDIATION.md` in saleem-api. Cross-repo items appear in both.

The work is sequenced in phases by risk. Each phase is sized to be picked up by
one or more agents in parallel, with the CTO reviewing each merge. The cockpit
write controls already point at the live backend, so the surface goes live when
the backend flags flip. Close Phase 2 (PII) and the frontend items of Phase 3
(auth) before that happens.

## Note: Claude integration stays on the Agent SDK

The backend referral drafting commits to the Claude Agent SDK, not the raw
Anthropic API. No frontend change follows from this; it is recorded so the two
plans stay aligned. Detail is in the saleem-api plan.

## Confidence legend

- Confirmed: independently re-verified by a second agent, or re-read by hand
  against the code during this review.
- Needs confirm: flagged by a reviewer; the second-pass verification was cut
  short by the org spend limit. Treat as high-probability, verify on pickup.

## Status summary

The app is structurally mature and disciplined: one typed data seam, a clean
route-group and shell architecture, and an honesty contract that holds (null is
not shown as zero, unreliable data dims, severity is words not color, no red).
The risk for go-live is the patient-PII boundary (phone and message have no
guard) and route or session auth gaps. There is also no enforced CI: the gates
run only locally and are red today.

The contract-seam dimension did not finish in the review because of the spend
limit; its material findings are captured here from the cross-repo dimension and
hand checks. A re-run is recommended once the limit resets.

---

## Phase 0: Unblock CI and documentation accuracy

### FE-DOC-1: PROJECT_STATUS title broke the dash gate (fixed in this change)
- Severity: High (CI red). Confidence: Confirmed (re-read by hand).
- `check:dashes` failed on line 1 of PROJECT_STATUS.md (an em dash in the
  title), so `npm run ci` was red on main. The title is corrected in this
  change. The stale claim that `npm run ci` includes smoke:fixtures and build is
  also corrected (see FE-CI-1).

### FE-CI-1: There is no enforced CI workflow
- Severity: High. Confidence: Confirmed (re-read by hand).
- Where: no `.github/` in the repo; `package.json` `ci` script chains
  check:dashes, check:red, check:hype, check:patient, typecheck, lint and stops.
- Problem: the privacy, dash, hype, and type gates are local-only and unenforced
  (which is how a dash-violating doc reached main). The script also omits
  smoke:fixtures and build, contrary to PROJECT_STATUS.
- Fix: add a GitHub Actions workflow that runs the full ci plus smoke:fixtures
  and build on every PR to main.
- Done when: a dash, hype, patient_name, or type violation blocks merge in CI.

### FE-DOC-2: AGENTS rule 7 contradicts the hand-written contract
- Severity: Medium. Confidence: Confirmed.
- AGENTS.md rule 7 says response types are generated from the OpenAPI artifact,
  but `lib/api/contract.ts` is hand-written. Either implement codegen from the
  backend `openapi/openapi.json` (preferred) or correct the rule to state the
  types are hand-written and verified against OpenAPI. Ties XR-1.

### FE-DOC-3: README is create-next-app boilerplate
- Severity: Low. Confidence: Confirmed.
- Replace with a real README (run, environment, the data seam, the privacy
  rules, the CI gates).

---

## Phase 2: Patient PII boundary (highest regulatory risk)

### FE-PRIV-1: phone and whatsapp_message have no guard and no client gate
- Severity: High (was raised as Critical). Confidence: Confirmed.
- Where: `components/cockpit/CaseFile.tsx` and the WhatsApp link, plus the
  document controls.
- Problem: the patient_name CI guard and the name-seer rendering pattern protect
  the name, but patient_phone and whatsapp_message have neither a CI guard nor a
  client-side `sees_patient_names` gate before rendering. The backend serializer
  is the real gate, but the frontend has no defense-in-depth for these two
  fields (mirrors BE-PRIV-1).
- Fix: render phone and the WhatsApp message only when
  `viewer.sees_patient_names`, and extend the CI guard to these fields.
- Done when: a non-seer viewer never renders phone or message, and the CI guard
  catches a new reference to either outside an allowed component.

### FE-PRIV-2: the patient_name CI guard is bypassable and is bypassed
- Severity: High. Confidence: Confirmed.
- Where: `scripts/check-patient-name.mjs` (literal substring scan over app and
  components only), `components/cockpit/BuildQuotation.tsx` (reads the real
  patient name outside PatientRef and prefills a form field with it).
- Problem: the one privacy control we rely on is weaker than documented. The
  scan misses aliasing and does not cover `lib/`.
- Fix: route the name through PatientRef or a single sanctioned accessor; harden
  the guard (catch aliasing, scan lib, or use a lint rule).
- Done when: the guard flags the BuildQuotation case and the name renders only
  via PatientRef.

### FE-PRIV-3: fixtures expose phone and message to non-seers
- Severity: Medium. Confidence: Needs confirm.
- Where: `lib/fixtures` me and case fixtures.
- Problem: dev fixtures hand phone and message to viewers without
  sees_patient_names, which trains the wrong shape.
- Fix: align fixtures with the server gate.

### FE-PRIV-4: unused PII reaches the client
- Severity: Low. Confidence: Confirmed.
- Where: whole-object spreads push phone and message into component props;
  patient_name is fetched into the Appointments payload but never rendered.
- Fix: pass only the fields a component needs; drop unused PII from client
  payloads.

---

## Phase 3: Route and session auth (frontend)

### FE-AUTH-1: no route guard; PII queries fire before auth resolves
- Severity: Medium (was raised as High). Confidence: Confirmed.
- Where: `app/(dash)/layout.tsx` (no middleware or server auth check).
- Problem: a direct hit to a dashboard route renders the shell and fires
  cockpit and other PII-bearing queries until `/api/me` returns 401 client-side.
  The per-endpoint server check is the real protection, so this is
  defense-in-depth plus a data-paints-before-auth concern.
- Fix: add middleware or a server-side auth check that redirects unauthenticated
  users before queries fire.
- Done when: an unauthenticated direct hit redirects to login and no cockpit
  query fires.

### FE-AUTH-2: no global 401 handler
- Severity: Medium. Confidence: Confirmed.
- Problem: mid-session expiry strands the user instead of redirecting to login.
- Fix: a QueryCache and MutationCache onError that redirects to login on 401.

### FE-AUTH-3: login does not refresh the viewer
- Severity: Medium. Confidence: Confirmed.
- Problem: the `me` query uses Infinity staleTime and is not invalidated on
  login, risking a stale or null viewer in the authenticated app.
- Fix: invalidate and refetch `me` on login.

### FE-AUTH-4: sign out is best-effort
- Severity: Medium. Confidence: Confirmed.
- Problem: server-side cookie clearing is best-effort and back-button access to
  cached pages is not actively prevented.
- Fix: ensure the server clears the cookie, purge the client cache, and prevent
  cached authenticated pages from rendering after sign out.

### FE-AUTH-5: CSRF posture is implicit
- Severity: Low (decision). Confidence: Needs confirm.
- Problem: credentialed state-changing POSTs, including the write gate, rely on
  SameSite=Lax with no CSRF token.
- Fix: confirm the SameSite posture is acceptable for the deployment, or add
  CSRF tokens. Coordinate with the backend.

---

## Phase 4: Write UX, headers, and quality

### FE-WRITE-1: controls toast success without reading committed
- Severity: Medium. Confidence: Confirmed.
- Where: `components/cockpit/SetFollowUp.tsx:86` and the other write controls.
- Problem: every control toasts saved on any 2xx without reading
  `data.committed`, so a committed:false (gate off, or a no-op) still reads as
  saved.
- Fix: read the committed flag (after BE-WG-7 makes it meaningful) and surface a
  clear non-success state; handle 409 distinctly. Ties XR-3.
- Done when: committed:false shows a not-saved state.

### FE-WRITE-2: stale read-only copy contradicts the live controls
- Severity: Medium (was raised then downgraded). Confidence: Confirmed.
- Where: the cockpit page header, the CaseFile footer, and the repeated
  "every other action here is still read-only" footnote across the controls.
- Problem: the copy was true at an earlier phase and contradicts the now-live
  write controls.
- Fix: remove or replace the read-only copy in the same change the write gate
  goes live.
- Done when: no read-only copy remains where controls are live.

### FE-OPS-1: no error boundaries
- Severity: Medium. Confidence: Confirmed.
- Where: no `error.tsx` in the App Router tree.
- Fix: add error boundaries per route group.

### FE-OPS-2: no security headers or CSP
- Severity: High. Confidence: Confirmed (re-read by hand).
- Problem: the frontend ships no CSP or security headers. SECRETS_AUDIT claims a
  CSP with connect-src limited to the API origin; it does not exist.
- Fix: add CSP and security headers via next config, with connect-src limited to
  the API origin.
- Done when: responses carry a CSP and a cross-origin fetch is blocked.

### FE-CI-2: two panels hardcode the month
- Severity: High (breaks in 10 days). Confidence: Confirmed.
- Where: two home panels hardcode MONTH = '2026-06'.
- Problem: they will query the wrong month after June 2026.
- Fix: derive the current month (Bahrain timezone) or pass it from the server.
- Done when: the month advances automatically.

### FE-OPS-3: the component gallery ships unguarded
- Severity: Low. Confidence: Confirmed.
- Where: `app/gallery/page.tsx`.
- Fix: gate or remove it in production.

---

## Cross-repo coordination (mirrored in saleem-api)

- XR-1: Contract sync. The backend emits `openapi/openapi.json`; the frontend
  types are hand-written. Decide between codegen (preferred) and a documented
  hand-written-and-verified approach. Ties FE-DOC-2.
- XR-2: `/api/me` shape. ViewerPerson omits role and department that the backend
  marks required; role and theme are narrowed from a wire string with no runtime
  validation. Reconcile and add runtime validation at the seam. Note:
  kpi_edit_scope matches end to end; the earlier drift was a dev-fixture value.
- XR-3: committed flag (BE-WG-7) plus the frontend reading it (FE-WRITE-1).
- XR-4: PII sweep, backend interceptor (BE-PRIV-1) plus frontend guard and gate
  (FE-PRIV-1).
- XR-5: Server-tracked confirmation (BE-WG-3) plus the frontend dropping the
  echoed confirmations_required.

## Refuted during review (do not action)

- Commit dropping base_modified_time is not a gap. The server re-reads
  Modified_Time at commit and returns 409 on drift; the token is a server-side
  anchor and does not round-trip by design.
- kpi_edit_scope matches end to end; only the dev fixture uses an invalid value,
  and the real check is "not none," which is robust either way.
- The 409 "nothing changed" copy and a StageMove confirm-bypass were false
  positives.
- PatientRef itself is clean (no name leak via attributes, logs, or URLs); there
  is no auth token in localStorage.

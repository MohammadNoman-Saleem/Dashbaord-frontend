# Self-Contained New Dashboard - Backend Re-home Design Spec (Option B)

- Date: 2026-06-23
- Branch: `claude/self-contained` (off `main`, repo `MohammadNoman-Saleem/Dashbaord-frontend`)
- Worktree: `C:/tmp/saleem-selfcontained`
- Status: Approved direction (Option B). Built autonomously, phased, for review.
- Source backend being re-homed: `E:/Saleem Main/Dashbaord-backend` (NestJS, TypeScript).

## Goal
Make the new dashboard self-contained: fold ALL NestJS backend logic into this app's own Next 16 App-Router API routes (`app/api/*`), so there is no separate backend service, the same serverless model the old dashboard uses. The UI is unchanged; it already calls these endpoints and gets repointed same-origin. TS-to-TS, keeping the `{ data, meta }` envelope contract and DTO types.

## Architecture
- **Foundation `lib/server/*`** (the spine every route imports), then per-domain route handlers, then a one-file frontend cutover.
- **DB**: one `globalThis`-pinned `pg` Pool singleton against the Supabase **transaction pooler (6543)**, small `max` (1-5) because each warm instance holds its own pool. No shutdown hook. A separate `DATABASE_URL_SESSION` (direct 5432) is reserved only for the deferred write-gate.
- **Auth**: edge `middleware.ts` does presence/JWT-verify only via `jose` (no DB on edge); a per-route `requireViewer(req)` helper (Node runtime) re-verifies, applies the `x-mcp-key` MCP path, hydrates the viewer/capabilities from the DB, and resolves `?as=`. Login/logout/change-password/me become `app/api/auth/*` + `app/api/me` routes issuing/clearing the `saleem_session` HttpOnly cookie (HS256, `JWT_SECRET`, 7d).
- **Envelope + errors**: a higher-order `handler(fn)` wrapper replaces Nest's global interceptor + exception filter - it brand-checks/synthesizes meta, runs the privacy sweep, converts an `HttpError` hierarchy into the error envelope with the right status, scrubs PII from logs, and threads `x-request-id`.
- **Privacy (highest-risk)**: port `PatientSerializer` (per-field gate) AND the global `sweepPatientPii` backstop; the sweep runs inside `handler()` on every response and each route keeps the per-field gate. Both must be present or patient identifiers leak.
- **External clients**: Zoho (auth/read/write/projects), Mixpanel, Drive, GA4, Meta, WhatsApp - each a `globalThis`-pinned singleton holding its in-memory token cache; warm reuse helps, cold starts re-mint.
- **Runtime**: routes using `pg`/`argon2`/`jose`-Node/`child_process` declare `export const runtime = 'nodejs'`; the edge proxy stays presence-only.

## Phases
- **Phase 0 - Foundation (`lib/server/*`)**: env, init (ANTHROPIC_API_KEY strip), db pool, cache, audit, envelope, errors, contracts, viewer, classification, privacy, handler, auth, users, requireViewer, integrations (all external clients), crm-read, edge middleware, `/api/healthz`. NOT parallelizable: the dependency root. Verified by typecheck + build before any domain route moves.
- **Phase 1 - Command Center reads** (highest value): cockpit (queue/parked/sla-policy/case), pipeline (priorities/health/providers), handoffs, attention, pulse, cases/summary. Pure reads.
- **Phase 2 - CRM analytics reads**: crm slice, pipeline analytics (staleness/momentum/losses/velocity), marketing, leads/medical-travel, financials (+forecast/burn/receivables).
- **Phase 3 - KPI + deliverables + urgent + blockers** (Postgres-only writes, audited, zod input guards; no advisory lock, no Zoho).
- **Phase 4 - Product analytics reads**: funnels (general/direct/uiux/scheduled/novo), growth (engagement/retention), social (ga4/platforms).
- **Phase 5 - Admin + auth/me + payouts + Zoho-Projects board/tasks (reads)**: auth login/logout/change-password, /api/me(+theme), admin users, payouts (Postgres writes), board+tasks Zoho reads, write-gate stage-options (pure policy), optional it-support.
- **Cutover**: set fetcher `API_BASE` default to `''` (same-origin `/api`), match the login-page copy, set `NEXT_PUBLIC_API_BASE=''` in deploy env, fix the stale `proxy.ts` comment, update AGENTS.md rules.
- **Verify**: `npm run typecheck` + `npm run build` + `npm run ci` (dashes/red/hype/patient gates) + fixture smoke of each route group + end-to-end privacy-gate check + auth/redirect check.

## Deferred (with handling)
- **Write-gate advisory lock** (`/write-gate/prepare`,`/commit`): session-scoped `pg_advisory_lock` breaks under the transaction pooler. Re-home the code but keep commit returning the existing "writes off" refusal (`WRITE_GATE_ENABLED=false`); rework via idempotency-key unique index + `INSERT ... ON CONFLICT` in one transaction (preferred) or a dedicated session connection. Keep `/write-gate/stage-options` live now (pure policy).
- **Document/referral generation** (`/documents/*`): `child_process` + Agent SDK + filesystem, hostile to serverless and behind `REFERRAL_AI_DRAFTING_ENABLED`/`DRIVE_DOCS_ENABLED` (both false). Defer behind a feature flag / 501 until a worker or in-process docx path lands. Preserve the boot-time ANTHROPIC_API_KEY strip wherever it runs.
- **Zoho-write routes** (blockers `/ops` leg, board task PATCH/POST/comment): can run serverless but bundled under one sign-off (Khalid/Al Saeed). Org policy: any move-a-deal / mark-task / calendar write must route through the personal-ops-assistant skill's confirm-or-edit gate, not a direct connector call, when activated.
- **Login brute-force throttle** (5/15min): reimplement as a Postgres/Upstash IP counter or defer with a TODO.

## Risks
Privacy sweep must be in `handler()` AND per-field (any miss is a compliance incident); DB connection exhaustion (small pool + transaction pooler); server-only secrets must never be `NEXT_PUBLIC_`-prefixed; edge-vs-node runtime correctness; cold-instance token-refresh storms (persist tokens if needed); preserve the ANTHROPIC_API_KEY strip; the AGENTS.md CI gates (no em/en dashes, patient_name only via PatientRef) apply to the new server code.

## Open items (need the user; do not block Phase 0 build/verify)
1. Confirm deploy target/runtime (Vercel assumed) - decides whether the two hostile seams need an external worker.
2. Provide the Supabase transaction-pooler `DATABASE_URL` (6543) and a `DATABASE_URL_SESSION` (5432) for the deferred write-gate; confirm prepared statements can be disabled under PgBouncer.
3. Provision all server-only secrets in the frontend deploy, none `NEXT_PUBLIC_`-prefixed (JWT_SECRET, MCP_SERVICE_KEY, DATABASE_URL(+_SESSION), all Zoho/Mixpanel/Meta/Google, CLAUDE_CODE_OAUTH_TOKEN, feature flags).
4. Decide whether it-support ships in Phase 5 or is deferred.
5. Decide the login-throttle approach.
6. Decide whether to keep the OpenAPI contract-sync workflow now that there is no separate backend.

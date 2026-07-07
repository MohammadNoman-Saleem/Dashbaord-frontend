# CRM analytics page (Phase 2) implementation plan

Date: 2026-07-01
Status: ready to build, pending final go
Branch: feature/appointments-crm

Concrete build plan for the `/crm` page. Extends the CRM section of
`2026-06-30-appointments-and-crm-pages-design.md` with the verified old-to-new
mapping and the locked decisions. Behavior source of truth stays the old routes
under `Analytics-Dashboard/app/api/zoho/crm/*`; copy their pipeline and stage
string constants and aggregation math verbatim, never inferred.

## Decisions locked

- Build all four tabs: Overview, Leads, Deals, Analytics.
- Per-section period pills, matching the old page. Each period-aware section
  (funnel, lead-funnel, pipeline, SLA) carries its own period control via the
  existing `Pills` component, with the selection in section-local state and the
  period in the query key so it refetches independently.
- Read-only v1. Any future write to Zoho routes through the personal-ops
  -assistant skill, never the page.
- Every lead and deal row is initials only through `patientSerializer`; no CSV
  export carries a name, phone, or email.

## Reused foundation (no new backend)

- `crm-read.ts` cached reads: `deals()`, `leads()`, `bookings()`, plus the
  centralized constants `WON_STAGE`, `LOST_STAGE`, `PIPELINE_NAMES`,
  `PIPELINE_STAGES`, `STAGE_SLA_DAYS`, `isOpenDeal`.
- Already-ported Analytics-tab endpoints, reused as-is: `pipeline_velocity`
  (SLA stage velocity), `pipeline_losses` (loss analysis), and the
  `lead_to_booking` slice of `growth_retention` (lead-to-booking cohort).
- UI primitives: `ThemeTabs`, `Pills`, `DataTable` (sortable, CSV), `KpiCard`,
  `MiniBars`, `FunnelBars`, `Card`/`Grid`, `QueryPanel`, `patientSerializer`.
- Add-a-page wiring: `config/endpoints.ts`, `lib/api/keys.ts`,
  `config/titles.ts`, `components/shell/Sidebar.tsx`, the `DeepLink['view']`
  union and response DTOs in `lib/api/contract.ts`, and a fixture per endpoint.

## New endpoints

Each is a cached read plus JS aggregation in a service, a `runtime='nodejs'`
route wrapped in `handler()` returning `withMeta(data, mergeMeta(parts))`, a
contract type, a `qk` key, an `endpoints.ts` mode, and a fixture. Aggregation
math is ported verbatim from the named old route.

Overview:
- `crm_metrics` (`GET /api/crm/metrics`): overall KPIs plus per-pipeline month
  over month. Port `metrics/route.js`. Keep Corporates in the metrics WON/LOST
  maps (the funnel maps exclude it, on purpose; do not merge the two).
- `crm_funnel` (`GET /api/crm/funnel?period=mtd|ytd|all`): monthly Customers and
  Providers funnel (leads by Layout, deals by Pipeline, won dated by
  Closing_Date then Created_Time). Port `funnel/route.js`.

Leads:
- `crm_leads` (`GET /api/crm/leads?limit&offset`): paginated table, initials
  only, cap 200. Port `leads/route.js`, adding the privacy gate.
- `crm_lead_sources` (`GET /api/crm/lead-sources`): group by Lead_Source over
  the full cached leads read. Port `lead-sources/route.js` but fix the 100-row
  cap (see bugs).
- `crm_lead_funnel` (`GET /api/crm/lead-funnel?period=all|ytd|qtd|mtd|custom&start&end`):
  cumulative lead-stage funnel, overall and by segment. Port `lead-funnel/route.js`.

Deals:
- `crm_deals` (`GET /api/crm/deals?pipeline=`): deals table rows (business
  Deal_Name, no patient PII). Port `deals/route.js`.
- `crm_pipeline` (`GET /api/crm/pipeline?period=all|mtd|ytd`): per-pipeline stage
  bars and a quality table (won, lost, open, win_rate, loss_rate, value,
  loss_reasons). Port `pipeline/route.js`; reuse the existing constants.
- `crm_journey` (`GET /api/crm/journey`): Treatment-only journey by tag
  (ASSISTED_JOURNEY, NAVIGATION_ONLY, Untagged). Port `journey/route.js`.
- `crm_subtype` (`GET /api/crm/subtype`): customer sub-type (Direct, Sponsored,
  Untagged) with a per-pipeline split. Port `subtype/route.js` and fix the
  bucket-key case bug (see bugs).

Analytics (reuse plus small new):
- Reuse `pipeline_velocity`, `pipeline_losses`, and `growth_retention`.
- `crm_segments` (`GET /api/crm/segments?metric=count|amount&pipeline=`):
  geographic and specialty breakdown of deals. Open decision on source (see
  below).
- `crm_lead_velocity` (optional): per-pipeline lead contact-rate and
  lead-to-deal velocity. Requires adding `Modified_Time` to the leads read and
  bumping the leads cache key.

## Constants to add (single source of truth)

Co-locate with the existing pipeline constants (extend `crm-read.ts` or add
`lib/server/crm-constants.ts`), reused across the new services: journey tags,
subtype tags, `LEAD_LAYOUT_TO_KEY` (B2C and B2B to Customers and Providers),
the contacted and call-done Lead_Status sets, and `PIPELINE_WON_STAGE` (the
funnel subset that excludes Corporates).

## Bugs to fix, not port

- `subtype/route.js` initializes buckets with uppercase keys but writes with
  title-case keys, so Direct and Sponsored either throw or under-count. Fix.
- `lead-sources/route.js` reads only the first 100 leads (v2, no pagination), so
  counts are wrong past 100. Aggregate over the full cached leads read.
- Leads segment by Layout and deals by Pipeline; unmapped records silently drop.
  Add an Other bucket so totals reconcile.

## UI

`app/(dash)/crm/page.tsx`, a `'use client'` page in the dash route group. Four
`ThemeTabs`. Each period-aware section owns a `Pills` control. Overview: KPI grid,
per-pipeline month-over-month cards, two `FunnelBars`. Leads: `FunnelBars` with a
segment toggle, `MiniBars` sources, `DataTable` (initials, CSV without names).
Deals: layout and pipeline pills, stage `FunnelBars`/`MiniBars`, quality and raw
`DataTable`s, journey and sub-type `KpiCard` tiles. Analytics: `MiniBars`
(velocity, losses, geo, specialty), the lead-to-booking cohort, `KpiCard`s.
Register the `crm` view, title, and sidebar entry.

## Open per-tab decisions (settle when the tab is reached)

- Geographic and specialty source: the repo's `classification.ts`
  (`localityOfDestination`, `specialtyGroupOf` on the deal country and reason
  fields) or the old Tag-based approach. Recommendation: `classification.ts`.
- Include the lead contact-rate and lead-to-deal velocity (needs `Modified_Time`
  added to the leads read and a leads cache-key bump). Recommendation: include,
  after confirming the current Lead_Status vocabulary.
- Pipeline staleness (value-at-risk age buckets) and lost-value-over-time were
  client-side on the old page. Recommendation: back them with a small server
  aggregation or reuse `pipeline_losses` rather than compute on the client.

## Build order (each step CI-green, then a focused commit)

1. Page shell: route, `DeepLink` view, title, sidebar entry, empty `ThemeTabs`.
2. Overview: `crm_metrics`, `crm_funnel`.
3. Leads: `crm_leads`, `crm_lead_sources`, `crm_lead_funnel`.
4. Deals: `crm_deals`, `crm_pipeline`, `crm_journey`, `crm_subtype`.
5. Analytics: reuse velocity, losses, lead-to-booking; add `crm_segments` and
   optionally `crm_lead_velocity`.

## Testing and verification

- A fixture per new endpoint, `satisfies` its contract type, covering the edge
  cases (empty pipeline, unmapped Layout or Pipeline, Unknown source, divide-by
  -zero rate guards).
- `npm run ci`, `npm run build`, and `npm run smoke:fixtures` green at each step.
- Privacy: verify initials-only rows and name-free CSV as a name-seer and a non
  -seer.
- Reconcile counts against the old dashboard for one period and one pipeline per
  tab before calling that tab done.

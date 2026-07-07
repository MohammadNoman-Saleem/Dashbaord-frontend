# Appointments and CRM pages (full analytics, new design)

Date: 2026-06-30
Status: draft for review
Branch: to be created from main

## Goal and scope

Add two standalone pages to saleem-web, ported from the old Analytics-Dashboard
(`D:/saleem/Analytics-Dashboard`) but rebuilt in the new design system and data
seam. Both are full analytics pages (the user chose full parity, not the lean
panels the v3 spec describes), with their own sidebar entries, read-only in v1.

- Appointments: `/appointments`, a Zoho Appointment_Bookings analytics page.
- CRM: `/crm`, a four-tab Zoho CRM analytics page.

Out of scope for v1: any write action on either page; the other tracked gaps
(service filter, MTL leads, pulse strip, blockers, provider-scope and
running-late filters, document generation). Those are separate efforts.

## Source of truth

- Behavior and exact aggregation logic to port: the old routes and pages, named
  per section below. Port the Zoho module names, field api_names, pipeline and
  stage string constants, and aggregation math verbatim from those files. Do NOT
  infer Zoho stage or pipeline strings; copy them from the old routes.
- Visual language: the new dashboard's existing analytics pages (`funnels`,
  `financials`, `marketing`) and the chart primitives in `components/charts/`.

## Cross-cutting conventions (binding)

- Privacy: Appointments may show a patient name only to name-seers (Fatima,
  Razan) through `components/ui/PatientRef.tsx`; everyone else sees the Zoho ID
  and initials. CRM stays initials-only on record columns. No CSV export ever
  contains a patient name, phone, or budget. The server gates name fields, and
  the global PII sweep in `lib/server/privacy.ts` is the backstop.
- Read-only: no write actions in v1. If a write is added later it routes through
  the personal-ops-assistant skill, never a direct Zoho call.
- Charts: use the existing primitives only (`MiniBars`, `FunnelBars`,
  `RetentionGrid`, `Spark` in `components/charts/`). Do not add Recharts or any
  charting dependency. If a needed chart shape does not exist, build a small
  token-based primitive in `components/charts/`, never a color literal.
- Data seam: every read goes service to route to `{ data, meta }` envelope to
  `fetchEnvelope`/`useRefreshableEnvelope`, typed against hand-written
  `lib/api/contract.ts`. Degraded sources return null with authored
  `meta.reasons`, never zeros.
- Money is BHD, formatted `fmtBHD` ("BHD 4,180"). Dates and times via
  `lib/format/datetime.ts`. No em or en dashes, no color literals outside
  `styles/tokens.css`, no hype. `npm run ci` must pass.
- Caching: CRM and appointment reads are Zoho, so they go through
  `getCrmRead`-style cached reads (`lib/server/cache.ts`, 10 minute TTL) or a
  new cached service following that pattern. Heavy Zoho list scans set
  `maxDuration` on the route as the old routes did.

## How a page is added (the repeatable pattern)

For each new page and each new endpoint:

1. Page: `app/(dash)/<view>/page.tsx` (`'use client'`, Grid layout, follow
   `app/(dash)/funnels/page.tsx`).
2. Register the view: add `<view>` to the DeepLink view union in
   `lib/api/contract.ts`, a title and sub in `config/titles.ts`, and a NavItem
   (with a lucide icon) in `components/shell/Sidebar.tsx`.
3. Per endpoint: add the response type to `lib/api/contract.ts`; add the
   `EndpointKey` and mode to `config/endpoints.ts`; add a `qk` factory in
   `lib/api/keys.ts`; add the service in `lib/server/services/`; add the route
   `app/api/.../route.ts` (`runtime='nodejs'`, wrapped in `handler()`, returns
   `withMeta(...)`); add a fixture in `lib/fixtures/` and register it in
   `lib/fixtures/index.ts`.
4. Consume via `useRefreshableEnvelope` inside a `QueryPanel`.
5. `npm run ci`, then `npm run build`.

## Appointments page

Route `/appointments`. Port reference: `Analytics-Dashboard/app/appointments/page.js`,
`.../app/api/zoho/appointments/route.js`, `.../app/api/zoho/appointments/cohorts/route.js`,
`.../components/charts/DoctorRevenueChart.jsx`, `.../components/widgets/BookingCohorts.jsx`.

Sections (top to bottom):

1. Period filter: MTD, QTD, YTD, all-time. Drives a refetch.
2. KPI cards (4): Total appointments, Completed, Revenue (BHD), Completion rate.
   Use `KpiCard`.
3. Stage pipeline: a `MiniBars` over the six stages in order (Pending Payment,
   Pending, Confirmed, Session Started, Awaiting Review, Done), count per stage.
4. Doctor breakdown: `MiniBars` (count, done, revenue per doctor). The old
   Recharts `DoctorRevenueChart` maps to `MiniBars`; if the grouped shape needs
   more, add a small primitive.
5. Recent appointments table: `DataTable` with columns Appointment, Patient
   (via `PatientRef`), Doctor, Status (Chip), Fee BHD (right-aligned), Date.
   CSV export, gated to exclude names.
6. Booking retention cohort: `RetentionGrid`, sourced from the existing
   `/api/growth/retention` `booking_cohorts` shape (`GrowthRetentionData`).
   Do not duplicate the Zoho cohort scan.

Backend:

- Existing `app/api/appointments/route.ts` to `appointmentsService.board()`
  returns `{ today, recent_done }` (contract `AppointmentsData`). Keep it for the
  home/cases panel; it does not cover this page.
- Add `appointmentsService.analytics(period, viewer)` in
  `lib/server/services/appointments.ts` returning `{ metrics, stage_breakdown,
  by_doctor, recent }`, porting the aggregation from the old appointments route
  (Zoho module `Appointment_Bookings`, fields Status, Rate, Doctor, Patient,
  Created_At, Name; exclude Rate <= 1 as test bookings; period start logic).
- Add route `app/api/appointments/analytics/route.ts` (or a `?view=analytics`
  branch on the existing route). New contract type `AppointmentsAnalyticsData`.
  New `EndpointKey`, `qk` key, and fixture.
- Cohort: reuse `/api/growth/retention`; no new endpoint.

## CRM page

Route `/crm`. Four tabs via `ThemeTabs`. Port reference: `Analytics-Dashboard/app/crm/page.js`
(1,992 lines) and the old routes `app/api/zoho/crm/{metrics,leads,lead-sources,pipeline,funnel,sla,deals,journey,subtype,lead-funnel}/route.js`.

Tabs and content:

1. Overview: summary KPI cards (total and MTD leads with MoM delta, total and
   MTD deals, open deals, total won, pipeline value BHD); per-pipeline MoM
   mini-cards for all five pipelines (Telemedicine, Treatment, Corporates,
   Doctor, Hospital or Clinic); monthly funnels for Customers and Providers
   (`FunnelBars`) with a period filter.
2. Leads: lead-conversion funnel (`FunnelBars`) with segment toggle (All,
   Customers, Providers) and period filter; lead-sources (`MiniBars`); all-leads
   `DataTable` (sortable, filter by Lead_Status, CSV export, initials only).
3. Deals: pipeline stage bar (`MiniBars`) with layout tabs (Customer,
   Corporates, Provider) and win/loss/open badges; pipeline-quality table
   (stage conversion rates); treatment-journey breakdown (Assisted, Navigation,
   Untagged) when Treatment is selected; customer sub-type (Direct vs Sponsored);
   all-deals `DataTable` (sortable, filter by pipeline, CSV export).
4. Analytics: SLA per pipeline (`MiniBars`) with custom date range; loss-reasons
   (`MiniBars`, count or value toggle); geographic and specialty tag breakdowns
   (`MiniBars`); lead-to-booking cohort via the existing `/api/growth/retention`.

Backend:

- Existing `app/api/crm/route.ts` to `getCrmSliceService().slice()` returns the
  paginated `CrmSliceData`. Keep it; it backs the lean slice but not these tabs.
- Add one cached service plus route per old endpoint: metrics, lead-sources,
  pipeline, funnel, lead-funnel, sla, deals, journey, subtype, and the all-leads
  table feed. Each gets a contract type, `EndpointKey`, `qk` key, and fixture.
  Port the exact Zoho queries, pipeline and stage constants, and aggregation
  from the matching old route file. Reuse `/api/growth/retention` for the
  lead-to-booking cohort.
- Many of these scan Zoho lists; set `maxDuration` on those routes as the old
  ones did, and run independent reads with `Promise.all`.

## Build sequence (phased, each phase is shippable and CI-green)

1. Appointments page: the analytics endpoint and the full page. Smaller, proves
   the chart-primitive mapping and the new analytics-page pattern.
2. CRM tab by tab, in this order: Overview, Leads, Deals, Analytics. Each tab is
   its own set of endpoints plus UI, committed when green.
3. Sidebar entries and titles land with phase 1 (Appointments) and the first CRM
   phase (the page shell appears once the Overview tab is in).

Each phase: add endpoints and contract types, build the tab UI, update fixtures,
`npm run ci` and `npm run build`, then a focused commit.

## Open items to verify during implementation

- The exact Zoho pipeline names and per-pipeline stage strings, and won/lost
  stage detection, copied verbatim from the old `pipeline/route.js` and the
  other old routes. Never inferred.
- Whether the doctor-breakdown and per-pipeline MoM visuals need a new small
  chart primitive or fit `MiniBars` as-is.
- The exact shape the existing `/api/growth/retention` returns, to render both
  cohort widgets without a new scan.
- The new dashboard's `DataTable` capabilities (server vs client sort, CSV
  export hook) before wiring the sortable, exportable tables.

## Testing and verification

- `npm run ci` (dashes, red, hype, patient, typecheck, lint), `npm run build`,
  and `npm run smoke:fixtures` pass at each phase.
- Fixtures for every new endpoint, type-aligned via `satisfies`.
- Manual: as a name-seer the Appointments patient column shows the name; as a
  non-name-seer it shows initials and the Zoho ID. No CSV export contains a name.
- Numbers reconciled against the old dashboard for at least one period and one
  pipeline before a phase is called done.

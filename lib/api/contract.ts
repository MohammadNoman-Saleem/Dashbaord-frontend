// Endpoint data shapes per 03_Backend_Spec.md section 7, hand-written for the
// fixtures-first phase. As each live endpoint lands in saleem-api, its DTO
// becomes the source of truth via the generated OpenAPI types and the
// matching type here is replaced by a re-export. Fixtures import these types,
// so a contract change that breaks a fixture fails the typecheck.
//
// Patient privacy: fixture data is FICTIONAL. patient_name appears only in
// fixtures simulating a Fatima or Razan session, mirroring the server rule
// that everyone else's payloads do not contain the field at all.

export interface PatientRefData {
  zoho_id: string
  initials: string
}

export interface DeepLink {
  view: 'home' | 'cases' | 'board' | 'funnels' | 'marketing' | 'financials' | 'kpis' | 'agents' | 'payouts'
  tab?: string
  focus?: string
}

// /api/pulse
export interface PulseBlip {
  key: string
  title: string
  text: string
  link: DeepLink
  severity: 'quality' | 'agent' | 'staleness' | 'rate_limit'
}
export interface PulseData {
  blips: PulseBlip[]
  steady_count: number
  updated_at: string
}

// /api/kpi/strip?person=
export interface KpiStripCard {
  metric_key: string
  label: string
  value_display: string
  small?: string
  bar_pct?: number
  bar_state?: 'default' | 'good' | 'warn'
  spark?: number[]
  note?: string
  dot?: 'good' | 'warn' | 'mut'
}

// /api/kpi/targets?month=
export interface KpiTargetRow {
  id: string
  person_key: string
  person_name: string
  metric_key: string
  label: string
  month: string
  target: number
  current: number
  direction: 'at_least' | 'at_most'
  source: 'auto' | 'manual'
  auto_feed: string | null
  unit: 'count' | 'bhd' | 'pct'
  updated_at: string
  can_edit: boolean
  /** True when GET /api/kpi/drill can list the records behind the number. */
  drillable: boolean
}

// /api/kpi/drill?metric_key=&month=
// The reference-only record list behind an auto metric's number. Rows carry
// initials through the PatientSerializer, never names; the shape is dynamic
// (columns drive the table), so rows are an open map keyed by column key.
export interface KpiDrillColumn {
  key: string
  label: string
  numeric?: boolean
}
export interface KpiDrillData {
  metric_key: string
  month: string
  columns: KpiDrillColumn[]
  rows: Array<Record<string, string | number | null>>
  /** Full count behind the number; rows may be a capped slice of it. */
  total: number
  summary: string | null
}

// /api/kpi/team-summary?month=
export interface TeamSummaryRow {
  person_key: string
  name: string
  pct: number
  state: 'ahead' | 'behind' | 'on_track'
  summary_display: string
}
export interface TeamSummaryData {
  rows: TeamSummaryRow[]
}

// /api/deliverables?month=
export interface DeliverableRow {
  id: string
  title: string
  owner_keys: string[]
  month: string
  status: 'done' | 'on_track' | 'in_progress' | 'in_review' | 'needs_start'
  progress_note: string
  measured_auto: boolean
  due_date: string | null
  updated_at: string
  /** True when the viewer may change this row's status (admin any, dept
   *  head own team). Controls render only where the server says so. */
  can_edit: boolean
}

// /api/admin/users  (admin only; the real viewer, never ?as=)
export interface AdminUserRow {
  key: string
  name: string
  role: 'admin' | 'dept_head' | 'member'
  department: string | null
  last_login: string | null
  must_reset: boolean
}
// POST /api/admin/users  -> the new row plus a one-time temporary password.
export interface AdminUserCreated {
  user: AdminUserRow
  /** Shown once. Handed over out of band; never stored. */
  temp_password: string
}
// POST /api/admin/users/:key/reset-password
export interface PasswordReset {
  key: string
  /** Shown once. Handed over out of band; never stored. */
  temp_password: string
  must_reset: boolean
}

// /api/attention?person=
export interface AttentionItem {
  icon: string
  warn: boolean
  title: string
  text: string
  link: DeepLink
}

// /api/blockers
// Mirrors the urgent board grammar with different ownership semantics:
// urgent means "needs attention now, anyone can act"; a blocker means
// "I am stuck, Aziz owns the unblock" (06 section F, 07 section 3).
export interface BlockerItem {
  id: string
  text: string
  waiting_on: string | null
  raised_by: string
  raised_by_name: string
  raised_at: string
  /** Plain age served by the API ("3d", "4h"). */
  age_label: string
  status: 'open' | 'unblocked' | 'withdrawn'
  /** Prior blocker id when repeat detection matched. */
  repeat_of: string | null
  /** True on the second occurrence; triggers the root cause review. */
  root_cause_flag: boolean
  resolution_note: string | null
}
export interface BlockersData {
  open: BlockerItem[]
  /** Resolved in the last 7 days. */
  resolved: BlockerItem[]
}

// /api/leads/medical-travel?from=&to=
// Single source for the Cases card, the Marketing campaign card, and the
// p-mtl home panel (07 section 3). Every Meta-derived field is nullable:
// totals.meta_leads, the cpl block, spend, reconciliation, and
// daily[].spend_usd are null until the Meta connector reports, and
// meta.reasons carries why.
export type CorridorStatus = 'live' | 'proposal' | 'final_stages' | 'developing' | 'not_contacted'
export interface MtlActionRow {
  /** Lead reference, "L01" style. Never a name, for any viewer. */
  ref: string
  from: string
  destination: string
  treatment: string
  status: 'converted' | 'waiting' | 'new'
  /** Zoho deal stage, set when status is converted. */
  deal_stage: string | null
  zoho_lead_id: string
}
export interface MtlRead {
  key: string
  title: string
  /** Server-rendered sentence with the live numbers in it. */
  body: string
}
export interface MedicalTravelLeadsData {
  period: { from: string; to: string; partial_day: boolean; campaign_day: number }
  totals: {
    zoho_leads: number
    meta_leads: number | null
    outside_bahrain_pct: number
    gcc_countries: number
    converted: number
  }
  cpl: {
    basis: string
    blended_usd: number
    blended_bhd: number
    first_week_usd: number
    since_usd: number
    split_date: string
    delta_pct: number
    fatigue: boolean
  } | null
  spend: { usd: number; bhd: number } | null
  daily: Array<{ date: string; leads: number; spend_usd: number | null }>
  origins: Array<{ country: string; n: number; inferred_n: number }>
  destinations: Array<{ group: string; n: number; corridor_status: CorridorStatus }>
  specialties: Array<{ group: string; n: number }>
  statuses: {
    converted: number
    intro_done: number
    waiting: number
    new: number
    not_qualified: number
  }
  action_rows: MtlActionRow[]
  reads: MtlRead[]
  reconciliation: { meta: number; zoho: number; gap: number; gap_age_hours: number } | null
}

// /api/urgent
export interface UrgentItem {
  id: string
  text: string
  raised_by: string
  raised_by_name: string
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}
export interface UrgentData {
  open: UrgentItem[]
  resolved: UrgentItem[]
}

// /api/pipeline/priorities?person=
export interface PriorityRow {
  patient_ref: PatientRefData
  patient_name?: string
  /** tone: info = new lead, warn = going quiet, good = today's follow-up */
  why_now: { label: string; tone: 'info' | 'warn' | 'good' }
  /** Classified server-side (07 section 2): Telemedicine pipeline deals are
   *  tele, Treatment pipeline deals are travel. */
  service: 'tele' | 'travel'
  /** Stage or context word shown after the service chip ("spine",
   *  "consult payment"). May be empty. */
  pipeline: string
  waiting_display: string
  next_step: string
  source: string
}
export interface PrioritiesData {
  rows: PriorityRow[]
  counts: { shown: number; queued: number; dormant: number }
}

// /api/cases/summary (the four KPI cards on /cases; reuses the strip card shape)
export interface CasesSummaryData {
  cards: KpiStripCard[]
}

// /api/pipeline/health
export interface LateItem {
  what: string
  promise_plain: string
  owner: string
  over_by_days: number
  /** Derived from the deal's layout (07 section 2): Customers gives patient,
   *  Provider gives provider, Corporates gives corp. */
  kind: 'patient' | 'provider' | 'corp'
}
export interface PipelineHealthData {
  items: LateItem[]
}

// /api/pipeline/providers
export interface ScopeBlock {
  stages: Array<{ label: string; count: number }>
  /** Per-scope footer sentence, assembled server-side with the live numbers. */
  foot: string
}
export interface ProvidersData {
  scopes: { all: ScopeBlock; local: ScopeBlock; intl: ScopeBlock }
  /** Providers with no country set. Surfaced in the All footer, never
   *  silently bucketed. */
  unclassified: number
}

// /api/handoffs
export interface HandoffsData {
  on_time_pct: number
  on_time_count: number
  total: number
  misses: Array<{ what: string; owner: string; cause: string; when: string }>
}

// /api/appointments
export interface AppointmentRow {
  time: string
  doctor: string
  patient_ref: PatientRefData
  patient_name?: string
  product: string
  fee_bhd: number
  fee_state: 'paid' | 'hold' | 'done'
}
export interface AppointmentsData {
  today: AppointmentRow[]
  recent_done: AppointmentRow[]
}

// /api/financials
export interface FinancialsData {
  platform_revenue: {
    month_bhd: number
    vs_prev_pct: number
    split_plain: string
    spark: number[]
    verified: boolean
  }
  invoices: Array<{
    id: string
    customer: string
    amount_bhd: number
    status: 'awaiting' | 'paid'
    due_display: string
  }>
  outstanding_bhd: number
  /** Null until the payout rules work lands; meta carries the reason. */
  payouts_due_bhd: number | null
  saleem_share_bhd: number | null
  treatment_manual_bhd: number | null
}

// /api/crm?resource=&page=&page_size=
export interface CrmSliceData {
  columns: Array<{ key: string; label: string; numeric?: boolean }>
  rows: Array<Record<string, string | number | null>>
  page: number
  pages: number
  total: number
}

// /api/marketing
export interface MarketingData {
  /** Tiles without a wired source (Meta connector pending) are null with a
   *  meta reason; the target is null when no KPI row exists this month. */
  tiles: {
    leads: { value: number; target: number | null }
    cpl: { value_bhd: number; cap_bhd: number } | null
    whatsapp_reply_pct: { value: number; target: number } | null
    ig_reach: { value: number; spark: number[] } | null
  }
  channels: Array<{ channel: string; leads: number; spend_bhd: number | null; cpl_display: string; read: string }>
  moves: Array<{ title: string; text: string }>
}

// /api/funnels/:tab
export interface FunnelStep {
  label: string
  count: number
  pct_of_first: number
}
export interface FunnelGeneralData {
  tiles: {
    /** Null when Mixpanel sessions are not enabled for the project. */
    site_visits: number | null
    consult_page_views: number
    booking_starts: number
    /** Null when the dead click event is not instrumented in Mixpanel. */
    dead_clicks: number | null
  }
  /** Empty when site visits are not measured (see site_visits). */
  visits_14d: number[]
  top_pages: Array<{ label: string; views: number }>
}
export interface FunnelDirectData {
  variant: 'full' | 'instant'
  steps: FunnelStep[]
  end_to_end_pct: number
  paid_verified: boolean
  readings: { biggest_drop: string; healthy_step: string; owner: string }
}
export interface FunnelUiuxData {
  dead_clicks: Array<{ component: string; count: number; call: 'Fix queued' | 'Leave' | 'Watch' }>
  frustration: Array<{ signal: string; detail: string }>
}
export interface FunnelScheduledData {
  steps: FunnelStep[]
  confirmed_by_specialty: Array<{ label: string; count: number }>
}
export interface FunnelNovoData {
  tiles: {
    landing_views: { value: number; chip: 'measured' }
    funnel_says_paid: { value: number; chip: 'misreading' }
    /** Null until the admin panel supplies the verified count. */
    real_consults: { value: number | null; chip: 'verified' }
    bmi_checks: { value: number }
  }
  funnel: FunnelStep[]
  ctas_by_type: Array<{ label: string; count: number; not_instrumented?: boolean }>
  bmi_categories: Array<{ label: string; count: number }>
  landing_by_campaign: Array<{ label: string; views: number }>
}

// /api/agents
export interface AgentRow {
  key: string
  label: string
  describes: string
  last_run_display: string
  next_run_display: string
  status: 'success' | 'running' | 'stalled' | 'error'
  error_plain: string | null
}
export interface SourceRow {
  key: string
  label: string
  status: 'steady' | 'attention'
  detail_plain: string
}
export interface AgentsData {
  agents: AgentRow[]
  sources: SourceRow[]
}

// /api/board?scope=
// Department kanban over Zoho Projects: the five department tasklists in
// the IT project plus the whole cross-department project as one scope each.
// Columns arrive in the legacy board order with unknown statuses appended
// server-side, so the client renders them as given and never re-sorts.
export interface BoardCard {
  id: string
  title: string
  owner: string
  /** "Jun 12" or null when the task has no due date. */
  due_display: string | null
  /** Zoho priority (None/Low/Medium/High) or null when unset. */
  priority: string | null
  /** Tasklist name, or null when Zoho omits it. */
  tasklist: string | null
  status: string
}
export interface BoardColumn {
  status: string
  /** Zoho status type (open/inprogress/closed) when known. */
  status_type: string | null
  count: number
  cards: BoardCard[]
}
export interface BoardData {
  scope: string
  scope_label: string
  project_id: string
  project_name: string
  columns: BoardColumn[]
}

// POST /api/it-support
export interface ItSupportTicketData {
  /** Zoho task id of the new ticket; null only if Zoho answered without one. */
  ticket_id: string | null
}

// /api/tasks
export interface TasksData {
  rows: Array<{ title: string; owner: string; status: string; due_display: string }>
}

// /api/brief/latest
export interface BriefData {
  compiled_at: string
  highlights: Array<{ title: string; text: string; good: boolean }>
  sections: Array<{ title: string; content: string; ran_at: string }>
}

// /api/payouts/*
export interface PayoutsSummaryData {
  patients_paid_bhd: number
  provider_payouts_bhd: number
  cycle_close_note: string
  saleem_revenue_bhd: number
  needs_review_count: number
}
export interface PayoutBookingRow {
  id: string
  provider: string
  product: string
  patient_paid_bhd: number
  provider_payout_bhd: number
  /** Positive Saleem share. Mutually exclusive with covers_bhd. */
  saleem_share_bhd?: number
  /** Free-to-patient rows: what Saleem covers. Never rendered as a minus. */
  covers_bhd?: number
  rule_label: string
  manual: boolean
}
export interface PayoutsBookingsData {
  rows: PayoutBookingRow[]
}
export interface PayoutsRulesData {
  rules: Array<{ id: number; priority: number; rule_type: 'campaign' | 'fixed_fee' | 'percent'; label: string; params_display: string }>
}

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

// /api/pipeline/staleness
// One scope per pipeline plus "all", computed server-side, so the scope
// switch never refetches. Owners lists only deals untouched for over 30
// days, the weekly chase list.
export interface StalenessBucket {
  key: string
  label: string
  count: number
  value_bhd: number
}
export interface StalenessOwnerRow {
  owner: string
  count: number
  value_bhd: number
  top_stage: string
}
export interface StalenessScope {
  scope: string
  label: string
  buckets: StalenessBucket[]
  owners: StalenessOwnerRow[]
}
export interface PipelineStalenessData {
  scopes: StalenessScope[]
}

// /api/pipeline/momentum
export interface MomentumPipeline {
  pipeline: string
  total: number
  this_month: number
  last_month: number
  /** Null when last month had no new deals; nothing honest to compare. */
  change_pct: number | null
  open: number
  won: number
  lost: number
  win_rate_pct: number
  loss_rate_pct: number
  total_value_bhd: number
}
export interface PipelineMomentumData {
  /** Server-authored, e.g. "June so far vs May". */
  compare_label: string
  pipelines: MomentumPipeline[]
}

// /api/pipeline/losses
// Trend bucketed on close date (last update as fallback), trailing 12
// months. cross.rows[i].counts align with cross.sources by index.
export interface LossMonth {
  key: string
  label: string
  count: number
  value_bhd: number
}
export interface LossOwnerRow {
  owner: string
  count: number
  value_bhd: number
}
export interface LossCross {
  sources: string[]
  rows: Array<{ reason: string; counts: number[] }>
}
export interface PipelineLossesData {
  months: LossMonth[]
  owners: LossOwnerRow[]
  cross: LossCross
  totals: { lost_count: number; lost_value_bhd: number; top_reason: string | null }
}

// /api/pipeline/velocity
// Open-deal stage ages are an approximation (days since the deal was
// created, grouped by current stage); won is the real created-to-close
// cycle time.
export interface VelocityStats {
  count: number
  avg_days: number
  min_days: number
  max_days: number
}
export interface VelocityStage extends VelocityStats {
  name: string
}
export interface VelocityPipeline {
  pipeline: string
  stages: VelocityStage[]
  won: VelocityStats | null
  fastest: { name: string; avg_days: number } | null
  bottleneck: { name: string; avg_days: number } | null
  open_avg_days: number
}
export interface PipelineVelocityData {
  pipelines: VelocityPipeline[]
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

// /api/financials/forecast
// Pipeline-weighted revenue forecast: open deals bucketed by expected close
// month, amounts weighted by per-deal Zoho probability with the pipeline
// win-rate fallback. Overdue and undated buckets keep deals with past or
// missing close dates visible.
export interface ForecastBucket {
  weighted_bhd: number
  unweighted_bhd: number
  deal_count: number
}
export interface ForecastMonth extends ForecastBucket {
  key: string
  label: string
}
export interface FinancialsForecastData {
  months: ForecastMonth[]
  overdue: ForecastBucket
  undated: ForecastBucket
  won_to_date_bhd: number
  by_pipeline: Array<{ pipeline: string; weighted_bhd: number }>
  /** Server-authored sentence describing which weights carried the number. */
  weight_note: string
}

// /api/financials/burn
export interface FinancialsBurnData {
  this_month_bhd: number
  last_month_bhd: number
  change_pct: number
  months: Array<{ key: string; label: string; burn_bhd: number; revenue_bhd: number }>
  by_category: Array<{ category: string; total_bhd: number; this_month_bhd: number }>
  /** Server-authored sentence naming the revenue definition in the join. */
  revenue_note: string
}

// /api/financials/receivables
// Customers here are partners and corporates, never patients.
export interface FinancialsReceivablesData {
  total_bhd: number
  open_count: number
  overdue_count: number
  /** Null when nothing was invoiced in the trailing 90 days; meta carries why. */
  dso_days: number | null
  buckets: Array<{ key: string; label: string; invoice_count: number; amount_bhd: number }>
  late_payers: Array<{
    customer: string
    open_invoices: number
    balance_bhd: number
    oldest_overdue_days: number
  }>
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

// /api/growth/engagement
export interface GrowthTrendPoint {
  date: string
  dau: number
  rolling_avg: number
}
export interface GrowthEngagementData {
  active_users: {
    dau: number
    mau: number
    stickiness_pct: number
    /** The event behind DAU/MAU, surfaced so the UI labels it honestly. */
    event: string
    trend_30d: GrowthTrendPoint[]
  }
  top_events: Array<{
    name: string
    count_7d: number
    count_30d: number
    /** Null when the prior week had no events (no honest base for a trend). */
    trend_pct: number | null
  }>
  traffic: {
    window_days: number
    homepage_views: number
    consult_views: number
    trend_homepage_pct: number | null
    trend_consult_pct: number | null
    /** Null when Mixpanel returned no $os buckets for the window. */
    device_split: { mobile: number; desktop: number; other: number } | null
  }
}

// /api/growth/retention
export interface RetentionCohortRow {
  /** Cohort start date, YYYY-MM-DD (week of first visit, not an identity). */
  date: string
  size: number
  /** Percent retained per column; null when the bucket has not matured. */
  cells: Array<number | null>
}
export interface GrowthRetentionData {
  /** Null when Mixpanel is rate limited with nothing saved yet. */
  behaviour: {
    born_event: string
    return_event: string
    columns: string[]
    visits: RetentionCohortRow[]
    bookings: RetentionCohortRow[]
  } | null
  lead_to_booking: {
    by_source: Array<{
      source: string
      leads: number
      booked: number
      conversion_pct: number
      median_days: number | null
    }>
    overall: { leads: number; booked: number; conversion_pct: number; median_days: number | null }
    leads_total: number
    leads_with_email: number
    definition: string
  }
  booking_cohorts: {
    cohorts: Array<{
      key: string
      label: string
      size: number
      repeat_1m_pct: number | null
      repeat_2m_pct: number | null
      repeat_3m_pct: number | null
      repeat_revenue: number
      first_revenue: number
    }>
    identified_patients: number
    definition: string
  }
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

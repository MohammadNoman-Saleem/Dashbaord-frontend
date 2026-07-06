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
  /** Internal Zoho record id. The case-file lookup key; never shown to users. */
  zoho_id: string
  initials: string
  /** Human-readable Zoho reference the team identifies records by (Leads
   *  "Zoho Lead ID" autonumber, Deals "Zoho ID" text). Shown next to the
   *  initials. Only the cockpit serves it today; optional elsewhere. */
  ref?: string
  /** True when the record had no Zoho_ID and ref falls back to the internal
   *  record id. The UI marks the fallback rather than passing it off as a
   *  real Zoho number. */
  ref_is_fallback?: boolean
}

export interface DeepLink {
  view: 'home' | 'cockpit' | 'cases' | 'board' | 'funnels' | 'marketing' | 'financials' | 'kpis' | 'agents' | 'social' | 'appointments' | 'crm'
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
  /** Zoho task id when raised as an Ops item (dual write); null otherwise. */
  zoho_task_id: string | null
}
export interface BlockersData {
  open: BlockerItem[]
  /** Resolved in the last 7 days. */
  resolved: BlockerItem[]
}

// POST /api/blockers/ops
// The Ops-type "Raise" dual write: one Zoho Cross-Dept/Ops task plus one
// Postgres blocker for Aziz. Each leg is independent; a partial outcome is
// reported honestly (the failed leg carries its reason, never silently
// dropped).
export interface OpsRaiseResultData {
  zoho_task_id: string | null
  blocker: BlockerItem | null
  zoho_error: string | null
  blocker_error: string | null
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
  /** Human-readable Zoho Lead ID (autonumber); falls back to the internal
   *  record id when the autonumber is blank. This is what the LEAD column shows. */
  zoho_ref: string
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
  /** The cockpit case lookup key: the lead's or deal's own record id. Distinct
   *  from patient_ref.zoho_id, which is the contact id on deal rows. */
  case_id: string
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
  id: string
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

// /api/appointments/analytics
export type AppointmentsPeriod = 'mtd' | 'qtd' | 'ytd' | 'all'
export interface AppointmentsAnalyticsRow {
  id: string
  name: string
  patient_ref: PatientRefData
  patient_name?: string
  doctor: string
  status: string
  type: string | null
  fee_bhd: number
  date: string | null
  // Per-consult commission split, mirroring the Commission tab ledger. Present
  // only on completed consults (Done or Awaiting Review) that resolved a split;
  // absent on not-yet-completed rows, which read as a dash. Never summed into
  // fee_bhd, which stays the gross the patient paid.
  saleem_bhd?: number
  provider_payout_bhd?: number
  rule_label?: string
}
export interface AppointmentsStageCount { name: string; count: number }
export interface AppointmentsDoctorRow { name: string; count: number; done: number; revenue_bhd: number; saleem_income_bhd?: number; commission_pct?: number | null }
export interface AppointmentsAnalyticsMetrics { total: number; completed: number; revenue_bhd: number; completion_rate_pct: number; gross_income_bhd?: number; saleem_income_bhd?: number; commission_unset?: number }
// Reconciliation diagnostic (revenue spec, step 1). status_breakdown is every
// Status present in the window with its count and gross, so the completed-basis
// gap is visible. type_distribution is every distinct raw Type with its
// normalized form, count, and the track the engine currently assigns, so the
// Novo set can be completed from real spellings.
export interface AppointmentsStatusCount { status: string; count: number; gross_bhd: number }
export interface AppointmentsTypeCount { type_raw: string; type_normalized: string; count: number; track: 'novo' | 'standard' }
export interface AppointmentsAnalyticsData {
  period: AppointmentsPeriod
  metrics: AppointmentsAnalyticsMetrics
  stage_breakdown: AppointmentsStageCount[]
  by_doctor: AppointmentsDoctorRow[]
  status_breakdown: AppointmentsStatusCount[]
  type_distribution: AppointmentsTypeCount[]
  recent: AppointmentsAnalyticsRow[]
}

// /api/crm/metrics
export interface CrmPipelineMetric {
  total: number
  this_month: number
  last_month: number
  change_pct: number
  won: number
  lost: number
  open: number
  value_bhd: number
  win_rate_pct: number
  loss_rate_pct: number
}
export interface CrmMetricsData {
  total_leads: number
  total_deals: number
  total_leads_this_month: number
  total_leads_last_month: number
  leads_change_pct: number
  total_deals_this_month: number
  total_deals_last_month: number
  deals_change_pct: number
  total_deals_open: number
  total_won: number
  pipeline_value_bhd: number
  by_pipeline: Record<string, CrmPipelineMetric>
}

// /api/crm/funnel
export type CrmFunnelPeriod = 'mtd' | 'ytd' | 'all'
export type CrmFunnelSegment = 'Customers' | 'Providers'
export interface CrmFunnelMonthPoint { month: string; leads: number; deals: number; won: number }
export interface CrmFunnelSummary { total_leads: number; total_deals: number; total_won: number; leads_to_deals_pct: number; deals_to_won_pct: number }
export interface CrmFunnelData {
  funnels: Record<CrmFunnelSegment, CrmFunnelMonthPoint[]>
  summary: Record<CrmFunnelSegment, CrmFunnelSummary>
  period: CrmFunnelPeriod
}

// /api/crm/lead-sources
export interface CrmLeadSource { name: string; count: number }
export interface CrmLeadSourcesData { sources: CrmLeadSource[] }

// /api/crm/lead-funnel
export type CrmLeadFunnelPeriod = 'all' | 'ytd' | 'mtd'
export interface CrmLeadFunnelStage {
  total: number
  contacted: number
  call_done: number
  deal_ready: number
  converted: number
  not_qualified: number
  contacted_rate: number
  call_done_rate: number
  deal_ready_rate: number
  converted_rate: number
  not_qualified_rate: number
  new_to_contacted: number
  contacted_to_call_done: number
  call_done_to_deal_ready: number
  deal_ready_to_converted: number
}
export interface CrmLeadFunnelData {
  overall: CrmLeadFunnelStage
  by_segment: Record<CrmFunnelSegment, CrmLeadFunnelStage>
  period: CrmLeadFunnelPeriod
}

// /api/crm/leads
export interface CrmLeadRow {
  id: string
  ref: string
  initials: string
  segment: string
  lead_source: string
  lead_status: string
  created: string | null
}
export interface CrmLeadsData {
  rows: CrmLeadRow[]
  page: number
  pages: number
  total: number
  statuses: string[]
}

// /api/crm/pipeline
export type CrmPipelinePeriod = 'all' | 'mtd' | 'ytd'
export interface CrmPipelineStage { name: string; count: number; value_bhd: number }
export interface CrmLossReason { reason: string; count: number }
export interface CrmPipelineSummary {
  stages: CrmPipelineStage[]
  total: number
  won: number
  lost: number
  open: number
  value_bhd: number
  win_rate_pct: number
  loss_rate_pct: number
  loss_reasons: CrmLossReason[]
}
export interface CrmPipelineData {
  pipelines: Record<string, CrmPipelineSummary>
  period: CrmPipelinePeriod
}

// /api/crm/journey
export interface CrmJourneyBreakdown {
  total: number
  won: number
  lost: number
  open: number
  value_bhd: number
  win_rate_pct: number
  loss_rate_pct: number
  stages: Array<{ name: string; count: number }>
  avg_days_to_completion: number | null
  stage_avg_days: Record<string, number | null>
}
export interface CrmJourneyData {
  total: number
  by_tag: Record<string, CrmJourneyBreakdown>
  tags: string[]
}

// /api/crm/subtype
export interface CrmSubtypeBreakdown {
  total: number
  won: number
  lost: number
  open: number
  value_bhd: number
  win_rate_pct: number
  loss_rate_pct: number
}
export interface CrmSubtypeSummary extends CrmSubtypeBreakdown {
  by_pipeline: Record<string, CrmSubtypeBreakdown>
}
export interface CrmSubtypeData {
  total: number
  by_subtype: Record<string, CrmSubtypeSummary>
  subtypes: string[]
}

// /api/crm/deals
export interface CrmDealRow {
  id: string
  record: string
  owner: string
  pipeline: string
  stage: string
  outcome: 'won' | 'lost' | 'open'
  amount_bhd: number
  lead_source: string
  created: string | null
}
export interface CrmDealsData {
  rows: CrmDealRow[]
  page: number
  pages: number
  total: number
  pipelines: string[]
}

// /api/crm/segments
export type CrmSegmentMetric = 'count' | 'amount'
export interface CrmSegmentBar { name: string; value: number }
export interface CrmSegmentsData {
  geographic: CrmSegmentBar[]
  specialty: CrmSegmentBar[]
  metric: CrmSegmentMetric
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
    /** Lead quality over the same window as the leads tile (this calendar
     *  month to date), as real counts off the server-side lead status
     *  classification. won is the converted count; qualified is total minus
     *  the not-qualified count; unclassified counts leads whose Zoho status
     *  the classifier does not recognize (surfaced, never folded into
     *  qualified). */
    lead_quality: { total: number; qualified: number; won: number; unclassified: number }
    cpl: { value_bhd: number; cap_bhd: number } | null
    whatsapp_reply_pct: { value: number; target: number } | null
    ig_reach: { value: number; spark: number[] } | null
  }
  channels: Array<{ channel: string; leads: number; spend_bhd: number | null; cpl_display: string; read: string }>
  moves: Array<{ title: string; text: string }>
}

// /api/funnels/:tab
/** Reporting-period presets the Direct, Scheduled, and Novo tabs switch
 *  between; passed to those routes as ?period=. Mirrors the service's
 *  FunnelPeriod. */
export type FunnelPeriod = 'mtd' | 'qtd' | 'ytd' | 'all'
export interface FunnelStep {
  label: string
  count: number
  pct_of_first: number
}
/** A saved funnel rendered with a name, for the Novo tab's Novo and Direct
 *  comparison grids. end_to_end_pct is the last step as a percent of the first. */
export interface NamedFunnel {
  key: string
  label: string
  steps: FunnelStep[]
  end_to_end_pct: number
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
  novo_funnels: NamedFunnel[]
  direct_benchmarks: NamedFunnel[]
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

// /api/board?tab=&project=&tasklist=
// Kanban over Zoho Projects, grouped into three tabs (Cross-Dept, IT, Other).
// A tab groups projects, the second level picks one project's tasklist, and
// the columns are that tasklist's statuses. Columns arrive in the legacy
// board order with unknown statuses appended server-side, so the client
// renders them as given and never re-sorts.
export interface BoardCard {
  id: string
  title: string
  owner: string
  /** Stable Zoho user id of the owner, or null when unassigned. The assignee
   *  filter matches on this, not the display name (Zoho shows a fuller name
   *  than the users table stores, so name matching misses). */
  owner_zpuid: string | null
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
  tab: string
  tab_label: string
  project_id: string
  project_name: string
  tasklist_id: string | null
  tasklist_name: string | null
  columns: BoardColumn[]
}

// /api/board/projects
// The tab/project/tasklist catalog that backs the board's two selectors.
export interface BoardTasklistRef {
  id: string
  name: string
}
export interface BoardProjectRef {
  id: string
  name: string
  status: string | null
  tasklists: BoardTasklistRef[]
}
export interface BoardTabRef {
  key: string
  label: string
  projects: BoardProjectRef[]
}
export interface BoardCatalogData {
  tabs: BoardTabRef[]
}

// Priority is the closed Zoho set the board edits. None is the unset value;
// the contract carries it as a real choice rather than null so the selector
// can offer "clear the priority" as a deliberate write.
export type BoardPriority = 'None' | 'Low' | 'Medium' | 'High'

// One assignable owner from the Postgres users table (zoho_zpuid not null,
// admin excluded). key is the stable app user key, zpuid the Zoho person id
// the write sends as person_responsible.
export interface BoardAssignableUser {
  key: string
  name: string
  zpuid: string
}

// One recent comment on a task. Read-only history; the add box posts content
// and the detail query refetches to pick the new one up.
export interface BoardComment {
  author: string
  content: string
  time_display: string
}

// GET /api/board/task/:id?project=<zohoProjectId>
// The card detail panel's source. priority may be null when Zoho leaves it
// unset; owner and the display dates are null when Zoho omits them.
// priority_editable is false when the backend's probe found Zoho rejects a
// priority write on an existing task, so the UI renders priority read-only
// with a note rather than shipping a control that silently fails.
export interface BoardTaskDetail {
  id: string
  name: string
  description: string
  status: string
  status_type: string | null
  priority: BoardPriority | null
  owner: string | null
  owner_zpuid: string | null
  due_display: string | null
  created_display: string | null
  modified_display: string | null
  url: string | null
  comments: BoardComment[]
  assignable_users: BoardAssignableUser[]
  /** False when the backend's priority-write probe failed; the UI then shows
   *  priority read-only. Optional so an older payload that omits it is treated
   *  as editable. */
  priority_editable?: boolean
}

// PATCH /api/board/task/:id body. Any subset; each provided field is one
// audited Zoho write. project is always required to scope the task.
export interface BoardTaskPatchBody {
  project: string
  status?: string
  owner_zpuid?: string
  priority?: BoardPriority
}

// POST /api/board/task/:id/comment body.
export interface BoardCommentBody {
  project: string
  content: string
}
export interface BoardCommentResult {
  added: true
}

// POST /api/board/task body. due_date is YYYY-MM-DD; the backend reformats to
// Zoho's MM-dd-yyyy. owner_zpuid and priority are optional.
export interface BoardCreateTaskBody {
  project: string
  tasklist_id: string
  name: string
  description?: string
  owner_zpuid?: string
  priority?: BoardPriority
  due_date?: string
}
export interface BoardCreateTaskResult {
  task_id: string
}

// POST /api/it-support
export interface ItSupportTicketData {
  /** Zoho task id of the new ticket; null only if Zoho answered without one. */
  ticket_id: string | null
  /** Assignee names the ticket was routed to, from the priority routing. */
  assigned_to: string[]
  /** Resolution due date (ISO), set from the priority SLA. */
  due_at: string
  /** Assignee names that did not resolve to a Zoho user, and so were skipped. */
  unresolved_owners: string[]
}

// /api/tasks
export interface TasksData {
  rows: Array<{ title: string; owner: string; status: string; due_display: string }>
}

// /api/tasks/mine
// The signed-in person's own open Zoho Projects tasks, for the p-my-tasks home
// panel. Server resolves the person from the session and filters by their Zoho
// user id across every project, then splits into two groups for the panel's
// tabs: "mine" is their work outside Cross-Department, "cross" is their
// Cross-Department tasks. tab and project_id let a row deep link to the board
// and open the task detail panel. Group counts are over the full set so the
// urgency line stays accurate when the rows cap.
export interface MyTaskRow {
  id: string
  project_id: string
  /** The board tab the task's project sits under, for the row's deep link. */
  tab: 'cross' | 'it' | 'other'
  title: string
  /** "Jul 9", or "No due date" when the task has no end date. */
  due_display: string
  due_state: 'overdue' | 'today' | 'upcoming' | 'none'
  /** Whole days past due; 0 unless due_state is overdue. */
  overdue_days: number
  /** Zoho priority (High/Medium/Low/None) or null when unset. */
  priority: string | null
  status: string
}
export interface MyTasksGroup {
  rows: MyTaskRow[]
  overdue_count: number
  due_today_count: number
  /** Full count of open tasks in the group; rows may be a capped slice. */
  total: number
}
export interface MyTasksData {
  /** Open tasks assigned to the person outside the Cross-Department project. */
  mine: MyTasksGroup
  /** Open tasks assigned to the person in the Cross-Department project. */
  cross: MyTasksGroup
}

// /api/brief/latest
export interface BriefData {
  compiled_at: string
  highlights: Array<{ title: string; text: string; good: boolean }>
  sections: Array<{ title: string; content: string; ran_at: string }>
}

// /api/social/ga4?period=
// GA4 website analytics for the Social view (legacy /social port). The six
// reports come back already parsed; change fields are null when the
// previous period had no baseline.
export interface SocialGa4Data {
  period: '7d' | '28d' | '90d' | 'mtd'
  kpi: {
    sessions: number
    users: number
    new_users: number
    pageviews: number
    bounce_rate: number
    avg_session_duration: number
    sessions_change: number | null
    users_change: number | null
    pageviews_change: number | null
    bounce_change: number | null
  }
  sessions_over_time: Array<{ date: string; sessions: number; users: number }>
  by_channel: Array<{ channel: string; sessions: number; users: number }>
  by_device: Array<{ device: string; sessions: number }>
  top_pages: Array<{ path: string; title: string; sessions: number; pageviews: number; avg_duration: number }>
}

// /api/social/platforms
// Each platform block is null when its source is not wired or its token
// expired; meta.reasons carries an authored reason whose key starts with
// the platform name (e.g. tiktok_token_expired), and the card renders the
// honest not-connected treatment from it.
export interface SocialLinkedinBlock {
  followers: number
  page_views_30d: number
  posts: Array<{
    id: string
    published_at: string | null
    text: string
    impressions: number
    likes: number
    comments: number
    shares: number
    clicks: number
  }>
}
export interface SocialTiktokBlock {
  display_name: string
  followers: number
  video_count: number
  videos: Array<{
    id: string
    title: string
    published_at: string | null
    views: number
    likes: number
    comments: number
    shares: number
  }>
}
export interface SocialInstagramBlock {
  followers: number
  media_count: number
  posts: Array<{
    id: string
    published_at: string | null
    caption: string
    media_type: string
    likes: number
    comments: number
    impressions: number | null
    reach: number | null
    saves: number | null
  }>
}
export interface SocialZohoBlock {
  engagement_rate: number
  total_reach: number
  total_interactions: number
  posts: Array<{
    id: string
    platform: string
    content_preview: string
    reach: number
    likes: number
    comments: number
    shares: number
    published_at: string | null
  }>
}
export interface SocialPlatformsData {
  linkedin: SocialLinkedinBlock | null
  tiktok: SocialTiktokBlock | null
  instagram: SocialInstagramBlock | null
  zoho_social: SocialZohoBlock | null
}

// /api/payouts/*
// Gross (what the patient pays) and Saleem revenue (service charge plus
// commission) are two SEPARATE figures, never summed. The commission model:
// scheduled appointments earn a service charge plus commission; novo earns a
// flat commission. Both amounts are set by editable payout rules.
export interface PayoutsSummaryData {
  cycle: string
  /** GROSS: total patient payments across the cycle. */
  gross_bhd: number
  /** SALEEM REVENUE: shown beside gross, never summed into it. */
  saleem_revenue_bhd: number
  provider_payouts_bhd: number
  booking_count: number
  /** Bookings whose commission percent fell back to the rule default. */
  commission_unset_count: number
  cycle_close_note: string
}
export interface PayoutBookingRow {
  id: string
  provider: string
  patient_ref: PatientRefData
  patient_name?: string
  product: string
  /** GROSS: full amount the patient paid. */
  gross_bhd: number
  /** SALEEM REVENUE on this booking. Mutually exclusive with covers_bhd. */
  saleem_revenue_bhd: number
  /** Free-to-patient rows: what Saleem covers. Never rendered as a minus. */
  covers_bhd?: number
  provider_payout_bhd: number
  rule_label: string
  manual: boolean
}
export interface PayoutsBookingsData {
  rows: PayoutBookingRow[]
}
export interface PayoutRuleItem {
  id: number
  priority: number
  rule_type: 'campaign' | 'fixed_fee' | 'percent'
  label: string
  params_display: string
  /** Raw editable numeric params (service_charge_bhd, commission_bhd, commission_pct). */
  params: Record<string, number | string | null>
  /** Which param keys this rule exposes for editing. */
  editable_keys: string[]
  updated_by: string | null
  updated_at: string
  /** True when the signed-in viewer holds can_edit_payout_rules. */
  can_edit: boolean
}
export interface PayoutsRulesData {
  rules: PayoutRuleItem[]
}

// /api/cockpit/* (cockpit-sla-spec.md). Read-only operational cockpit for the
// medical-travel case manager. Every SLA clock is driven by the best available
// Zoho timestamp; when the precise event field is empty the clock falls back to
// a proxy and is marked approx; when there is no backing field at all (provider
// clocks) the clock is null with the reason "Not tracked in Zoho yet". Patient
// names ride patient_name, served only to sees_patient_names viewers and
// rendered only by PatientRef.

// The six cockpit steps plus the parked lot. The string is shared by the queue
// item step, the case file step_current, and each stepper entry's key.
export type CockpitStepKey =
  | 'first_contact'
  | 'info_collected'
  | 'partner_quotes'
  | 'quotation'
  | 'decision'
  | 'treatment'
  | 'parked'

// The governing clock's classification for one active lead. due_now is the only
// attention state; tones map kind to a Chip variant in the UI (due_now warn,
// due_today and soon info, on_track good, parked mut).
export type CockpitDueKind = 'due_now' | 'due_today' | 'soon' | 'on_track'

export interface CockpitDue {
  label: string
  tone: 'warn' | 'info' | 'good' | 'mut'
  kind: CockpitDueKind
}

// GET /api/cockpit/queue?person=
export interface CockpitTile {
  count: number
  note: string
}
// The queue and parked tabs split on these. record_type is the Leads vs Deals
// divide (a lead is an unconverted lead, a deal is anything else); pipeline is
// the Deals sub-tab divide and is null for leads, which have no pipeline.
export type CockpitRecordType = 'lead' | 'deal'
export type CockpitPipeline = 'Treatment' | 'Telemedicine'

export interface CockpitQueueItem {
  lead_ref: PatientRefData
  patient_name?: string
  step: string
  next_action: string
  /** "Origin -> Destination", e.g. "Bahrain -> Czech Republic". */
  route: string
  condition: string
  due: CockpitDue
  sla_key: string
  /** True when the governing clock fell back to a proxy timestamp. */
  approx: boolean
  record_type: CockpitRecordType
  /** Treatment or Telemedicine for deals; null for leads. */
  pipeline: CockpitPipeline | null
}
export interface CockpitQueueData {
  tiles: {
    due_now: CockpitTile
    due_today: CockpitTile
    waiting_partners: CockpitTile
    parked: CockpitTile
  }
  active: CockpitQueueItem[]
  parked_count: number
}

// GET /api/cockpit/case/:id  (id = lead or deal zoho id)
export interface CockpitStep {
  key: string
  label: string
  state: 'done' | 'cur' | 'todo'
}
export interface CockpitNextAction {
  label: string
  due_label: string
  sla_rule: string
  approx: boolean
  /** Null in v1: the drafted-message preview is not wired to a source yet. */
  draft_message: string | null
}
export interface CockpitDetail {
  k: string
  v: string
}
export interface CockpitChecklistItem {
  label: string
  done: boolean
  /** "Jun 6" or null when the item is open. */
  date: string | null
}
export interface CockpitNote {
  title: string
  body: string
  source: string
}
export interface CockpitPartner {
  label: string
  detail: string
  state: 'good' | 'info' | 'mut'
}
export interface CockpitDocument {
  label: string
  detail: string
  status: string
}
export interface CockpitActivity {
  label: string
  detail: string
}
export interface CockpitCaseData {
  lead_ref: PatientRefData
  patient_name?: string
  route: string
  condition: string
  source: string
  /** Deal or unconverted lead. The set-follow-up control shows for both: deals
   *  write set_follow_up, leads write set_lead_follow_up. The Leads module
   *  carries Next_Follow_up (same api_name as Deals) as of 2026-06-27. */
  record_type: CockpitRecordType
  /** Current next-follow-up date (Deals or Leads Next_Follow_up), or null. */
  next_follow_up: string | null
  /** Current patient budget in BHD (Deals field), or null when unset. The
   *  edit-case-details control prefills and writes this. */
  patient_budget: number | null
  /** Current treatment start date (YYYY-MM-DD), or null when unset. */
  treatment_start: string | null
  /** Current treatment end date (YYYY-MM-DD), or null when unset. */
  treatment_end: string | null
  /** Current Deals stage, or null for an unconverted lead. */
  stage: string | null
  /** Treatment or Telemedicine for deals; null for leads. */
  pipeline: CockpitPipeline | null
  /** The patient phone (E.164, e.g. "+97300000000"), served only to viewers
   *  who may see patient identities, for both deals and leads (name-seers).
   *  Null when no number is on file. Powers the click-to-chat WhatsApp link. */
  patient_phone?: string | null
  /** The step-aware drafted WhatsApp line for the click-to-chat link, served
   *  only to name-seers, for both deals and leads. The case manager reviews it
   *  in WhatsApp and sends; never sent by the dashboard. Null when no draft is
   *  available. */
  whatsapp_message?: string | null
  /** The Leads Lead_Status value for an unconverted lead, or null for a deal.
   *  Prefills the update-status control. */
  lead_status?: string | null
  /** Tag names on the record (Zoho Tag field), or an empty array. Shown as chips
   *  on the case file; the add-tag control appends to this set. Not gated: tags
   *  are case metadata, not patient identifiers. */
  tags: string[]
  /** The org's tag names for this record's module, for the add-tag picker's
   *  suggestions. Not gated. */
  available_tags: string[]
  in_funnel_days: number
  step_current: string
  steps: CockpitStep[]
  next_action: CockpitNextAction
  details: CockpitDetail[]
  checklist: CockpitChecklistItem[]
  notes: CockpitNote[]
  partners: CockpitPartner[]
  documents: CockpitDocument[]
  activity: CockpitActivity[]
}

/** One hospital a patient has been sent to (a provider_referrals row), shown as a
 *  removable chip in the case file's Hospitals section. referral_id is the row id
 *  used to remove the link. The same referral appears on the provider board. */
export interface CaseProviderLink {
  referral_id: string
  hospital_id: string
  hospital_name: string
}
/** The case file's Hospitals sub-resource: the patient's active hospital links and
 *  the pickable hospital list (Zoho Hospitals directory plus board custom
 *  hospitals). Name-seers only, on the client and server. */
export interface CaseProvidersData {
  linked: CaseProviderLink[]
  available: Array<{ id: string; name: string; country: string }>
}

// Cockpit write gate (Saleem Cockpit Implementation Plan, Phase 1). Two-step:
// POST /api/write-gate/prepare returns a plain-language change list and a
// short-lived change_id; POST /api/write-gate/commit applies it after the case
// manager confirms. Phase 1a wired the set-follow-up change; Phase 1b adds the
// stage move and the four mark-event stamps.
export interface WriteGateChangeSetFollowUp {
  kind: 'set_follow_up'
  /** YYYY-MM-DD. */
  date: string
}
export interface WriteGateChangeMoveStage {
  kind: 'move_stage'
  to_stage: string
  /** Required only when moving to Lost / Inactive; null otherwise. */
  reason_for_loss?: string | null
}
export interface WriteGateChangeStamp {
  kind: 'stamp'
  event:
    | 'first_contact'
    | 'quotation_sent'
    | 'partner_quote_requested'
    | 'partner_more_time'
}
// Phase 2: send the fixed first-contact WhatsApp template and log it. The send
// itself runs server-side through a no-op adapter until the provider lands and
// writes are enabled; the change carries no payload (the template is fixed).
export interface WriteGateChangeSendFirstContact {
  kind: 'send_first_contact'
}
// Phase 4: edit a single case detail (budget or treatment dates) through the
// gate. patient_budget carries a decimal string in BHD, e.g. "4500";
// treatment_start and treatment_end carry a YYYY-MM-DD date.
export interface WriteGateChangeEditField {
  kind: 'edit_field'
  field: 'patient_budget' | 'treatment_start' | 'treatment_end'
  value: string
}
// Lead-stage writes through the same gate (resourceType 'lead'). Convert turns
// an unconverted lead into a deal in the chosen pipeline at the chosen open
// stage; set_lead_status updates the Leads Lead_Status; park marks the lead Not
// Qualified with a required reason.
export interface WriteGateChangeConvertLead {
  kind: 'convert_lead'
  pipeline: CockpitPipeline
  stage: string
}
export interface WriteGateChangeSetLeadStatus {
  kind: 'set_lead_status'
  status: string
}
export interface WriteGateChangeParkLead {
  kind: 'park_lead'
  reason: string
}
export type WriteGateChange =
  | WriteGateChangeSetFollowUp
  | WriteGateChangeMoveStage
  | WriteGateChangeStamp
  | WriteGateChangeSendFirstContact
  | WriteGateChangeEditField
  | WriteGateChangeConvertLead
  | WriteGateChangeSetLeadStatus
  | WriteGateChangeParkLead
export interface WriteGatePrepareBody {
  resourceType: 'deal' | 'lead'
  resourceId: string
  change: WriteGateChange
}
export interface WriteGatePrepareData {
  change_id: string
  /** One plain-language line per change, e.g. "Set next follow-up to 25 Jun 2026". */
  change_list: string[]
  /** 1 for a normal change, 2 for a high-impact one (a second confirm). */
  confirmations_required: number
  base_modified_time: string | null
  /** False when writes are turned off; commit will refuse. */
  writes_enabled: boolean
}
export interface WriteGateCommitBody {
  change_id: string
  confirmations: number
}
export interface WriteGateCommitData {
  committed: boolean
  change_list: string[]
  resource_id: string
}

// GET /api/whatsapp/template/first_contact (Phase 2). The fixed, non-clinical
// first-contact greeting the send-and-log control previews. The text is the
// template only; the live send is a server-side no-op until the provider lands.
export interface WhatsAppTemplateData {
  id: string
  text: string
}

// GET /api/write-gate/stage-options?pipeline=&stage=
// The target stages the current stage may move to, plus the loss reasons to
// pick from when the target is Lost / Inactive. Both lists are CRM config, not
// patient data.
export interface WriteGateStageOptionsData {
  targets: string[]
  loss_reasons: string[]
}

// POST /api/documents/quotation (Phase 3 cockpit documents). Build the
// patient-facing treatment quotation from inputs the case manager enters, and
// return the generated DOCX as base64 for the browser to download. Deals only,
// and only for staff who may see patient names; the backend gates the same way.
//
// QuotationContent mirrors the document-builder skill's quotation schema. The
// patient-facing price is entered by the case manager and is NEVER the partner
// price. Payment default: leave deposit and balance_due empty for full payment
// upfront; provide both together only when a deposit structure applies.
export interface QuotationLineItem {
  item: string
  details: string
  /** Decimal string in the quoted currency, e.g. "3,200.000". */
  amount: string
  /** Optional hyperlink target rendered on the line item. */
  url?: string
}
export interface QuotationContentPatient {
  full_name: string
  first_name: string
  /** The 6-digit Saleem case number. */
  case_reference: string
}
export interface QuotationContentConsultation {
  physician: string
  date: string
  physician_url?: string
}
export interface QuotationContentTreatment {
  procedure: string
  hospital: string
  physician: string
  /** "Assisted journey" or "Self-managed journey". */
  journey_type: string
  hospital_location?: string
  hospital_url?: string
  physician_url?: string
  window?: string
  stay_nights?: string
  room_type?: string
}
export interface QuotationContentPricing {
  currency: string
  /** Non-empty; the build script verifies the items sum to total. */
  line_items: QuotationLineItem[]
  total: string
  currency_note?: string
}
export interface QuotationContentJourneyArrangement {
  label: string
  name: string
  url?: string
  note?: string
}
export interface QuotationContentPayment {
  /** Plain-language cancellation summary from the case manager. */
  cancellation: string
  /** Empty for full payment upfront; set with balance_due for a deposit. */
  deposit?: string
  balance_due?: string
  payment_link?: string
}
export interface QuotationContentContact {
  whatsapp?: string
  phone?: string
  email?: string
}
export interface QuotationContent {
  quote_reference: string
  /** Human date strings as they print, e.g. "10 June 2026". */
  date_issued: string
  valid_until: string
  patient: QuotationContentPatient
  consultation: QuotationContentConsultation
  treatment: QuotationContentTreatment
  pricing: QuotationContentPricing
  payment: QuotationContentPayment
  included?: string[]
  excluded?: string[]
  /** Required by the skill when the journey type is assisted. */
  journey_support_note?: string
  journey_arrangements?: QuotationContentJourneyArrangement[]
  contact?: QuotationContentContact
}
export interface DocumentsQuotationBody {
  deal_id: string
  content: QuotationContent
}
export interface DocumentsQuotationData {
  filename: string
  /** The generated DOCX, base64 encoded, for the browser to download. */
  content_base64: string
  /** Drive file id when the backend stored it; null when it only returned the
   *  download (Drive storage is gated server-side). */
  drive_file_id: string | null
}

// POST /api/documents/referral/draft and /api/documents/referral/build (Phase 3
// cockpit documents). Draft assembles the clinical referral content from pasted
// report text and a few defaults; the case manager reviews and edits it, then
// build renders the branded DOCX and returns it as base64 for download. Deals
// only, and only for staff who may see patient names; the backend gates the
// same way. ReferralContent mirrors the document-builder skill's referral
// schema. Referral mode carries patient case data by design; Dr. Razan's
// clearance is required before any drafted referral leaves Saleem.
//
// functional_findings accepts a plain string or a dated-group array; the v1
// editor treats it as a string, so the typed shape carries both forms.
export interface ReferralFunctionalGroup {
  subhead: string
  items: string[]
}
export interface ReferralSections {
  chief_complaint: string
  hpi: string
  pmh: string
  surgical_history: string
  medications: string
  allergies: string
  social_history: string
  family_history: string
  functional_findings: string | ReferralFunctionalGroup[]
  investigations: string
  prior_treatment: string
  assessment: string
  goals: string
  /** Renders as a numbered list in the document. */
  requested: string[]
  attachments: string
}
export interface ReferralContent {
  /** Human date string as it prints, e.g. "3 June 2026". */
  date: string
  /** The 6-digit Saleem case number. */
  case_reference: string
  prepared_by: string
  prepared_for: string
  /** A pseudonym by default, e.g. "Patient A". A real identity is used only
   *  with confirmed consent, captured manually outside the document. */
  patient_label: string
  /** Dates of the underlying reports, for recency. */
  source_records: string
  /** Google Drive link to the identified reports; auto-embedded when present. */
  medical_documents_link: string
  sections: ReferralSections
}
export interface DraftReferralBody {
  deal_id: string
  /** The pasted report text or clinical notes the draft is assembled from. */
  report_text: string
  prepared_for?: string
  patient_label?: string
  source_records?: string
  medical_documents_link?: string
}
export interface ReferralDraftData {
  content: ReferralContent
  /** True when the drafted content is clinical case data; the UI shows the
   *  clearance reminder when so (referral mode always carries case data). */
  razan_clearance_required: boolean
  /** Plain-language reminder the UI renders verbatim in the clearance banner. */
  reminder: string
}
export interface BuildReferralBody {
  deal_id: string
  content: ReferralContent
}
export interface ReferralBuildData {
  filename: string
  /** The generated DOCX, base64 encoded, for the browser to download. */
  content_base64: string
  /** Drive file id when the backend stored it; null when it only returned the
   *  download (Drive storage is gated server-side). */
  drive_file_id: string | null
}

// GET /api/cockpit/parked?person=
export interface CockpitParkedRow {
  lead_ref: PatientRefData
  patient_name?: string
  /** "May 30" style. */
  parked_date: string
  reason: string
  /** Null when no revival nudge is scheduled. */
  revival_nudge: { label: string; tone: 'warn' | 'mut' } | null
  record_type: CockpitRecordType
  /** Treatment or Telemedicine for deals; null for leads. */
  pipeline: CockpitPipeline | null
}
// Parked tab bucket the parked endpoint paginates within. leads is the
// Not-Qualified lead pool; deals_treatment and deals_telemedicine are the Lost
// or Inactive deals split by pipeline. Omitting it returns the whole pool.
export type CockpitParkedBucket =
  | 'leads'
  | 'deals_treatment'
  | 'deals_telemedicine'
export interface CockpitParkedData {
  rows: CockpitParkedRow[]
  /** Server-side pagination over the parked pool (default page size 12). */
  page: number
  pages: number
  total: number
}

// GET /api/cockpit/sla-policy  (static authored content, no upstream)
export interface CockpitPatientSlaRule {
  key: string
  rule: string
  threshold: string
  counting: 'business' | 'elapsed' | 'mixed'
  anchor_field: string
  proxy_fallback: string
  applies_in: string
}
export interface CockpitProviderSlaRule {
  key: string
  rule: string
  threshold: string
  backing: string
}
export interface CockpitSlaPolicyData {
  patient: CockpitPatientSlaRule[]
  provider: CockpitProviderSlaRule[]
  /** Plain summary of the business-day rule shown above the tables. */
  business_day_note: string
}

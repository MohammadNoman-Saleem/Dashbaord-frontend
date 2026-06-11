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
  view: 'home' | 'cases' | 'funnels' | 'marketing' | 'financials' | 'kpis' | 'agents' | 'payouts'
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
}
export interface PipelineHealthData {
  items: LateItem[]
}

// /api/pipeline/providers
export interface ProvidersData {
  stages: Array<{ label: string; count: number }>
  awaiting_signoff: string[]
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
  payouts_due_bhd: number
  saleem_share_bhd: number
  treatment_manual_bhd: number
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
  tiles: {
    leads: { value: number; target: number }
    cpl: { value_bhd: number; cap_bhd: number }
    whatsapp_reply_pct: { value: number; target: number }
    ig_reach: { value: number; spark: number[] }
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
    site_visits: number
    consult_page_views: number
    booking_starts: number
    dead_clicks: number
  }
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
    real_consults: { value: number; chip: 'verified' }
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

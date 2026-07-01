// The ONLY cutover switch: each endpoint reads either its fixture or the
// live saleem-api, flipped here one at a time as backend endpoints land.
// A panel never knows which it got. Phase 4 adds a CI check that production
// builds carry no fixture-mode endpoints.

export type EndpointKey =
  | 'me'
  | 'pulse'
  | 'kpi_strip'
  | 'kpi_targets'
  | 'kpi_team_summary'
  | 'kpi_drill'
  | 'deliverables'
  | 'admin_users'
  | 'attention'
  | 'urgent'
  | 'blockers'
  | 'cases_summary'
  | 'leads_medical_travel'
  | 'priorities'
  | 'pipeline_health'
  | 'pipeline_staleness'
  | 'pipeline_momentum'
  | 'pipeline_losses'
  | 'pipeline_velocity'
  | 'providers'
  | 'handoffs'
  | 'appointments'
  | 'appointments_analytics'
  | 'financials'
  | 'financials_forecast'
  | 'financials_burn'
  | 'financials_receivables'
  | 'crm'
  | 'crm_metrics'
  | 'crm_funnel'
  | 'marketing'
  | 'funnels_general'
  | 'funnels_direct'
  | 'funnels_uiux'
  | 'funnels_scheduled'
  | 'funnels_novo'
  | 'growth_engagement'
  | 'growth_retention'
  | 'agents'
  | 'tasks'
  | 'board'
  | 'board_task_detail'
  | 'board_assignable_users'
  | 'social_ga4'
  | 'social_platforms'
  | 'it_support'
  | 'brief'
  | 'payouts_summary'
  | 'payouts_bookings'
  | 'payouts_rules'
  | 'payouts_rule_patch'
  | 'payouts_manual'
  | 'cockpit_queue'
  | 'cockpit_case'
  | 'cockpit_parked'
  | 'cockpit_sla_policy'
  | 'cockpit_case_write'
  | 'cockpit_search'
  | 'provider_board'
  | 'write_gate_stage_options'
  | 'whatsapp_first_contact_template'
  | 'whatsapp_templates'
  | 'documents_quotation'
  | 'documents_referral_draft'
  | 'documents_referral_build'

export type EndpointMode = 'fixture' | 'live'

export const ENDPOINT_MODES: Record<EndpointKey, EndpointMode> = {
  me: 'live',
  pulse: 'live',
  kpi_strip: 'live',
  kpi_targets: 'live',
  kpi_team_summary: 'live',
  kpi_drill: 'live',
  deliverables: 'live',
  // Admin user management: list, add, reset password. Writes carry no
  // fixture (mutateEnvelope resolves null in fixture mode).
  admin_users: 'live',
  attention: 'live',
  urgent: 'live',
  blockers: 'live',
  cases_summary: 'live',
  leads_medical_travel: 'live',
  priorities: 'live',
  pipeline_health: 'live',
  pipeline_staleness: 'live',
  pipeline_momentum: 'live',
  pipeline_losses: 'live',
  pipeline_velocity: 'live',
  providers: 'live',
  handoffs: 'live',
  appointments: 'live',
  appointments_analytics: 'live',
  financials: 'live',
  financials_forecast: 'live',
  financials_burn: 'live',
  financials_receivables: 'live',
  crm: 'live',
  crm_metrics: 'live',
  crm_funnel: 'live',
  marketing: 'live',
  funnels_general: 'live',
  funnels_direct: 'live',
  funnels_uiux: 'live',
  funnels_scheduled: 'live',
  funnels_novo: 'live',
  growth_engagement: 'live',
  growth_retention: 'live',
  agents: 'live',
  tasks: 'live',
  board: 'live',
  // The two new board GET keys go live with the backend on this branch. The
  // fixtures stay type-aligned and serve dev smoke until the API is up. The
  // board writes (PATCH task, POST comment, POST task) route through
  // mutateEnvelope and carry no fixture, resolving null in fixture mode.
  board_task_detail: 'live',
  board_assignable_users: 'live',
  social_ga4: 'live',
  social_platforms: 'live',
  // POST-only seam for raising IT tickets. There is no backing route, so this is
  // fixture: mutateEnvelope no-ops in fixture mode rather than 404ing a live call.
  it_support: 'fixture',
  brief: 'live',
  payouts_summary: 'live',
  payouts_bookings: 'live',
  payouts_rules: 'live',
  // Write seams (PATCH a rule, POST/PATCH a free appointment); carry no
  // fixture, mutateEnvelope resolves null in fixture mode.
  payouts_rule_patch: 'live',
  payouts_manual: 'live',
  // V4 Cockpit. The web frontend is built fixtures-first against the contract
  // while the backend lands on the same branch; these flip to live as each
  // /api/cockpit endpoint is wired. Set live so the page reads the real API
  // when it is up, with the fixtures serving dev smoke until then.
  cockpit_queue: 'live',
  cockpit_case: 'live',
  cockpit_parked: 'live',
  cockpit_sla_policy: 'live',
  // Cockpit write (one-step). A single POST per change to
  // /api/cockpit/case/[id]/write; the route validates, writes to Zoho, and
  // audits in one call (the former two-step prepare/commit gate is gone).
  // POST-only seam; mutateEnvelope resolves null in fixture mode and never
  // reads a fixture. Live so the controls reach the real route; the route still
  // refuses unless WRITE_GATE_ENABLED is on server-side, so merging this does
  // not enable any write.
  cockpit_case_write: 'live',
  // Smart patient search (POST). One box matching patient name, phone, or Zoho
  // record id over the cached CRM reads. POST-only seam (the term rides in the
  // body, never the URL, so names/phones stay out of access logs and history);
  // mutateEnvelope resolves null in fixture mode and never reads a fixture. Live
  // so the cockpit reaches the real route; the route still refuses anyone who is
  // not a name-seer server-side, so merging this exposes nothing new.
  cockpit_search: 'live',
  // Provider board (Supabase-backed). GET the hospital-by-hospital board, POST a
  // patient onto a column, DELETE a card. The GET fixture serves dev smoke; the
  // route gates the whole board to name-seers server-side, so going live exposes
  // nothing new. Writes carry no fixture (mutateEnvelope resolves null in fixture
  // mode).
  provider_board: 'live',
  // Phase 1b stage-move policy read: which target stages the current stage may
  // move to, plus the loss reasons. A GET, live with the backend on this
  // branch; the fixture serves dev smoke until the API is up.
  write_gate_stage_options: 'live',
  // Phase 2 first-contact template read (GET). The fixed non-clinical greeting
  // the send-and-log control previews; live with the backend on this branch,
  // the fixture serves dev smoke until the API is up.
  whatsapp_first_contact_template: 'live',
  // Editable WhatsApp template library (Supabase-backed). GET lists active
  // templates (any signed-in viewer); POST/PATCH/DELETE are person-only writes
  // that go through mutateEnvelope (no fixture read). Live with the backend on
  // this branch; the GET fixture stub serves dev smoke until the API is up.
  whatsapp_templates: 'live',
  // Phase 3 quotation build (POST). There is no backing route, so this is
  // fixture: mutateEnvelope no-ops in fixture mode rather than 404ing a live call.
  documents_quotation: 'fixture',
  // Phase 3 referral drafting (POST seams). Draft assembles the clinical content
  // from pasted report text; build renders the DOCX as base64. Neither has a
  // backing route yet, so both are fixture: mutateEnvelope no-ops in fixture mode
  // rather than 404ing a live call.
  documents_referral_draft: 'fixture',
  documents_referral_build: 'fixture',
}

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
  | 'financials'
  | 'financials_forecast'
  | 'financials_burn'
  | 'financials_receivables'
  | 'crm'
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
  | 'write_gate_prepare'
  | 'write_gate_commit'
  | 'write_gate_stage_options'
  | 'whatsapp_first_contact_template'
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
  financials: 'live',
  financials_forecast: 'live',
  financials_burn: 'live',
  financials_receivables: 'live',
  crm: 'live',
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
  // POST-only seam for raising IT tickets; carries no fixture (mutateEnvelope
  // resolves null in fixture mode without ever reading one).
  it_support: 'live',
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
  // Cockpit write gate (Phase 1). POST-only seams; mutateEnvelope resolves
  // null in fixture mode and never reads a fixture. Live so the confirm-commit
  // flow reaches the real gate; commit still refuses unless WRITE_GATE_ENABLED
  // is on server-side, so merging this does not enable any write.
  write_gate_prepare: 'live',
  write_gate_commit: 'live',
  // Phase 1b stage-move policy read: which target stages the current stage may
  // move to, plus the loss reasons. A GET, live with the backend on this
  // branch; the fixture serves dev smoke until the API is up.
  write_gate_stage_options: 'live',
  // Phase 2 first-contact template read (GET). The fixed non-clinical greeting
  // the send-and-log control previews; live with the backend on this branch,
  // the fixture serves dev smoke until the API is up.
  whatsapp_first_contact_template: 'live',
  // Phase 3 quotation build (POST). The build-quotation control posts the
  // inputs and receives the generated DOCX as base64. A POST-only seam;
  // mutateEnvelope resolves null in fixture mode and never reads a fixture.
  documents_quotation: 'live',
  // Phase 3 referral drafting (POST seams). Draft assembles the clinical
  // content from pasted report text; build renders the DOCX as base64. Both
  // POST-only; mutateEnvelope resolves null in fixture mode and never reads a
  // fixture. Live so the draft-review-build flow reaches the real backend; the
  // backend still gates the draft endpoint and may return it turned off.
  documents_referral_draft: 'live',
  documents_referral_build: 'live',
}

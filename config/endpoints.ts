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
  | 'deliverables'
  | 'attention'
  | 'urgent'
  | 'blockers'
  | 'cases_summary'
  | 'leads_medical_travel'
  | 'priorities'
  | 'pipeline_health'
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
  | 'agents'
  | 'tasks'
  | 'board'
  | 'it_support'
  | 'brief'
  | 'payouts_summary'
  | 'payouts_bookings'
  | 'payouts_rules'

export type EndpointMode = 'fixture' | 'live'

export const ENDPOINT_MODES: Record<EndpointKey, EndpointMode> = {
  me: 'live',
  pulse: 'live',
  kpi_strip: 'live',
  kpi_targets: 'live',
  kpi_team_summary: 'live',
  deliverables: 'live',
  attention: 'live',
  urgent: 'live',
  blockers: 'live',
  cases_summary: 'live',
  leads_medical_travel: 'live',
  priorities: 'live',
  pipeline_health: 'live',
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
  agents: 'live',
  tasks: 'live',
  board: 'live',
  // POST-only seam for raising IT tickets; carries no fixture (mutateEnvelope
  // resolves null in fixture mode without ever reading one).
  it_support: 'live',
  brief: 'live',
  payouts_summary: 'fixture',
  payouts_bookings: 'fixture',
  payouts_rules: 'fixture',
}

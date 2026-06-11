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
  | 'cases_summary'
  | 'priorities'
  | 'pipeline_health'
  | 'providers'
  | 'handoffs'
  | 'appointments'
  | 'financials'
  | 'crm'
  | 'marketing'
  | 'funnels_general'
  | 'funnels_direct'
  | 'funnels_uiux'
  | 'funnels_scheduled'
  | 'funnels_novo'
  | 'agents'
  | 'tasks'
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
  cases_summary: 'live',
  priorities: 'live',
  pipeline_health: 'live',
  providers: 'live',
  handoffs: 'live',
  appointments: 'live',
  financials: 'live',
  crm: 'live',
  marketing: 'live',
  funnels_general: 'live',
  funnels_direct: 'live',
  funnels_uiux: 'live',
  funnels_scheduled: 'live',
  funnels_novo: 'live',
  agents: 'live',
  tasks: 'live',
  brief: 'live',
  payouts_summary: 'fixture',
  payouts_bookings: 'fixture',
  payouts_rules: 'fixture',
}

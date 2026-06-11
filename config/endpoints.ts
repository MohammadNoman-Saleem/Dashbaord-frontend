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
  me: 'fixture',
  pulse: 'fixture',
  kpi_strip: 'fixture',
  kpi_targets: 'fixture',
  kpi_team_summary: 'fixture',
  deliverables: 'fixture',
  attention: 'fixture',
  urgent: 'fixture',
  priorities: 'fixture',
  pipeline_health: 'fixture',
  providers: 'fixture',
  handoffs: 'fixture',
  appointments: 'fixture',
  financials: 'fixture',
  crm: 'fixture',
  marketing: 'fixture',
  funnels_general: 'fixture',
  funnels_direct: 'fixture',
  funnels_uiux: 'fixture',
  funnels_scheduled: 'fixture',
  funnels_novo: 'fixture',
  agents: 'fixture',
  tasks: 'fixture',
  brief: 'fixture',
  payouts_summary: 'fixture',
  payouts_bookings: 'fixture',
  payouts_rules: 'fixture',
}

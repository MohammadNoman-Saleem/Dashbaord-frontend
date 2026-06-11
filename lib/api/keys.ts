// Typed query-key factory. Hooks only ever use this; never inline keys.
// Client staleTime stays short and uniform because the server cache does
// the heavy lifting (03 section 11). Documented choices:
//   default 60s, me Infinity (invalidated on login/switch), pulse refetches
//   on a 5 min interval, urgent 30s (optimistic writes), funnels 5 min.
export const qk = {
  me: () => ['me'] as const,
  pulse: () => ['pulse'] as const,
  kpiStrip: (person: string) => ['kpi', 'strip', person] as const,
  kpiTargets: (month: string) => ['kpi', 'targets', month] as const,
  kpiTeamSummary: (month: string) => ['kpi', 'team-summary', month] as const,
  deliverables: (month: string) => ['deliverables', month] as const,
  attention: (person: string) => ['attention', person] as const,
  urgent: () => ['urgent'] as const,
  casesSummary: () => ['cases', 'summary'] as const,
  priorities: (person: string) => ['pipeline', 'priorities', person] as const,
  pipelineHealth: () => ['pipeline', 'health'] as const,
  providers: () => ['pipeline', 'providers'] as const,
  handoffs: () => ['handoffs'] as const,
  appointments: () => ['appointments'] as const,
  financials: () => ['financials'] as const,
  crm: (resource: string, page: number, pageSize: number) => ['crm', resource, page, pageSize] as const,
  marketing: () => ['marketing'] as const,
  funnels: (tab: string, variant?: string) => ['funnels', tab, variant ?? ''] as const,
  agents: () => ['agents'] as const,
  tasks: () => ['tasks'] as const,
  brief: () => ['brief'] as const,
  payoutsSummary: (cycle: string) => ['payouts', 'summary', cycle] as const,
  payoutsBookings: (cycle: string) => ['payouts', 'bookings', cycle] as const,
  payoutsRules: () => ['payouts', 'rules'] as const,
}

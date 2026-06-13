// Single dispatch point from EndpointKey to its fixture module. The fetcher
// calls getFixture when config/endpoints.ts marks a key as 'fixture'; panels
// never import fixture modules directly.

import type { EndpointKey } from '@/config/endpoints'
import type { Envelope } from '@/lib/api/envelope'

import { fixture as agentsFixture } from './agents'
import { fixture as appointmentsFixture } from './appointments'
import { fixture as attentionFixture } from './attention'
import { fixture as blockersFixture } from './blockers'
import { fixture as boardFixture } from './board'
import { fixture as briefFixture } from './brief'
import { fixture as casesSummaryFixture } from './cases-summary'
import { fixture as crmFixture } from './crm'
import { fixture as deliverablesFixture } from './deliverables'
import { fixture as financialsFixture } from './financials'
import { fixture as funnelsDirectFixture } from './funnels-direct'
import { fixture as funnelsGeneralFixture } from './funnels-general'
import { fixture as funnelsNovoFixture } from './funnels-novo'
import { fixture as funnelsScheduledFixture } from './funnels-scheduled'
import { fixture as funnelsUiuxFixture } from './funnels-uiux'
import { fixture as handoffsFixture } from './handoffs'
import { fixture as kpiStripFixture } from './kpi-strip'
import { fixture as kpiTargetsFixture } from './kpi-targets'
import { fixture as kpiTeamSummaryFixture } from './kpi-team-summary'
import { fixture as leadsMedicalTravelFixture } from './leads-medical-travel'
import { fixture as marketingFixture } from './marketing'
import { fixture as meFixture } from './me'
import { summaryFixture, bookingsFixture, rulesFixture } from './payouts'
import { fixture as pipelineHealthFixture } from './pipeline-health'
import { fixture as prioritiesFixture } from './priorities'
import { fixture as providersFixture } from './providers'
import { fixture as pulseFixture } from './pulse'
import { fixture as tasksFixture } from './tasks'
import { fixture as urgentFixture } from './urgent'

type FixtureFn = (
  params?: Record<string, string | number | undefined>
) => Envelope<unknown>

const FIXTURES: Record<EndpointKey, FixtureFn> = {
  me: meFixture,
  pulse: pulseFixture,
  kpi_strip: kpiStripFixture,
  kpi_targets: kpiTargetsFixture,
  kpi_team_summary: kpiTeamSummaryFixture,
  // Live-only endpoints. The drill is a GET, but it is reached only from the
  // live /kpis page; these stubs satisfy the record type (getFixture is never
  // called for a live key, and admin writes resolve null in fixture mode).
  kpi_drill: () => ({
    data: { metric_key: '', month: '', columns: [], rows: [], total: 0, summary: null },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  deliverables: deliverablesFixture,
  admin_users: () => ({
    data: [],
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  attention: attentionFixture,
  urgent: urgentFixture,
  blockers: blockersFixture,
  cases_summary: casesSummaryFixture,
  leads_medical_travel: leadsMedicalTravelFixture,
  priorities: prioritiesFixture,
  pipeline_health: pipelineHealthFixture,
  providers: providersFixture,
  handoffs: handoffsFixture,
  appointments: appointmentsFixture,
  financials: financialsFixture,
  crm: crmFixture,
  marketing: marketingFixture,
  funnels_general: funnelsGeneralFixture,
  funnels_direct: funnelsDirectFixture,
  funnels_uiux: funnelsUiuxFixture,
  funnels_scheduled: funnelsScheduledFixture,
  funnels_novo: funnelsNovoFixture,
  agents: agentsFixture,
  tasks: tasksFixture,
  board: boardFixture,
  // POST-only endpoint: mutateEnvelope resolves null in fixture mode and
  // never calls getFixture, so this stub only satisfies the record type.
  it_support: () => ({
    data: { ticket_id: null },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  brief: briefFixture,
  payouts_summary: summaryFixture,
  payouts_bookings: bookingsFixture,
  payouts_rules: rulesFixture,
}

export function getFixture<T>(
  key: EndpointKey,
  params?: Record<string, string | number | undefined>
): Envelope<T> {
  const envelope = FIXTURES[key](params)
  // Fixtures are typed at their definition sites (each payload is checked
  // with `satisfies` against the contract type), so the cast through
  // unknown at this single return point is the only loosening.
  return envelope as unknown as Envelope<T>
}

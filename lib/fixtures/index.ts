// Single dispatch point from EndpointKey to its fixture module. The fetcher
// calls getFixture when config/endpoints.ts marks a key as 'fixture'; panels
// never import fixture modules directly.

import type { EndpointKey } from '@/config/endpoints'
import type { Envelope } from '@/lib/api/envelope'

import { fixture as agentsFixture } from './agents'
import { fixture as appointmentsFixture } from './appointments'
import { fixture as appointmentsAnalyticsFixture } from './appointments-analytics'
import { fixture as attentionFixture } from './attention'
import { fixture as blockersFixture } from './blockers'
import { fixture as boardFixture } from './board'
import { fixture as boardAssignableUsersFixture } from './board-assignable-users'
import { fixture as boardTaskDetailFixture } from './board-task-detail'
import { fixture as briefFixture } from './brief'
import { fixture as casesSummaryFixture } from './cases-summary'
import { fixture as cockpitCaseFixture } from './cockpit-case'
import { fixture as cockpitParkedFixture } from './cockpit-parked'
import { fixture as cockpitQueueFixture } from './cockpit-queue'
import { fixture as cockpitSlaPolicyFixture } from './cockpit-sla-policy'
import { fixture as crmFixture } from './crm'
import { fixture as crmFunnelFixture } from './crm-funnel'
import { fixture as crmLeadFunnelFixture } from './crm-lead-funnel'
import { fixture as crmLeadSourcesFixture } from './crm-lead-sources'
import { fixture as crmLeadsFixture } from './crm-leads'
import { fixture as crmMetricsFixture } from './crm-metrics'
import { fixture as deliverablesFixture } from './deliverables'
import { fixture as financialsFixture } from './financials'
import { fixture as financialsBurnFixture } from './financials-burn'
import { fixture as financialsForecastFixture } from './financials-forecast'
import { fixture as financialsReceivablesFixture } from './financials-receivables'
import { fixture as funnelsDirectFixture } from './funnels-direct'
import { fixture as funnelsGeneralFixture } from './funnels-general'
import { fixture as funnelsNovoFixture } from './funnels-novo'
import { fixture as funnelsScheduledFixture } from './funnels-scheduled'
import { fixture as funnelsUiuxFixture } from './funnels-uiux'
import { fixture as growthEngagementFixture } from './growth-engagement'
import { fixture as growthRetentionFixture } from './growth-retention'
import { fixture as handoffsFixture } from './handoffs'
import { fixture as kpiStripFixture } from './kpi-strip'
import { fixture as kpiTargetsFixture } from './kpi-targets'
import { fixture as kpiTeamSummaryFixture } from './kpi-team-summary'
import { fixture as leadsMedicalTravelFixture } from './leads-medical-travel'
import { fixture as marketingFixture } from './marketing'
import { fixture as meFixture } from './me'
import { summaryFixture, bookingsFixture, rulesFixture } from './payouts'
import { fixture as pipelineHealthFixture } from './pipeline-health'
import { fixture as pipelineLossesFixture } from './pipeline-losses'
import { fixture as pipelineMomentumFixture } from './pipeline-momentum'
import { fixture as pipelineStalenessFixture } from './pipeline-staleness'
import { fixture as pipelineVelocityFixture } from './pipeline-velocity'
import { fixture as prioritiesFixture } from './priorities'
import { fixture as providersFixture } from './providers'
import { fixture as pulseFixture } from './pulse'
import { fixture as socialGa4Fixture } from './social-ga4'
import { fixture as socialPlatformsFixture } from './social-platforms'
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
  pipeline_staleness: pipelineStalenessFixture,
  pipeline_momentum: pipelineMomentumFixture,
  pipeline_losses: pipelineLossesFixture,
  pipeline_velocity: pipelineVelocityFixture,
  providers: providersFixture,
  handoffs: handoffsFixture,
  appointments: appointmentsFixture,
  appointments_analytics: appointmentsAnalyticsFixture,
  financials: financialsFixture,
  financials_forecast: financialsForecastFixture,
  financials_burn: financialsBurnFixture,
  financials_receivables: financialsReceivablesFixture,
  crm: crmFixture,
  crm_metrics: crmMetricsFixture,
  crm_funnel: crmFunnelFixture,
  crm_leads: crmLeadsFixture,
  crm_lead_sources: crmLeadSourcesFixture,
  crm_lead_funnel: crmLeadFunnelFixture,
  marketing: marketingFixture,
  funnels_general: funnelsGeneralFixture,
  funnels_direct: funnelsDirectFixture,
  funnels_uiux: funnelsUiuxFixture,
  funnels_scheduled: funnelsScheduledFixture,
  funnels_novo: funnelsNovoFixture,
  growth_engagement: growthEngagementFixture,
  growth_retention: growthRetentionFixture,
  agents: agentsFixture,
  tasks: tasksFixture,
  board: boardFixture,
  board_task_detail: boardTaskDetailFixture,
  board_assignable_users: boardAssignableUsersFixture,
  social_ga4: socialGa4Fixture,
  social_platforms: socialPlatformsFixture,
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
  // Write-only endpoints (rule PATCH, manual add and edit): mutateEnvelope
  // resolves null in fixture mode and never calls getFixture, so these stubs
  // only satisfy the record type.
  payouts_rule_patch: () => ({
    data: { rules: [] },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  payouts_manual: () => ({
    data: null,
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  cockpit_queue: cockpitQueueFixture,
  cockpit_case: cockpitCaseFixture,
  cockpit_parked: cockpitParkedFixture,
  cockpit_sla_policy: cockpitSlaPolicyFixture,
  // Cockpit write POST seam (one-step): mutateEnvelope resolves null in fixture
  // mode and never calls getFixture, so this stub only satisfies the record
  // type.
  cockpit_case_write: () => ({
    data: null,
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Smart patient search POST seam: mutateEnvelope resolves null in fixture mode
  // and never calls getFixture, so this stub only satisfies the record type.
  cockpit_search: () => ({
    data: { matches: [] },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Provider board GET stub for dev smoke (the live route gates to name-seers).
  // The add/remove writes go through mutateEnvelope and never read a fixture.
  provider_board: () => ({
    data: { countries: [], hospitals: [], cardsByHospital: {} },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Phase 1b stage-move policy read (GET). Target stages plus loss reasons,
  // both CRM config; the live API replaces this once it is up.
  write_gate_stage_options: () => ({
    data: {
      targets: ['Quote Proposed', 'Consultation Scheduled', 'Lost / Inactive'],
      loss_reasons: ['Price/Affordability', 'No Response', 'Other'],
    },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Phase 2 first-contact template read (GET). A neutral, non-clinical
  // placeholder greeting; the live API replaces this once it is up, and the
  // real text still needs sign-off before any send is enabled.
  whatsapp_first_contact_template: () => ({
    data: {
      id: 'first_contact',
      text: 'Hello from Saleem, your medical-travel coordinator will be in touch shortly. (preview, pending sign-off)',
    },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Editable WhatsApp template library GET stub for dev smoke (the live route
  // lists the real rows). The add/edit/remove writes go through mutateEnvelope
  // and never read a fixture.
  whatsapp_templates: () => ({
    data: { templates: [] },
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Phase 3 quotation build (POST). mutateEnvelope resolves null in fixture
  // mode and never calls getFixture, so this stub only satisfies the record
  // type; no document is generated until the endpoint flips to live.
  documents_quotation: () => ({
    data: null,
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  // Phase 3 referral drafting (POST seams). Both resolve null in fixture mode
  // via mutateEnvelope, which never calls getFixture; these stubs only satisfy
  // the record type. No content is drafted and no document is generated until
  // the endpoints flip to live.
  documents_referral_draft: () => ({
    data: null,
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
  documents_referral_build: () => ({
    data: null,
    meta: { updated_at: new Date().toISOString(), cached: false, stale: false, reliable: true, reasons: [] },
  }),
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

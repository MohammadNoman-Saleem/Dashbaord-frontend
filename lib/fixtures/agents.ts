// Fixture for GET /api/agents
// Values from the approved mockup, Agents view: the six-row Agents card and
// the seven-row "Where the numbers come from" sources card.
//
// Shape note: the contract has no warn or check status for agents, so the
// Funnel diagnostic (chip "Check" in the mockup) is status success and its
// caveat sentence rides along in `describes`. Only the stalled agent carries
// error_plain.

import type { AgentsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const META = {
  updated_at: '2026-06-11T07:42:00+03:00',
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

const DATA = {
  agents: [
    {
      key: 'morning_brief',
      label: 'Morning brief compiler',
      describes: "Builds each person's morning view",
      last_run_display: '6:05 AM',
      next_run_display: '6:00 AM',
      status: 'success',
      error_plain: null,
    },
    {
      key: 'kpi_sync',
      label: 'KPI sync',
      describes: 'Fills the automatic metrics',
      last_run_display: '6:10 AM',
      next_run_display: '6:00 AM',
      status: 'success',
      error_plain: null,
    },
    {
      key: 'corporate_list',
      label: 'Corporate list builder',
      describes: 'Builds the corporate outreach list',
      last_run_display: 'Monday 6:00 AM',
      next_run_display: 'after a restart',
      status: 'stalled',
      error_plain:
        'Stalled since Monday. The model service returned an error. Restart it or tell Al Saeed.',
    },
    {
      key: 'funnel_diagnostic',
      label: 'Funnel diagnostic',
      describes:
        'Checks the funnels against verified counts. Running on an old funnel definition, fix in review, due Jun 12.',
      last_run_display: '6:15 AM',
      next_run_display: '6:00 AM',
      status: 'success',
      error_plain: null,
    },
    {
      key: 'crm_hygiene',
      label: 'CRM hygiene checker',
      describes: 'Flags missing fields and stale stages',
      last_run_display: 'Saturday',
      next_run_display: 'next Saturday',
      status: 'success',
      error_plain: null,
    },
    {
      key: 'weekly_brief',
      label: 'Weekly brief assembler',
      describes: 'Compiles the Saturday brief',
      last_run_display: 'Sat 7:48 PM',
      next_run_display: 'Sat 7:30 PM',
      status: 'success',
      error_plain: null,
    },
  ],
  sources: [
    {
      key: 'admin_panel',
      label: 'Admin panel',
      status: 'steady',
      detail_plain: 'Source of truth for consults and revenue. Steady.',
    },
    {
      key: 'mixpanel',
      label: 'Mixpanel',
      status: 'attention',
      detail_plain:
        'Hit its request limit at 9:14 AM. Saved numbers shown until the next window.',
    },
    {
      key: 'zoho_crm',
      label: 'Zoho CRM',
      status: 'steady',
      detail_plain: 'Deals and leads. Read only here. Steady.',
    },
    {
      key: 'zoho_books',
      label: 'Zoho Books',
      status: 'steady',
      detail_plain: 'Partnership invoices only. Steady.',
    },
    {
      key: 'zoho_projects',
      label: 'Zoho Projects',
      status: 'steady',
      detail_plain:
        'Tasks. Reads here, changes go through the assistant. Steady.',
    },
    {
      key: 'dashboard_store',
      label: 'Dashboard store',
      status: 'steady',
      detail_plain:
        'KPIs, urgent items, payout records. Our own database. Steady.',
    },
    {
      key: 'agents',
      label: 'Agents',
      status: 'attention',
      detail_plain: '5 of 6 healthy. Corporate list builder stalled.',
    },
  ],
} satisfies AgentsData

export function fixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  void params
  return { data: DATA, meta: META }
}

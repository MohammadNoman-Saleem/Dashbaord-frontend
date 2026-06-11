// Fixture for GET /api/pulse. Three blips matching the approved mockup's
// heartbeat strip, in the severity order from 03 section 8: data quality,
// then agents, then staleness, then rate limits. The mockup's "9:14 AM"
// rate-limit time is shifted to 7:14 AM so the copy stays consistent with the
// fixed 7:42 AM fixture timeline.
import type { PulseBlip, PulseData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const BLIPS = [
  {
    key: 'novo_funnel_mismatch',
    title: 'Novo funnel is misreading',
    text: 'The landing page took 4,120 visits this month but the funnel reads zero. The definition fix is in review, due Jun 12. Trust the verified 86 consults.',
    link: { view: 'funnels', tab: 'novo', focus: 'novo-banner' },
    severity: 'quality',
  },
  {
    key: 'agent_corporate_list_stalled',
    title: 'One agent is stalled',
    text: 'The corporate list builder stopped on Monday after a model service error. Nothing else is affected. Restart it from the agents view.',
    link: { view: 'agents', focus: 'agent-corporate-list' },
    severity: 'agent',
  },
  {
    key: 'mixpanel_rate_limited',
    title: 'Funnel numbers are 24 minutes old',
    text: 'Mixpanel hit its request limit at 7:14 AM, so saved numbers are showing. It refreshes again within the hour. Payments stay verified either way.',
    link: { view: 'funnels', focus: 'refresh' },
    severity: 'rate_limit',
  },
] satisfies PulseBlip[]

// 6 agents plus 6 sources are monitored; with 3 blips active, 9 are steady.
const DEFAULT_DATA = {
  blips: BLIPS,
  steady_count: 9,
  updated_at: TS,
} satisfies PulseData

const STEADY_DATA = {
  blips: [],
  steady_count: 12,
  updated_at: TS,
} satisfies PulseData

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const data = params?.state === 'steady' ? STEADY_DATA : DEFAULT_DATA
  return { data, meta: meta() }
}

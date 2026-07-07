// Fixture for GET /api/crm/journey. Fictional treatment-journey breakdown by
// tag. Serves dev smoke; the endpoint is live.
import type { CrmJourneyBreakdown, CrmJourneyData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

function rate(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 10
}

function bd(total: number, won: number, lost: number): CrmJourneyBreakdown {
  return {
    total,
    won,
    lost,
    open: total - won - lost,
    value_bhd: won * 1600,
    win_rate_pct: rate(won, total),
    loss_rate_pct: rate(lost, total),
    stages: [
      { name: 'New Deal', count: Math.round(total * 0.2) },
      { name: 'Treatment Quote', count: Math.round(total * 0.15) },
      { name: 'Treatment Completed', count: won },
      { name: 'Lost / Inactive', count: lost },
    ],
    avg_days_to_completion: 24,
    stage_avg_days: { 'New Deal': 3, 'Treatment Quote': 8, 'Treatment in Progress': 15 },
  }
}

export function fixture(): Envelope<unknown> {
  const data = {
    total: 48,
    by_tag: {
      ASSISTED_JOURNEY: bd(20, 9, 4),
      NAVIGATION_ONLY: bd(16, 4, 6),
      Untagged: bd(12, 2, 3),
    },
    tags: ['ASSISTED_JOURNEY', 'NAVIGATION_ONLY', 'Untagged'],
  } satisfies CrmJourneyData
  return { data, meta: meta() }
}

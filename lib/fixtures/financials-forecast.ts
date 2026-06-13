// Fixture for GET /api/financials/forecast.
// All data is fictional. Shapes mirror the legacy /finance forecast card:
// three month buckets with weighted and unweighted totals, plus overdue and
// undated buckets so no open deal silently disappears.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FinancialsForecastData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const FORECAST = {
  months: [
    { key: '2026-06', label: 'Jun 2026', weighted_bhd: 2140, unweighted_bhd: 5400, deal_count: 12 },
    { key: '2026-07', label: 'Jul 2026', weighted_bhd: 1480, unweighted_bhd: 3900, deal_count: 8 },
    { key: '2026-08', label: 'Aug 2026', weighted_bhd: 620, unweighted_bhd: 2100, deal_count: 4 },
  ],
  overdue: { weighted_bhd: 410, unweighted_bhd: 1300, deal_count: 3 },
  undated: { weighted_bhd: 180, unweighted_bhd: 700, deal_count: 2 },
  won_to_date_bhd: 960,
  by_pipeline: [
    { pipeline: 'Treatment', weighted_bhd: 2350 },
    { pipeline: 'Telemedicine', weighted_bhd: 1240 },
    { pipeline: 'Corporates', weighted_bhd: 650 },
  ],
  weight_note:
    'Most open deals (18 of 29) have no probability set in Zoho, so their weights fall back to each pipeline\'s historical win rate.',
} satisfies FinancialsForecastData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: FORECAST, meta: META }
}

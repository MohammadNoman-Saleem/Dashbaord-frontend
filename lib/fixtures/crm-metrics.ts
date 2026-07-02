// Fixture for GET /api/crm/metrics. A small fictional overview payload: overall
// lead and deal KPIs plus per-pipeline month over month across the five
// pipelines. All data is fictional. Serves dev smoke; the endpoint is live.
import type { CrmMetricsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

export function fixture(): Envelope<unknown> {
  const data = {
    total_leads: 420,
    total_deals: 138,
    total_leads_this_month: 44,
    total_leads_last_month: 38,
    leads_change_pct: 16,
    total_deals_this_month: 17,
    total_deals_last_month: 21,
    deals_change_pct: -19,
    total_deals_open: 61,
    total_won: 52,
    pipeline_value_bhd: 41800,
    by_pipeline: {
      Telemedicine: { total: 60, this_month: 8, last_month: 10, change_pct: -20, won: 22, lost: 14, open: 24, value_bhd: 5200, win_rate_pct: 36.7, loss_rate_pct: 23.3 },
      Treatment: { total: 48, this_month: 6, last_month: 7, change_pct: -14, won: 15, lost: 9, open: 24, value_bhd: 28800, win_rate_pct: 31.3, loss_rate_pct: 18.8 },
      Corporates: { total: 12, this_month: 2, last_month: 1, change_pct: 100, won: 4, lost: 2, open: 6, value_bhd: 6100, win_rate_pct: 33.3, loss_rate_pct: 16.7 },
      Doctor: { total: 10, this_month: 1, last_month: 2, change_pct: -50, won: 6, lost: 1, open: 3, value_bhd: 900, win_rate_pct: 60, loss_rate_pct: 10 },
      'Hospital or Clinic': { total: 8, this_month: 0, last_month: 0, change_pct: 0, won: 5, lost: 0, open: 3, value_bhd: 800, win_rate_pct: 62.5, loss_rate_pct: 0 },
    },
  } satisfies CrmMetricsData
  return { data, meta: meta() }
}

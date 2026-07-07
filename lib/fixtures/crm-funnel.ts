// Fixture for GET /api/crm/funnel. A small fictional monthly funnel for the
// Customers and Providers segments, plus the conversion summary. All data is
// fictional. The period is read from params (default all) and echoed back.
// Serves dev smoke; the endpoint is live.
import type { CrmFunnelData, CrmFunnelPeriod } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const PERIODS: readonly CrmFunnelPeriod[] = ['mtd', 'ytd', 'all']

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const raw = String(params?.period ?? 'all')
  const period: CrmFunnelPeriod = PERIODS.includes(raw as CrmFunnelPeriod)
    ? (raw as CrmFunnelPeriod)
    : 'all'

  const data = {
    funnels: {
      Customers: [
        { month: 'Apr 26', leads: 52, deals: 18, won: 9 },
        { month: 'May 26', leads: 61, deals: 22, won: 11 },
        { month: 'Jun 26', leads: 44, deals: 17, won: 8 },
      ],
      Providers: [
        { month: 'Apr 26', leads: 14, deals: 5, won: 3 },
        { month: 'May 26', leads: 12, deals: 6, won: 4 },
        { month: 'Jun 26', leads: 9, deals: 4, won: 2 },
      ],
    },
    summary: {
      Customers: { total_leads: 157, total_deals: 57, total_won: 28, leads_to_deals_pct: 36.3, deals_to_won_pct: 49.1 },
      Providers: { total_leads: 35, total_deals: 15, total_won: 9, leads_to_deals_pct: 42.9, deals_to_won_pct: 60 },
    },
    period,
  } satisfies CrmFunnelData
  return { data, meta: meta() }
}

// Fixture for GET /api/crm/lead-funnel. A fictional cumulative lead funnel,
// overall and by segment. The period is read from params (default all) and
// echoed back. Serves dev smoke; the endpoint is live.
import type {
  CrmLeadFunnelData,
  CrmLeadFunnelPeriod,
  CrmLeadFunnelStage,
} from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const PERIODS: readonly CrmLeadFunnelPeriod[] = ['all', 'ytd', 'mtd']

function rate(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 10
}

function mkStage(
  total: number,
  contacted: number,
  callDone: number,
  dealReady: number,
  converted: number,
  notQualified: number,
): CrmLeadFunnelStage {
  return {
    total,
    contacted,
    call_done: callDone,
    deal_ready: dealReady,
    converted,
    not_qualified: notQualified,
    contacted_rate: rate(contacted, total),
    call_done_rate: rate(callDone, total),
    deal_ready_rate: rate(dealReady, total),
    converted_rate: rate(converted, total),
    not_qualified_rate: rate(notQualified, total),
    new_to_contacted: rate(contacted, total),
    contacted_to_call_done: rate(callDone, contacted),
    call_done_to_deal_ready: rate(dealReady, callDone),
    deal_ready_to_converted: rate(converted, dealReady),
  }
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const raw = String(params?.period ?? 'all')
  const period: CrmLeadFunnelPeriod = PERIODS.includes(raw as CrmLeadFunnelPeriod)
    ? (raw as CrmLeadFunnelPeriod)
    : 'all'

  const data = {
    overall: mkStage(420, 250, 150, 90, 62, 70),
    by_segment: {
      Customers: mkStage(360, 210, 130, 78, 55, 60),
      Providers: mkStage(60, 40, 20, 12, 7, 10),
    },
    period,
  } satisfies CrmLeadFunnelData
  return { data, meta: meta() }
}

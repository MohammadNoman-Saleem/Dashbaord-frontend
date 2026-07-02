// Fixture for GET /api/crm/subtype. Fictional customer sub-type breakdown with
// a per-pipeline split. Serves dev smoke; the endpoint is live.
import type { CrmSubtypeBreakdown, CrmSubtypeData, CrmSubtypeSummary } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

function rate(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 10
}

function bd(total: number, won: number, lost: number): CrmSubtypeBreakdown {
  return {
    total,
    won,
    lost,
    open: total - won - lost,
    value_bhd: won * 1200,
    win_rate_pct: rate(won, total),
    loss_rate_pct: rate(lost, total),
  }
}

function summ(
  tmTotal: number,
  tmWon: number,
  tmLost: number,
  trTotal: number,
  trWon: number,
  trLost: number,
): CrmSubtypeSummary {
  const tm = bd(tmTotal, tmWon, tmLost)
  const tr = bd(trTotal, trWon, trLost)
  const total = tmTotal + trTotal
  const won = tmWon + trWon
  const lost = tmLost + trLost
  return {
    total,
    won,
    lost,
    open: total - won - lost,
    value_bhd: tm.value_bhd + tr.value_bhd,
    win_rate_pct: rate(won, total),
    loss_rate_pct: rate(lost, total),
    by_pipeline: { Telemedicine: tm, Treatment: tr },
  }
}

export function fixture(): Envelope<unknown> {
  const data = {
    total: 108,
    by_subtype: {
      Direct: summ(40, 14, 8, 20, 7, 4),
      Sponsored: summ(18, 6, 3, 10, 4, 2),
      Untagged: summ(8, 2, 2, 12, 3, 3),
    },
    subtypes: ['Direct', 'Sponsored', 'Untagged'],
  } satisfies CrmSubtypeData
  return { data, meta: meta() }
}

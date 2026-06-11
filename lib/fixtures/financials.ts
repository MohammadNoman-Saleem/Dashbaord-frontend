// Fixture for GET /api/financials.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Financials view). All data is fictional.
//
// Invoice ids are invented (the mockup table has none). The revenue spark
// follows the mockup polyline shape, scaled to end at the June 4,180 figure.
// The fourth tile in the mockup (the collection note, "Patient pays Saleem,
// Saleem remits the partner.") has no contract field; it is static UI copy.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FinancialsData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const FINANCIALS = {
  platform_revenue: {
    month_bhd: 4180,
    vs_prev_pct: 22,
    split_plain: 'Consults BHD 2,140 · Treatment BHD 1,305 · Novo BHD 735.',
    spark: [980, 1250, 1120, 1810, 2090, 2510, 3070, 3620, 4180],
    verified: true,
  },
  invoices: [
    {
      id: 'inv-novo-p2',
      customer: 'Novo Nordisk · obesity track, phase 2',
      amount_bhd: 3750,
      status: 'awaiting',
      due_display: 'Jun 20',
    },
    {
      id: 'inv-novo-p1',
      customer: 'Novo Nordisk · phase 1',
      amount_bhd: 6250,
      status: 'paid',
      due_display: 'Paid May 4',
    },
    {
      id: 'inv-clinic-pilot',
      customer: 'Partner clinic listing pilot',
      amount_bhd: 400,
      status: 'paid',
      due_display: 'Paid May 18',
    },
  ],
  outstanding_bhd: 3750,
  payouts_due_bhd: 2610,
  saleem_share_bhd: 1570,
  treatment_manual_bhd: 735,
} satisfies FinancialsData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: FINANCIALS, meta: META }
}

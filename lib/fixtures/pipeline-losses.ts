// Fixture for GET /api/pipeline/losses: lost value trend, owner breakdown,
// and the loss reason by lead source cross-tab. All data is fictional.
import type { PipelineLossesData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const MONTHS: Array<[string, string, number, number]> = [
  ['2025-07', 'Jul', 1, 0],
  ['2025-08', 'Aug', 2, 350],
  ['2025-09', 'Sep', 0, 0],
  ['2025-10', 'Oct', 3, 1200],
  ['2025-11', 'Nov', 1, 0],
  ['2025-12', 'Dec', 2, 800],
  ['2026-01', 'Jan', 4, 2100],
  ['2026-02', 'Feb', 2, 0],
  ['2026-03', 'Mar', 1, 450],
  ['2026-04', 'Apr', 5, 1900],
  ['2026-05', 'May', 3, 600],
  ['2026-06', 'Jun', 1, 0],
]

const DATA = {
  months: MONTHS.map(([key, label, count, value_bhd]) => ({ key, label, count, value_bhd })),
  owners: [
    { owner: 'Fatima', count: 11, value_bhd: 3900 },
    { owner: 'Razan', count: 9, value_bhd: 2100 },
    { owner: 'Khalid', count: 3, value_bhd: 1100 },
    { owner: 'Unassigned', count: 2, value_bhd: 300 },
  ],
  cross: {
    sources: ['Unknown', 'Advertisement', 'Referral'],
    rows: [
      { reason: 'No Response', counts: [8, 2, 1] },
      { reason: 'Chose Another Provider', counts: [4, 1, 0] },
      { reason: 'Price/Affordability', counts: [3, 2, 0] },
      { reason: 'Service Not Available', counts: [2, 0, 1] },
      { reason: 'No reason set', counts: [1, 0, 0] },
    ],
  },
  totals: { lost_count: 25, lost_value_bhd: 7400, top_reason: 'No Response' },
} satisfies PipelineLossesData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

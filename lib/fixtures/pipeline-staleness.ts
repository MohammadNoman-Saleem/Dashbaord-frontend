// Fixture for GET /api/pipeline/staleness: open deals by days since last
// update, with the over-30-days chase list by owner. All data is fictional.
import type { PipelineStalenessData, StalenessScope } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

function scope(name: string, label: string, counts: [number, number, number, number]): StalenessScope {
  return {
    scope: name,
    label,
    buckets: [
      { key: 'b0', label: '0 to 7 days', count: counts[0], value_bhd: counts[0] * 120 },
      { key: 'b8', label: '8 to 14 days', count: counts[1], value_bhd: counts[1] * 95 },
      { key: 'b15', label: '15 to 30 days', count: counts[2], value_bhd: counts[2] * 80 },
      { key: 'b31', label: 'Over 30 days', count: counts[3], value_bhd: counts[3] * 60 },
    ],
    owners:
      counts[3] > 0
        ? [
            { owner: 'Fatima', count: Math.ceil(counts[3] / 2), value_bhd: 2400, top_stage: 'Quote Proposed' },
            { owner: 'Razan', count: Math.floor(counts[3] / 2), value_bhd: 900, top_stage: 'New Deal' },
          ]
        : [],
  }
}

const DATA = {
  scopes: [
    scope('all', 'All pipelines', [14, 6, 4, 9]),
    scope('Telemedicine', 'Telemedicine', [6, 2, 1, 2]),
    scope('Treatment', 'Treatment', [4, 2, 1, 3]),
    scope('Corporates', 'Corporates', [1, 0, 1, 0]),
    scope('Doctor', 'Doctor', [2, 1, 1, 3]),
    scope('Hospital or Clinic', 'Hospital or Clinic', [1, 1, 0, 1]),
  ],
} satisfies PipelineStalenessData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

// Fixture for GET /api/pipeline/momentum: per-pipeline month over month.
// All data is fictional.
import type { PipelineMomentumData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  compare_label: 'June so far vs May',
  pipelines: [
    {
      pipeline: 'Telemedicine',
      total: 42,
      this_month: 9,
      last_month: 7,
      change_pct: 29,
      open: 18,
      won: 19,
      lost: 5,
      win_rate_pct: 45.2,
      loss_rate_pct: 11.9,
      total_value_bhd: 1260,
    },
    {
      pipeline: 'Treatment',
      total: 31,
      this_month: 4,
      last_month: 6,
      change_pct: -33,
      open: 12,
      won: 8,
      lost: 11,
      win_rate_pct: 25.8,
      loss_rate_pct: 35.5,
      total_value_bhd: 18400,
    },
    {
      pipeline: 'Corporates',
      total: 6,
      this_month: 1,
      last_month: 0,
      change_pct: null,
      open: 4,
      won: 1,
      lost: 1,
      win_rate_pct: 16.7,
      loss_rate_pct: 16.7,
      total_value_bhd: 9000,
    },
    {
      pipeline: 'Doctor',
      total: 58,
      this_month: 6,
      last_month: 6,
      change_pct: 0,
      open: 44,
      won: 11,
      lost: 3,
      win_rate_pct: 19,
      loss_rate_pct: 5.2,
      total_value_bhd: 0,
    },
    {
      pipeline: 'Hospital or Clinic',
      total: 21,
      this_month: 2,
      last_month: 4,
      change_pct: -50,
      open: 15,
      won: 4,
      lost: 2,
      win_rate_pct: 19,
      loss_rate_pct: 9.5,
      total_value_bhd: 36500,
    },
  ],
} satisfies PipelineMomentumData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

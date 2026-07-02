// Fixture for GET /api/crm/pipeline. Fictional per-pipeline stage breakdowns.
// The period is read from params (default all) and echoed back. Serves dev
// smoke; the endpoint is live.
import type { CrmPipelineData, CrmPipelinePeriod, CrmPipelineSummary } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const PERIODS: readonly CrmPipelinePeriod[] = ['all', 'mtd', 'ytd']

function empty(): CrmPipelineSummary {
  return { stages: [], total: 0, won: 0, lost: 0, open: 0, value_bhd: 0, win_rate_pct: 0, loss_rate_pct: 0, loss_reasons: [] }
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const raw = String(params?.period ?? 'all')
  const period: CrmPipelinePeriod = PERIODS.includes(raw as CrmPipelinePeriod)
    ? (raw as CrmPipelinePeriod)
    : 'all'

  const data = {
    pipelines: {
      Telemedicine: {
        stages: [
          { name: 'New Deal', count: 12, value_bhd: 0 },
          { name: 'Quote Proposed', count: 8, value_bhd: 2400 },
          { name: 'Payment Done', count: 5, value_bhd: 1500 },
          { name: 'Consultation Scheduled', count: 4, value_bhd: 1200 },
          { name: 'TeleConsult Completed', count: 22, value_bhd: 0 },
          { name: 'Lost / Inactive', count: 14, value_bhd: 0 },
        ],
        total: 65, won: 22, lost: 14, open: 29, value_bhd: 5200, win_rate_pct: 33.8, loss_rate_pct: 21.5,
        loss_reasons: [
          { reason: 'Price', count: 6 },
          { reason: 'No response', count: 5 },
          { reason: 'No reason specified', count: 3 },
        ],
      },
      Treatment: {
        stages: [
          { name: 'New Deal', count: 6, value_bhd: 0 },
          { name: 'Treatment Quote', count: 5, value_bhd: 12000 },
          { name: 'Treatment in Progress', count: 4, value_bhd: 9600 },
          { name: 'Treatment Completed', count: 15, value_bhd: 0 },
          { name: 'Lost / Inactive', count: 9, value_bhd: 0 },
        ],
        total: 48, won: 15, lost: 9, open: 24, value_bhd: 28800, win_rate_pct: 31.3, loss_rate_pct: 18.8,
        loss_reasons: [
          { reason: 'Cost', count: 5 },
          { reason: 'No reason specified', count: 4 },
        ],
      },
      Corporates: empty(),
      Doctor: empty(),
      'Hospital or Clinic': empty(),
    },
    period,
  } satisfies CrmPipelineData
  return { data, meta: meta() }
}

// Fixture for GET /api/crm/segments. Fictional geographic and specialty
// breakdowns. The metric is read from params (default count) and echoed back.
// Serves dev smoke; the endpoint is live.
import type { CrmSegmentMetric, CrmSegmentsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const metric: CrmSegmentMetric = String(params?.metric ?? 'count') === 'amount' ? 'amount' : 'count'
  const data = {
    geographic: [
      { name: 'Turkey', value: 24 },
      { name: 'India', value: 18 },
      { name: 'Germany', value: 9 },
      { name: 'Bahrain', value: 7 },
      { name: 'Other', value: 5 },
    ],
    specialty: [
      { name: 'Orthopedics', value: 16 },
      { name: 'Neuro, spine, rehab', value: 12 },
      { name: 'Other', value: 9 },
      { name: 'Cosmetic', value: 8 },
      { name: 'Gastro', value: 6 },
    ],
    metric,
  } satisfies CrmSegmentsData
  return { data, meta: meta() }
}

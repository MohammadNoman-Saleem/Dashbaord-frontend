// Fixture for GET /api/crm/deals. A few fictional, privacy-gated deal rows
// (customer deals show reference plus initials, provider deals show a business
// name). Serves dev smoke; the endpoint is live.
import type { CrmDealsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

export function fixture(): Envelope<unknown> {
  const data = {
    rows: [
      { id: 'deal-1', record: 'D-3012 · K.A.', owner: 'Ops one', pipeline: 'Telemedicine', stage: 'TeleConsult Completed', outcome: 'won', amount_bhd: 25, lead_source: 'Instagram', created: '2026-06-28T10:00:00+03:00' },
      { id: 'deal-2', record: 'D-3009 · M.S.', owner: 'Ops two', pipeline: 'Treatment', stage: 'Treatment Quote', outcome: 'open', amount_bhd: 2400, lead_source: 'Referral', created: '2026-06-27T12:00:00+03:00' },
      { id: 'deal-3', record: 'Gulf Medical Center', owner: 'Ops one', pipeline: 'Hospital or Clinic', stage: 'Live Partner B2B', outcome: 'won', amount_bhd: 0, lead_source: '·', created: '2026-06-25T09:00:00+03:00' },
    ],
    page: 1,
    pages: 5,
    total: 120,
    pipelines: ['Telemedicine', 'Treatment', 'Corporates', 'Doctor', 'Hospital or Clinic'],
  } satisfies CrmDealsData
  return { data, meta: meta() }
}

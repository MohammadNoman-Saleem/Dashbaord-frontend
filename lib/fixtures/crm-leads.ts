// Fixture for GET /api/crm/leads. A few fictional, privacy-gated lead rows
// (reference plus initials only, never a name), with the distinct statuses for
// the filter. Serves dev smoke; the endpoint is live.
import type { CrmLeadsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

export function fixture(): Envelope<unknown> {
  const data = {
    rows: [
      { id: 'lead-1', ref: 'L-1042', initials: 'K.A.', segment: 'Customers', lead_source: 'Instagram', lead_status: 'Intro Call Done', created: '2026-06-28T10:00:00+03:00' },
      { id: 'lead-2', ref: 'L-1041', initials: 'M.S.', segment: 'Providers', lead_source: 'Referral', lead_status: 'New', created: '2026-06-27T14:30:00+03:00' },
      { id: 'lead-3', ref: 'L-1040', initials: 'A.B.', segment: 'Customers', lead_source: 'Unknown', lead_status: 'Not Qualified', created: '2026-06-26T09:15:00+03:00' },
    ],
    page: 1,
    pages: 3,
    total: 68,
    statuses: ['New', 'Waiting Response', 'Intro Call Scheduled', 'Intro Call Done', 'Deal Ready', 'Not Qualified'],
  } satisfies CrmLeadsData
  return { data, meta: meta() }
}

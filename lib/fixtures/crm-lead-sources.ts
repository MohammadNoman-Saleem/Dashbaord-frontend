// Fixture for GET /api/crm/lead-sources. Fictional source counts, pre-sorted
// descending, including an Unknown bucket. Serves dev smoke; endpoint is live.
import type { CrmLeadSourcesData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-30T09:00:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

export function fixture(): Envelope<unknown> {
  const data = {
    sources: [
      { name: 'Instagram', count: 128 },
      { name: 'Website', count: 96 },
      { name: 'Referral', count: 54 },
      { name: 'WhatsApp', count: 41 },
      { name: 'Unknown', count: 33 },
    ],
  } satisfies CrmLeadSourcesData
  return { data, meta: meta() }
}

// Fixture for GET /api/handoffs. Aziz's handoffs panel from the approved
// mockup: 31 of 34 on time (92%), 3 misses, all Thursday evening. The mockup
// details one miss; the other two are invented consistent with its copy
// ("both SLA breaches trace to evening coverage").
import type { HandoffsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  on_time_pct: 92,
  on_time_count: 31,
  total: 34,
  misses: [
    {
      what: 'A website lead sat 5 hours before logging',
      owner: 'Fatima',
      cause: 'Evening coverage gap. Root cause started.',
      when: 'Thursday 6:40 PM',
    },
    {
      what: 'Portal bug routed the next morning instead of same day',
      owner: 'Mehran',
      cause: 'Raised after hours, no evening rota.',
      when: 'Thursday 8:15 PM',
    },
    {
      what: 'Release note announced a day late',
      owner: 'Noman',
      cause: 'Slipped behind the deploy checklist.',
      when: 'Thursday 9:05 PM',
    },
  ],
} satisfies HandoffsData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

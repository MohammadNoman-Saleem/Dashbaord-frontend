// Fixture for GET /api/pipeline/providers. Per-scope stage counts and
// footer sentences from the V3 mockup's provider onboarding panel (Razan's
// home). Footers arrive assembled server-side with the live numbers; the
// unclassified count surfaces providers with no country set (07 section 2).
import type { ProvidersData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  scopes: {
    all: {
      stages: [
        { label: 'In discussion', count: 3 },
        { label: 'NHRA step', count: 2 },
        { label: 'Final approval', count: 2 },
        { label: 'Live this month', count: 1 },
      ],
      foot: '12 live in total: 9 local, 3 international.',
    },
    local: {
      stages: [
        { label: 'In discussion', count: 2 },
        { label: 'NHRA step', count: 2 },
        { label: 'Final approval', count: 2 },
        { label: 'Live this month', count: 1 },
      ],
      foot: '9 local live. Local doctors complete NHRA linkage through Mehan.',
    },
    intl: {
      stages: [
        { label: 'In discussion', count: 1 },
        { label: 'NHRA step', count: 0 },
        { label: 'Final approval', count: 0 },
        { label: 'Live this month', count: 0 },
      ],
      foot: "3 international live: India 2, UK 1. Licensed through Saleem's NHRA invitation, no extra requirements.",
    },
  },
  unclassified: 0,
} satisfies ProvidersData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

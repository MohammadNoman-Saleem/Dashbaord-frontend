// Fixture for GET /api/pipeline/health. The "running late" rows from the
// approved mockup's cases view, promises in plain words.
import type { LateItem, PipelineHealthData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const ITEMS = [
  {
    what: 'Treatment quote, Patient C.',
    promise_plain: 'Quote within 72h',
    owner: 'Fatima',
    over_by_days: 2,
  },
  {
    what: 'Hospital quote, spine case',
    promise_plain: 'Partner reply within 72h',
    owner: 'Fatima',
    over_by_days: 3,
  },
  {
    what: 'First reply, Lead 0395',
    promise_plain: 'Reply within 12h',
    owner: 'Fatima',
    over_by_days: 1,
  },
  {
    what: 'Provider documents, Dr. M.',
    promise_plain: 'Docs within 7 days',
    owner: 'Razan',
    over_by_days: 4,
  },
  {
    what: 'Proposal, Alpha Insurance',
    promise_plain: 'Send within 5 days',
    owner: 'Afaf',
    over_by_days: 2,
  },
] satisfies LateItem[]

const DATA = { items: ITEMS } satisfies PipelineHealthData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

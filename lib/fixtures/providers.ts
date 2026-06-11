// Fixture for GET /api/pipeline/providers. Stage counts and the sign-off
// queue from the approved mockup's provider onboarding panel (Razan's home).
import type { ProvidersData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  stages: [
    { label: 'In discussion', count: 3 },
    { label: 'NHRA step', count: 2 },
    { label: 'Final approval', count: 2 },
    { label: 'Live this month', count: 1 },
  ],
  awaiting_signoff: ['Dr. M. (cardiology)', 'Alnoor Clinic'],
} satisfies ProvidersData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

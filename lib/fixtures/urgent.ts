// Fixture for GET /api/urgent. Open and resolved lists matching the approved
// mockup's urgent drawer. Relative ages in the mockup (35m, 2h, 1d) are
// anchored to the fixed 7:42 AM fixture timeline.
import type { UrgentData, UrgentItem } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const OPEN = [
  {
    id: 'urg_104',
    text: 'Patient E. asked for a call before 5 PM today',
    raised_by: 'fatima',
    raised_by_name: 'Fatima',
    created_at: '2026-06-11T07:07:00+03:00',
    resolved_at: null,
    resolved_by: null,
  },
  {
    id: 'urg_103',
    text: 'Novo invoice: confirm receipt with Zaid before Thursday',
    raised_by: 'isa',
    raised_by_name: 'Isa',
    created_at: '2026-06-11T05:42:00+03:00',
    resolved_at: null,
    resolved_by: null,
  },
  {
    id: 'urg_102',
    text: 'Doctor portal photo upload failing for one provider',
    raised_by: 'mehran',
    raised_by_name: 'Mehran',
    created_at: '2026-06-10T07:42:00+03:00',
    resolved_at: null,
    resolved_by: null,
  },
] satisfies UrgentItem[]

const RESOLVED = [
  {
    id: 'urg_101',
    text: 'WhatsApp campaign approved and scheduled',
    raised_by: 'aziz',
    raised_by_name: 'Aziz',
    created_at: '2026-06-09T16:20:00+03:00',
    resolved_at: '2026-06-10T11:05:00+03:00',
    resolved_by: 'afaf',
  },
] satisfies UrgentItem[]

const DATA = {
  open: OPEN,
  resolved: RESOLVED,
} satisfies UrgentData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

// Fixture for GET /api/blockers. Open and resolved lists from the V3
// mockup's blockers drawer, anchored to the fixed 7:42 AM fixture timeline.
// All data is fictional.
import type { BlockerItem, BlockersData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const OPEN = [
  {
    id: 'blk_106',
    text: 'Hospital quote for the spine case, partner desk not answering',
    waiting_on: 'Alnoor partner desk',
    raised_by: 'fatima',
    raised_by_name: 'Fatima',
    raised_at: '2026-06-08T07:42:00+03:00',
    age_label: '3d',
    status: 'open',
    repeat_of: 'blk_092',
    root_cause_flag: true,
    resolution_note: null,
  },
  {
    id: 'blk_105',
    text: 'Sunday WhatsApp send stuck until DOO approves the new template',
    waiting_on: 'DOO Connect support',
    raised_by: 'afaf',
    raised_by_name: 'Afaf',
    raised_at: '2026-06-10T07:42:00+03:00',
    age_label: '1d',
    status: 'open',
    repeat_of: null,
    root_cause_flag: false,
    resolution_note: null,
  },
  {
    id: 'blk_104',
    text: 'Novo invoice needs a PO number their side has not issued',
    waiting_on: "Zaid's team",
    raised_by: 'isa',
    raised_by_name: 'Isa',
    raised_at: '2026-06-11T03:42:00+03:00',
    age_label: '4h',
    status: 'open',
    repeat_of: null,
    root_cause_flag: false,
    resolution_note: null,
  },
] satisfies BlockerItem[]

const RESOLVED = [
  {
    id: 'blk_101',
    text: 'CRM export permission for the investor pack',
    waiting_on: 'Al Saeed',
    raised_by: 'noman',
    raised_by_name: 'Noman',
    raised_at: '2026-06-09T10:15:00+03:00',
    age_label: 'Yesterday',
    status: 'unblocked',
    repeat_of: null,
    root_cause_flag: false,
    resolution_note: 'Access granted, cause documented',
  },
] satisfies BlockerItem[]

const DATA = { open: OPEN, resolved: RESOLVED } satisfies BlockersData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

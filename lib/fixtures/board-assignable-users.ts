// Fixture for GET /api/board/assignable-users. The owner picker's source: the
// Postgres users that carry a Zoho zpuid, with the admin excluded. The board
// endpoint is live in this build; this fixture serves dev smoke until the
// backend is up. Fictional team members, no patient data.
import type { BoardAssignableUser } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-14T08:10:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const USERS: BoardAssignableUser[] = [
  { key: 'mehran', name: 'Mehran Ali', zpuid: '2599674000000111001' },
  { key: 'noman', name: 'Mohammad Noman', zpuid: '2599674000000111002' },
  { key: 'afaf', name: 'Afaf Dhahi', zpuid: '2599674000000111003' },
  { key: 'aziz', name: 'Aziz Mansoor', zpuid: '2599674000000111004' },
]

export function fixture(): Envelope<unknown> {
  return { data: USERS, meta: meta() }
}

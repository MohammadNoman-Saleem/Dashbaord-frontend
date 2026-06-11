// Fixture for GET /api/tasks. The read-only sprint slice from the approved
// mockup's agents view (Zoho Projects, reads only; changes go through the
// assistant).
import type { TasksData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  rows: [
    { title: 'Doctor portal photo upload', owner: 'Mehran', status: 'Blocked', due_display: 'Jun 11' },
    { title: 'Novo funnel definition', owner: 'Noman', status: 'In review', due_display: 'Jun 12' },
    { title: 'Payout rules editor', owner: 'Noman', status: 'In progress', due_display: 'Jun 18' },
    { title: 'Safari date picker', owner: 'Mehran', status: 'Queued', due_display: 'Jun 20' },
    { title: 'Payment waiting state', owner: 'Mehran', status: 'Queued', due_display: 'Jun 24' },
  ],
} satisfies TasksData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

// Fixture for GET /api/board?tab=&project=&tasklist=. Mirrors the live shape:
// legacy column order, cards with owner, due, priority, and tasklist. The
// board endpoint is live in this build; this fixture is kept type-aligned so
// the contract change is caught at typecheck. All content is fictional team
// work, no patient data anywhere near this board by design.
import type { BoardColumn, BoardData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

function columns(tasklist: string | null): BoardColumn[] {
  const cards = {
    backlog: [
      { id: '900100', title: 'Doctor portal photo upload', owner: 'Mehran Ali', owner_zpuid: '900000000000001', due_display: null, priority: 'Medium', tasklist, status: 'Backlog' },
    ],
    open: [
      { id: '900101', title: 'Safari date picker fix', owner: 'Mehran Ali', owner_zpuid: '900000000000001', due_display: 'Jun 20', priority: 'High', tasklist, status: 'Open' },
      { id: '900102', title: 'Weekly brief copy review', owner: 'Afaf Dhahi', owner_zpuid: '900000000000002', due_display: 'Jun 14', priority: 'Low', tasklist, status: 'Open' },
    ],
    inProgress: [
      { id: '900103', title: 'Payout rules editor', owner: 'Mohammad Noman', owner_zpuid: '900000000000003', due_display: 'Jun 18', priority: 'Medium', tasklist, status: 'In Progress' },
    ],
    toBeTested: [
      { id: '900104', title: 'Novo funnel definition', owner: 'Mohammad Noman', owner_zpuid: '900000000000003', due_display: 'Jun 12', priority: 'High', tasklist, status: 'To be Tested' },
    ],
    closed: [
      { id: '900105', title: 'Payment waiting state', owner: 'Mehran Ali', owner_zpuid: '900000000000001', due_display: 'Jun 8', priority: 'Low', tasklist, status: 'Closed' },
    ],
  }
  return [
    { status: 'Backlog', status_type: 'open', count: cards.backlog.length, cards: cards.backlog },
    { status: 'Open', status_type: 'open', count: cards.open.length, cards: cards.open },
    { status: 'In Progress', status_type: 'open', count: cards.inProgress.length, cards: cards.inProgress },
    { status: 'To be Tested', status_type: 'open', count: cards.toBeTested.length, cards: cards.toBeTested },
    { status: 'On Hold', status_type: null, count: 0, cards: [] },
    { status: 'Delayed', status_type: null, count: 0, cards: [] },
    { status: 'Closed', status_type: 'closed', count: cards.closed.length, cards: cards.closed },
    { status: 'Cancelled', status_type: null, count: 0, cards: [] },
  ]
}

const TAB_LABELS: Record<string, string> = {
  cross: 'Cross-Dept',
  it: 'IT',
  other: 'Other',
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const tab = String(params?.tab ?? 'cross')
  const tasklistId = params?.tasklist != null ? String(params.tasklist) : null
  const data = {
    tab,
    tab_label: TAB_LABELS[tab] ?? 'Cross-Dept',
    project_id: tab === 'it' ? '2599674000000342004' : '2599674000000344008',
    project_name: tab === 'it' ? 'Saleem IT and Product' : 'Saleem Cross-Department',
    tasklist_id: tasklistId,
    tasklist_name: tasklistId ? 'Sample tasklist' : null,
    columns: columns(tasklistId ? 'Sample tasklist' : null),
  } satisfies BoardData
  return { data, meta: meta() }
}

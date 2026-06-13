// Fixture for GET /api/board?scope=. Mirrors the live shape: legacy column
// order, cards with owner, due, priority, and tasklist. Scope-aware so the
// pills exercise real switching while the endpoint is in fixture mode.
// All content is fictional team work, no patient data anywhere near this
// board by design.
import type { BoardColumn, BoardData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

function columns(scope: string): BoardColumn[] {
  const tasklist = scope === 'cross' ? null : scope.charAt(0).toUpperCase() + scope.slice(1)
  const cards = {
    backlog: [
      { id: '900100', title: 'Doctor portal photo upload', owner: 'Mehran Ali', due_display: null, priority: 'Medium', tasklist, status: 'Backlog' },
    ],
    open: [
      { id: '900101', title: 'Safari date picker fix', owner: 'Mehran Ali', due_display: 'Jun 20', priority: 'High', tasklist, status: 'Open' },
      { id: '900102', title: 'Weekly brief copy review', owner: 'Afaf Dhahi', due_display: 'Jun 14', priority: 'Low', tasklist, status: 'Open' },
    ],
    inProgress: [
      { id: '900103', title: 'Payout rules editor', owner: 'Mohammad Noman', due_display: 'Jun 18', priority: 'Medium', tasklist, status: 'In Progress' },
    ],
    toBeTested: [
      { id: '900104', title: 'Novo funnel definition', owner: 'Mohammad Noman', due_display: 'Jun 12', priority: 'High', tasklist, status: 'To be Tested' },
    ],
    closed: [
      { id: '900105', title: 'Payment waiting state', owner: 'Mehran Ali', due_display: 'Jun 8', priority: 'Low', tasklist, status: 'Closed' },
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

const SCOPE_LABELS: Record<string, string> = {
  bugs: 'Bugs',
  features: 'Features',
  access: 'Access',
  integrations: 'Integrations',
  general: 'General',
  cross: 'Cross-department',
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const scope = String(params?.scope ?? 'cross')
  const data = {
    scope,
    scope_label: SCOPE_LABELS[scope] ?? 'Cross-department',
    project_id: scope === 'cross' ? '2599674000000344008' : '2599674000000342004',
    project_name: scope === 'cross' ? 'Saleem Cross-Department' : 'Saleem IT and Product',
    columns: columns(scope),
  } satisfies BoardData
  return { data, meta: meta() }
}

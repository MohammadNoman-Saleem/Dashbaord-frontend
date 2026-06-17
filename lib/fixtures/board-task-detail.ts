// Fixture for GET /api/board/task/:id?project=. Mirrors the live TaskDetail
// shape so a contract change is caught at typecheck. The board endpoint is
// live in this build; this fixture serves dev smoke until the backend is up.
// All content is fictional team work, no patient data anywhere near the board
// by design.
import type { BoardAssignableUser, BoardTaskDetail } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-14T08:10:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

// The assignable users the picker offers, also surfaced in the detail payload
// so the owner select renders before the standalone users query resolves.
const USERS: BoardAssignableUser[] = [
  { key: 'mehran', name: 'Mehran Ali', zpuid: '2599674000000111001' },
  { key: 'noman', name: 'Mohammad Noman', zpuid: '2599674000000111002' },
  { key: 'afaf', name: 'Afaf Dhahi', zpuid: '2599674000000111003' },
  { key: 'aziz', name: 'Aziz Mansoor', zpuid: '2599674000000111004' },
]

// A small set of detailed tasks keyed by the board card ids, so clicking any
// card in the fixture board opens a coherent panel. Any other id resolves to a
// lean honest task built from the id.
const TASKS: Record<string, BoardTaskDetail> = {
  '900100': {
    id: '900100',
    name: 'Doctor portal photo upload',
    description:
      'Let providers upload a profile photo from the portal settings page. Crop to a square, store the original, serve a resized version on the public profile.',
    status: 'Backlog',
    status_type: 'open',
    priority: 'Medium',
    owner: 'Mehran Ali',
    owner_zpuid: '2599674000000111001',
    due_display: null,
    created_display: 'Jun 2',
    modified_display: 'Jun 9',
    url: 'https://projects.zoho.com/portal/saleem#taskdetail/900100',
    comments: [
      { author: 'Afaf Dhahi', content: 'Design has the crop control ready in Figma.', time_display: 'Jun 8' },
      { author: 'Mehran Ali', content: 'Picked this up, starting on the upload endpoint.', time_display: 'Jun 9' },
    ],
    assignable_users: USERS,
    priority_editable: true,
  },
  '900101': {
    id: '900101',
    name: 'Safari date picker fix',
    description:
      'The booking date picker shows the wrong month on Safari when the device locale uses a non-Gregorian calendar. Reproduces on iOS 17 Safari only.',
    status: 'Open',
    status_type: 'open',
    priority: 'High',
    owner: 'Mehran Ali',
    owner_zpuid: '2599674000000111001',
    due_display: 'Jun 20',
    created_display: 'Jun 5',
    modified_display: 'Jun 12',
    url: 'https://projects.zoho.com/portal/saleem#taskdetail/900101',
    comments: [
      { author: 'Mohammad Noman', content: 'Confirmed on a borrowed iPhone. Filing the upstream note too.', time_display: 'Jun 11' },
    ],
    assignable_users: USERS,
    priority_editable: true,
  },
  '900103': {
    id: '900103',
    name: 'Payout rules editor',
    description:
      'Build the editable payout rules table on the financials view. Service charge plus commission per rule, with a campaign override that takes priority.',
    status: 'In Progress',
    status_type: 'open',
    priority: 'Medium',
    owner: 'Mohammad Noman',
    owner_zpuid: '2599674000000111002',
    due_display: 'Jun 18',
    created_display: 'Jun 4',
    modified_display: 'Jun 13',
    url: 'https://projects.zoho.com/portal/saleem#taskdetail/900103',
    comments: [],
    assignable_users: USERS,
    priority_editable: true,
  },
}

function lean(id: string): BoardTaskDetail {
  return {
    id,
    name: 'Sample board task',
    description: 'No description set on this task yet.',
    status: 'Open',
    status_type: 'open',
    priority: null,
    owner: null,
    owner_zpuid: null,
    due_display: null,
    created_display: 'Jun 10',
    modified_display: 'Jun 10',
    url: null,
    comments: [],
    assignable_users: USERS,
    priority_editable: true,
  }
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const id = String(params?.id ?? '900100')
  const data: BoardTaskDetail = TASKS[id] ?? lean(id)
  return { data, meta: meta() }
}

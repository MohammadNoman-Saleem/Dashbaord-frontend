// Zoho Projects board constants, verified live against portal 908222337 on
// 2026-06-14 via scripts/discover-zoho-board.mjs. Ported VERBATIM from the
// NestJS backend src/board/zoho-projects.config.ts (pure constants, no DI).
//
// CRITICAL: every Zoho id stays a STRING. The ids exceed
// Number.MAX_SAFE_INTEGER, so a bare number literal silently rounds to the
// nearest representable double and the wrong record gets addressed.
//
// The board groups every project in the portal under three top-level tabs:
// Cross-Dept (the Saleem Cross-Department project), IT (the Saleem IT and
// Product project), and Other (every other project). Within a tab the viewer
// picks a tasklist of that project; the board service lists tasklists live, so
// no tasklist id is pinned here beyond the two writes need (the IT helpdesk
// General list and the Cross-Department Ops list).

export interface BoardProject {
  id: string;
  name: string;
}

export const IT_PROJECT: BoardProject = {
  id: '2599674000000342004',
  name: 'Saleem IT and Product',
};

export const CROSS_PROJECT: BoardProject = {
  id: '2599674000000344008',
  name: 'Saleem Cross-Department',
};

// Top-level board tabs. 'cross' and 'it' map to one fixed project each;
// 'other' is a virtual tab that fans out to every project that is neither
// the cross nor the IT project, discovered live at read time. The tab is the
// grouping; the second level (tasklist) and the columns (statuses) are
// resolved per request.
export const TAB_KEYS = ['cross', 'it', 'other'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export interface BoardTab {
  key: TabKey;
  label: string;
}

export const BOARD_TABS: BoardTab[] = [
  { key: 'cross', label: 'Cross-Dept' },
  { key: 'it', label: 'IT' },
  { key: 'other', label: 'Other' },
];

// The two fixed projects never appear under the Other tab; everything else
// the portal returns does.
export const FIXED_PROJECT_IDS = new Set<string>([
  IT_PROJECT.id,
  CROSS_PROJECT.id,
]);

// Cross-Department Ops tasklist. Discovered live 2026-06-14: the name carries
// a trailing space ("Ops "), so Ops items are filed by ID, never by name.
// Ops-type "Raise" submissions land here as a Zoho task alongside a Postgres
// blocker (the dual write in BlockersController).
export const CROSS_OPS_TASKLIST = {
  id: '2599674000000344088',
  name: 'Ops',
};

// Column semantics ported from the legacy ProjectsBoard widget: the active
// set renders first in this order ("To be Tested" matches Zoho's actual
// casing, lowercase 'be'; "Backlog" shows up in the IT project even though
// the original spec lacked it; "In Review" was dropped 2026-05-05 as a
// duplicate of "To be Tested"). Any other status discovered in the data is
// appended after the active set so nothing drops off the board silently,
// then the less-active set closes the board.
export const ACTIVE_STATUSES = [
  'Backlog',
  'Open',
  'In Progress',
  'To be Tested',
];

export const LESS_ACTIVE_STATUSES = [
  'On Hold',
  'Delayed',
  'Closed',
  'Cancelled',
];

// IT helpdesk SLA, ported verbatim: response is how long IT has to
// acknowledge, resolution sets the Zoho task due date.
export const IT_HELPDESK_SLA: Record<
  string,
  { response_hours: number; resolution_hours: number; label: string }
> = {
  critical: { response_hours: 1, resolution_hours: 4, label: 'Critical' },
  high: { response_hours: 4, resolution_hours: 24, label: 'High' },
  medium: { response_hours: 24, resolution_hours: 72, label: 'Medium' },
  low: { response_hours: 48, resolution_hours: 168, label: 'Low' },
};

export const IT_HELPDESK_PRIORITIES = Object.keys(IT_HELPDESK_SLA);

// Zoho Projects accepts only None/Low/Medium/High; there is no Critical.
// Critical maps to High and the urgency is encoded in the description.
export const IT_HELPDESK_PRIORITY_MAP: Record<string, string> = {
  critical: 'High',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// Owner routing by priority, ported verbatim. Names resolve to Zoho zpuids
// at runtime: users table zoho_zpuid first (explicit id wins, never
// name-match Zoho when an explicit id exists), then a live Zoho Projects
// /users/ lookup. Unresolved names are skipped, never invented.
export const IT_HELPDESK_ASSIGNMENTS: Record<string, string[]> = {
  critical: ['Mehran', 'Noman', 'Blal'],
  high: ['Mehran'],
  medium: ['Noman'],
  low: ['Noman'],
};

// IT tickets land in the General tasklist of the IT project. The discovery
// run found two "General" lists in that project; this is the legacy-pinned
// id the board has used since 2026-04-29.
export const IT_HELPDESK_DEFAULT_TASKLIST = {
  id: '2599674000000344003',
  name: 'General',
};

// IT helpdesk tasklists per category, ported from the legacy
// config/zoho-projects.js (IT_SUPPORT_TASKLIST_IDS_DEFAULTS). A ticket routes to
// the tasklist for its category; General is the default and shares the pinned
// default-tasklist id above.
export const IT_HELPDESK_TASKLISTS: Record<string, { id: string; name: string }> = {
  Bugs: { id: '2599674000000343002', name: 'Bugs' },
  Features: { id: '2599674000000378007', name: 'Features' },
  Access: { id: '2599674000000378011', name: 'Access' },
  Integrations: { id: '2599674000000378009', name: 'Integrations' },
  General: IT_HELPDESK_DEFAULT_TASKLIST,
};

export const IT_HELPDESK_CATEGORIES = Object.keys(IT_HELPDESK_TASKLISTS);

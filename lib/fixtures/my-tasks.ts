// Fixture for GET /api/tasks/mine. The signed-in person's own open Zoho
// Projects tasks for the p-my-tasks home panel. Reads only; changes go through
// the board or the assistant. Rows carry the task and project ids so a row can
// deep link to the board and open the task detail panel. Serves dev smoke until
// the live route is up; the real list is resolved from the session server-side.
import type { MyTasksData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

// Fixture project ids mirror the two tracked Zoho projects so a deep link lands
// on the right board tab in dev smoke.
const IT_PROJECT = '2599674000000342004'
const CROSS_PROJECT = '2599674000000344008'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  rows: [
    {
      id: 'task-fx-1',
      project_id: IT_PROJECT,
      tab: 'it',
      title: 'Doctor portal photo upload',
      due_display: 'Jun 9',
      due_state: 'overdue',
      overdue_days: 2,
      priority: 'High',
      status: 'In progress',
    },
    {
      id: 'task-fx-2',
      project_id: CROSS_PROJECT,
      tab: 'cross',
      title: 'Confirm June travel corridor pricing',
      due_display: 'Jun 11',
      due_state: 'today',
      overdue_days: 0,
      priority: 'Medium',
      status: 'Open',
    },
    {
      id: 'task-fx-3',
      project_id: IT_PROJECT,
      tab: 'it',
      title: 'Payout rules editor',
      due_display: 'Jun 18',
      due_state: 'upcoming',
      overdue_days: 0,
      priority: 'Low',
      status: 'In progress',
    },
    {
      id: 'task-fx-4',
      project_id: CROSS_PROJECT,
      tab: 'cross',
      title: 'Draft partner onboarding checklist',
      due_display: 'No due date',
      due_state: 'none',
      overdue_days: 0,
      priority: null,
      status: 'Open',
    },
  ],
  overdue_count: 1,
  due_today_count: 1,
  total: 4,
} satisfies MyTasksData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

// Fixture for GET /api/deliverables?month=
// Values from the approved mockup, KPIs view, "June objectives" list
// (seven rows; the home mini panel shows four of these).

import type { DeliverableRow } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const META = {
  updated_at: '2026-06-11T07:42:00+03:00',
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

const MONTH = '2026-06'

const ROWS = [
  {
    id: 'd-01',
    title: 'June investor update sent',
    owner_keys: ['isa'],
    month: MONTH,
    status: 'done',
    progress_note: 'Done Jun 5, logged in Visible.',
    measured_auto: false,
    due_date: '2026-06-30',
    updated_at: '2026-06-05T16:20:00+03:00',
  },
  {
    id: 'd-02',
    title: '20 cumulative completed cases',
    owner_keys: ['fatima'],
    month: MONTH,
    status: 'on_track',
    progress_note: '14 so far, measured automatically.',
    measured_auto: true,
    due_date: '2026-06-30',
    updated_at: '2026-06-11T06:10:00+03:00',
  },
  {
    id: 'd-03',
    title: 'Payout rules editor live',
    owner_keys: ['noman'],
    month: MONTH,
    status: 'on_track',
    progress_note: 'On staging, ships with the Jun 18 release.',
    measured_auto: true,
    due_date: '2026-06-18',
    updated_at: '2026-06-10T15:05:00+03:00',
  },
  {
    id: 'd-04',
    title: 'Website rebuild: 5 core pages ready',
    owner_keys: ['mehran'],
    month: MONTH,
    status: 'on_track',
    progress_note: '3 of 5 pages through review.',
    measured_auto: false,
    due_date: '2026-06-30',
    updated_at: '2026-06-09T13:40:00+03:00',
  },
  {
    id: 'd-05',
    title: 'First B2B2C employer signed',
    owner_keys: ['khalid', 'afaf'],
    month: MONTH,
    status: 'in_progress',
    progress_note: '2 prospects in Agreement stage.',
    measured_auto: false,
    due_date: '2026-06-30',
    updated_at: '2026-06-10T11:25:00+03:00',
  },
  {
    id: 'd-06',
    title: 'Novo funnel definition fixed',
    owner_keys: ['noman'],
    month: MONTH,
    status: 'in_review',
    progress_note: 'In review, due Jun 12.',
    measured_auto: false,
    due_date: '2026-06-12',
    updated_at: '2026-06-10T17:50:00+03:00',
  },
  {
    id: 'd-07',
    title: 'Novo renewal proposal drafted',
    owner_keys: ['khalid'],
    month: MONTH,
    status: 'needs_start',
    progress_note: 'Not started, 20 days left in June.',
    measured_auto: false,
    due_date: '2026-06-30',
    updated_at: '2026-06-06T19:48:00+03:00',
  },
] satisfies DeliverableRow[]

export function fixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  // June 2026 is the only month seeded; any other month value falls back to it.
  void params
  return { data: ROWS, meta: META }
}

// Fixture for GET /api/cockpit/parked?person=. Rows from the V4 mockup parked
// table (lines 810-817). Not Qualified is a parking lot, not a grave: a revival
// nudge chip is warn when a date is set and mut "None" when there is nothing
// scheduled. All patient data is FICTIONAL and rows carry refs and initials
// only, never a full name.
import type { CockpitParkedData, CockpitParkedRow } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-14T08:10:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const ROWS = [
  {
    lead_ref: { zoho_id: 'L07', initials: 'K.B.' },
    parked_date: 'May 30',
    reason: 'No response after the final check',
    revival_nudge: { label: 'Jun 14', tone: 'warn' },
  },
  {
    lead_ref: { zoho_id: 'L11', initials: 'T.R.' },
    parked_date: 'Jun 2',
    reason: 'Declined the quote, may revisit after Eid',
    revival_nudge: { label: 'Jun 28', tone: 'warn' },
  },
  {
    lead_ref: { zoho_id: 'L04', initials: 'W.N.' },
    parked_date: 'Jun 4',
    reason: 'Budget below the case minimum',
    revival_nudge: null,
  },
  {
    lead_ref: { zoho_id: 'L23', initials: 'J.D.' },
    parked_date: 'Jun 8',
    reason: 'Chose another provider',
    revival_nudge: null,
  },
] satisfies CockpitParkedRow[]

export function fixture(): Envelope<unknown> {
  const data = { rows: ROWS } satisfies CockpitParkedData
  return { data, meta: meta() }
}

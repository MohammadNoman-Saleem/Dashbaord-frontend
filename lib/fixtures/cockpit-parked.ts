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
    lead_ref: { zoho_id: '7064208000011119016', initials: 'K.B.', ref: 'L07', ref_is_fallback: false },
    parked_date: 'May 30',
    reason: 'No response after the final check',
    revival_nudge: { label: 'Jun 14', tone: 'warn' },
  },
  {
    lead_ref: { zoho_id: '7064208000011119024', initials: 'T.R.', ref: 'L11', ref_is_fallback: false },
    parked_date: 'Jun 2',
    reason: 'Declined the quote, may revisit after Eid',
    revival_nudge: { label: 'Jun 28', tone: 'warn' },
  },
  {
    lead_ref: { zoho_id: '7064208000011119031', initials: 'W.N.', ref: 'L04', ref_is_fallback: false },
    parked_date: 'Jun 4',
    reason: 'Budget below the case minimum',
    revival_nudge: null,
  },
  {
    lead_ref: { zoho_id: '7064208000011119048', initials: 'J.D.', ref: 'L23', ref_is_fallback: false },
    parked_date: 'Jun 8',
    reason: 'Chose another provider',
    revival_nudge: null,
  },
] satisfies CockpitParkedRow[]

export function fixture(): Envelope<unknown> {
  const data = {
    rows: ROWS,
    page: 1,
    pages: 1,
    total: ROWS.length,
  } satisfies CockpitParkedData
  return { data, meta: meta() }
}

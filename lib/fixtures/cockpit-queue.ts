// Fixture for GET /api/cockpit/queue?person=. Values lifted from the V4 mockup
// cockpit section (lines 719-840): the four KPI tiles and the eight active
// queue rows L26..L29, plus the parked count. All patient data is FICTIONAL and
// the queue carries refs and initials only, never a full name, mirroring the
// mockup queue and the server rule (cockpit-sla-spec.md). The due chip tone
// maps the kind per the spec: due_now warn, due_today and soon info, on_track
// good.
import type { CockpitQueueData, CockpitQueueItem } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-14T08:10:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const ACTIVE = [
  {
    lead_ref: { zoho_id: 'L26', initials: 'A.H.' },
    step: 'first_contact',
    next_action: 'First contact: call the intro, Arabic first',
    route: 'Bahrain -> Czech Republic',
    condition: 'Disc surgery',
    due: { label: 'Due now', tone: 'warn', kind: 'due_now' },
    sla_key: 'first_contact',
    approx: true,
  },
  {
    lead_ref: { zoho_id: 'L19', initials: 'M.S.' },
    step: 'info_collected',
    next_action: 'Collecting info: ask for the MRI disc',
    route: 'Oman -> India',
    condition: 'Pediatric neurosurgery',
    due: { label: 'Due now', tone: 'warn', kind: 'due_now' },
    sla_key: 'reports_window',
    approx: true,
  },
  {
    lead_ref: { zoho_id: 'L01', initials: 'S.A.' },
    step: 'quotation',
    next_action: 'Quotation follow-up: 24h check-in on Q-2031',
    route: 'Saudi Arabia -> India',
    condition: 'Stroke',
    due: { label: 'In 18h', tone: 'info', kind: 'due_today' },
    sla_key: 'post_quote_followup',
    approx: true,
  },
  {
    lead_ref: { zoho_id: 'L22', initials: 'R.K.' },
    step: 'partner_quotes',
    next_action: 'Partner chase: Apollo quote request, day 2 of 3',
    route: 'Saudi Arabia -> India',
    condition: 'Stroke rehab',
    due: { label: 'Tomorrow', tone: 'info', kind: 'soon' },
    sla_key: 'provider_quote_followup',
    approx: true,
  },
  {
    lead_ref: { zoho_id: 'L20', initials: 'H.A.' },
    step: 'info_collected',
    next_action: 'Post-intro follow-up: the 48h touch',
    route: 'Bahrain -> Jordan',
    condition: 'Autoimmune disease',
    due: { label: 'Tomorrow', tone: 'info', kind: 'soon' },
    sla_key: 'post_intro_followup',
    approx: false,
  },
  {
    lead_ref: { zoho_id: 'L13', initials: 'N.F.' },
    step: 'decision',
    next_action: 'Decision window: final response check',
    route: 'Bahrain -> Flexible',
    condition: 'Breast reduction',
    due: { label: 'Jun 13', tone: 'info', kind: 'soon' },
    sla_key: 'final_response',
    approx: true,
  },
  {
    lead_ref: { zoho_id: 'L24', initials: 'D.M.' },
    step: 'decision',
    next_action: 'Last check-in, then park if quiet',
    route: 'Saudi Arabia -> No preference',
    condition: 'Dental implants',
    due: { label: 'Jun 13', tone: 'mut', kind: 'soon' },
    sla_key: 'not_qualified',
    approx: true,
  },
  {
    lead_ref: { zoho_id: 'L29', initials: 'F.Q.' },
    step: 'info_collected',
    next_action: 'Reports window: day 4 of 10, nothing to do yet',
    route: 'Saudi Arabia -> Czech Republic',
    condition: 'Multiple sclerosis',
    due: { label: 'On track', tone: 'good', kind: 'on_track' },
    sla_key: 'reports_window',
    approx: true,
  },
] satisfies CockpitQueueItem[]

const TILES = {
  due_now: { count: 2, note: 'Oldest has waited 4 hours' },
  due_today: { count: 5, note: 'All five have drafted messages ready' },
  waiting_partners: { count: 3, note: 'Oldest is day 2 of the 3-day promise' },
  parked: { count: 10, note: '2 revival nudges scheduled this week' },
} satisfies CockpitQueueData['tiles']

export function fixture(): Envelope<unknown> {
  const data = { tiles: TILES, active: ACTIVE, parked_count: 10 } satisfies CockpitQueueData
  return { data, meta: meta() }
}

// Fixture for GET /api/pipeline/priorities?person=fatima. Rows from the
// approved mockup's cases view (top 12 of 31), counts from the honest-count
// footer. All patient data is FICTIONAL, lifted from the mockup.
//
// Privacy: the default variant carries the patient reference only. Full
// fictional names appear only when params.viewer simulates a Fatima or Razan
// session, mirroring the server rule (03 section 3). Unnamed lead rows never
// carry a name in any variant.
import type { PrioritiesData, PriorityRow } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const ROWS = [
  {
    patient_ref: { zoho_id: 'T-031', initials: 'A' },
    why_now: { label: 'New lead', warn: false },
    pipeline: 'Treatment, spine',
    waiting_display: '1h 40m',
    next_step: 'Send the intro on WhatsApp, Arabic first',
    source: 'Meta ad',
  },
  {
    patient_ref: { zoho_id: '0427', initials: 'G' },
    why_now: { label: 'New lead', warn: false },
    pipeline: 'Novo track',
    waiting_display: '50m',
    next_step: 'Confirm slot with Dr. Kareem',
    source: 'Novo landing',
  },
  {
    patient_ref: { zoho_id: '0430', initials: 'B' },
    why_now: { label: 'New lead', warn: false },
    pipeline: 'Telemedicine',
    waiting_display: '3h 10m',
    next_step: 'Call back, asked for Arabic',
    source: 'Website',
  },
  {
    patient_ref: { zoho_id: '0421', initials: '0421' },
    why_now: { label: 'New lead', warn: false },
    pipeline: 'Telemedicine',
    waiting_display: '2h 20m',
    next_step: 'Reply with dermatology fee range',
    source: 'Instagram',
  },
  {
    patient_ref: { zoho_id: '0418', initials: '0418' },
    why_now: { label: 'New lead', warn: false },
    pipeline: 'Treatment, cardiac',
    waiting_display: '5h',
    next_step: 'Qualify budget, ask for reports',
    source: 'Referral',
  },
  {
    patient_ref: { zoho_id: 'T-030', initials: 'C' },
    why_now: { label: 'Quiet 4 days', warn: true },
    pipeline: 'Treatment quote',
    waiting_display: '4d',
    next_step: 'Nudge with revised quote',
    source: 'Meta ad',
  },
  {
    patient_ref: { zoho_id: 'C-204', initials: 'D' },
    why_now: { label: 'Quiet 3 days', warn: true },
    pipeline: 'Consult payment',
    waiting_display: '3d',
    next_step: 'Payment link reminder, expires tonight',
    source: 'WhatsApp',
  },
  {
    patient_ref: { zoho_id: 'T-029', initials: 'H' },
    why_now: { label: 'Quiet 3 days', warn: true },
    pipeline: 'Treatment payment',
    waiting_display: '3d',
    next_step: 'Gentle deposit reminder',
    source: 'Referral',
  },
  {
    patient_ref: { zoho_id: '0395', initials: '0395' },
    why_now: { label: 'Quiet 6 days', warn: true },
    pipeline: 'New deal',
    waiting_display: '6d',
    next_step: 'Final check-in, then set aside',
    source: 'Google',
  },
  {
    patient_ref: { zoho_id: 'T-028', initials: 'E' },
    why_now: { label: 'Check-in due', warn: false },
    pipeline: 'Treatment done Jun 7',
    waiting_display: 'Today',
    next_step: '72-hour call, after 4 PM',
    source: '·',
  },
  {
    patient_ref: { zoho_id: 'C-201', initials: 'F' },
    why_now: { label: 'Follow-up', warn: false },
    pipeline: 'Consult Jun 9',
    waiting_display: 'Today',
    next_step: 'Send summary and next steps',
    source: 'WhatsApp',
  },
  {
    patient_ref: { zoho_id: 'T-027', initials: 'J' },
    why_now: { label: '30-day review', warn: false },
    pipeline: 'Treatment done May 11',
    waiting_display: 'Today',
    next_step: 'Book the outcome call',
    source: '·',
  },
] satisfies PriorityRow[]

// Fictional names, keyed by Zoho reference. Lead rows (no name on record)
// are intentionally absent from this map.
const FICTIONAL_NAMES: Record<string, string> = {
  'T-031': 'Amal Janahi',
  '0427': 'Ghada Salman',
  '0430': 'Badria Hubail',
  'T-030': 'Camelia Nasser',
  'C-204': 'Dana Mahmood',
  'T-029': 'Huda Khalifa',
  'T-028': 'Eman Alawi',
  'C-201': 'Farah Yousif',
  'T-027': 'Jumana Taqi',
}

const COUNTS = { shown: 12, queued: 19, dormant: 9 } satisfies PrioritiesData['counts']

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const viewer = String(params?.viewer ?? '')
  const withNames = viewer === 'fatima' || viewer === 'razan'

  const rows: PriorityRow[] = withNames
    ? ROWS.map((row) => {
        const name = FICTIONAL_NAMES[row.patient_ref.zoho_id]
        return name ? { ...row, patient_name: name } : row
      })
    : ROWS

  const data = { rows, counts: COUNTS } satisfies PrioritiesData
  return { data, meta: meta() }
}

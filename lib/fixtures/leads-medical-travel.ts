// Fixture for GET /api/leads/medical-travel. The June campaign window from
// the V3 mockup's medical travel leads card: 30 Zoho leads against 32 in
// Meta, 3 converted, the Jun 8 CPL split, and the 11 action rows. All data
// is fictional; lead references only, never names (07 section 3).
import type { MedicalTravelLeadsData, MtlActionRow } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const ACTION_ROWS = [
  { ref: 'L01', from: 'Saudi Arabia', destination: 'India', treatment: 'Stroke', status: 'converted', deal_stage: 'Quote Proposed', zoho_lead_id: 'zl_2401' },
  { ref: 'L22', from: 'Saudi Arabia', destination: 'India', treatment: 'Stroke rehab', status: 'converted', deal_stage: 'Quote Proposed', zoho_lead_id: 'zl_2422' },
  { ref: 'L13', from: 'Bahrain', destination: 'Flexible', treatment: 'Breast reduction', status: 'converted', deal_stage: 'Quote Proposed', zoho_lead_id: 'zl_2413' },
  { ref: 'L19', from: 'Oman', destination: 'India', treatment: 'Pediatric neurosurgery', status: 'waiting', deal_stage: null, zoho_lead_id: 'zl_2419' },
  { ref: 'L20', from: 'Bahrain', destination: 'Jordan', treatment: 'Autoimmune disease', status: 'waiting', deal_stage: null, zoho_lead_id: 'zl_2420' },
  { ref: 'L24', from: 'Saudi Arabia', destination: 'No preference', treatment: 'Dental implants', status: 'waiting', deal_stage: null, zoho_lead_id: 'zl_2424' },
  { ref: 'L26', from: 'Bahrain', destination: 'Czech Republic', treatment: 'Disc surgery, spine', status: 'new', deal_stage: null, zoho_lead_id: 'zl_2426' },
  { ref: 'L27', from: 'Bahrain', destination: 'Slovakia', treatment: 'Neuro-rehabilitation', status: 'new', deal_stage: null, zoho_lead_id: 'zl_2427' },
  { ref: 'L28', from: 'Saudi Arabia', destination: 'India', treatment: 'Joint problems', status: 'new', deal_stage: null, zoho_lead_id: 'zl_2428' },
  { ref: 'L29', from: 'Saudi Arabia', destination: 'Czech Republic', treatment: 'Multiple sclerosis', status: 'new', deal_stage: null, zoho_lead_id: 'zl_2429' },
  { ref: 'L30', from: 'Qatar', destination: 'Thailand', treatment: 'Eye treatment', status: 'new', deal_stage: null, zoho_lead_id: 'zl_2430' },
] satisfies MtlActionRow[]

const DATA = {
  period: { from: '2026-06-01', to: '2026-06-11', partial_day: true, campaign_day: 11 },
  totals: {
    zoho_leads: 30,
    meta_leads: 32,
    outside_bahrain_pct: 47,
    gcc_countries: 5,
    converted: 3,
  },
  cpl: {
    basis: 'meta_reported',
    blended_usd: 2.89,
    blended_bhd: 1.09,
    first_week_usd: 2.48,
    since_usd: 4.14,
    split_date: '2026-06-08',
    delta_pct: 67,
    fatigue: true,
  },
  spend: { usd: 92.57, bhd: 34.9 },
  daily: [
    { date: '2026-06-01', leads: 6, spend_usd: 9.1 },
    { date: '2026-06-02', leads: 5, spend_usd: 8.4 },
    { date: '2026-06-03', leads: 4, spend_usd: 8.2 },
    { date: '2026-06-04', leads: 1, spend_usd: 7.9 },
    { date: '2026-06-05', leads: 2, spend_usd: 8.1 },
    { date: '2026-06-06', leads: 2, spend_usd: 8.3 },
    { date: '2026-06-07', leads: 2, spend_usd: 8.6 },
    { date: '2026-06-08', leads: 1, spend_usd: 8.5 },
    { date: '2026-06-09', leads: 2, spend_usd: 8.7 },
    { date: '2026-06-10', leads: 2, spend_usd: 8.9 },
    { date: '2026-06-11', leads: 3, spend_usd: 7.87 },
  ],
  origins: [
    { country: 'Bahrain', n: 16, inferred_n: 15 },
    { country: 'Saudi Arabia', n: 10, inferred_n: 9 },
    { country: 'Oman', n: 2, inferred_n: 2 },
    { country: 'Kuwait', n: 1, inferred_n: 1 },
    { country: 'Qatar', n: 1, inferred_n: 1 },
  ],
  destinations: [
    { group: 'India', n: 8, corridor_status: 'proposal' },
    { group: 'Germany', n: 4, corridor_status: 'not_contacted' },
    { group: 'Turkey', n: 3, corridor_status: 'live' },
    { group: 'Egypt', n: 3, corridor_status: 'not_contacted' },
    { group: 'Eastern Europe', n: 3, corridor_status: 'not_contacted' },
    { group: 'Other', n: 9, corridor_status: 'not_contacted' },
  ],
  specialties: [
    { group: 'neuro_spine_rehab', n: 12 },
    { group: 'orthopedics', n: 3 },
    { group: 'gastro', n: 2 },
    { group: 'cosmetic', n: 2 },
    { group: 'womens_health', n: 2 },
    { group: 'other', n: 9 },
  ],
  statuses: { converted: 3, intro_done: 9, waiting: 3, new: 5, not_qualified: 10 },
  action_rows: ACTION_ROWS,
  reads: [
    {
      key: 'creative_fatigue',
      title: 'Refresh the creative this week',
      body: 'Cost per lead is up 67% since Jun 8, the same day-11 fatigue May showed. A new cut protects the BHD 1.09 blend.',
    },
    {
      key: 'corridor_gap',
      title: 'Close the India corridor',
      body: '8 of 30 want India, including both converted strokes. Apollo is at Proposal; that signature converts the biggest demand block.',
    },
    {
      key: 'warm_leads',
      title: 'Work the 9 warm intro-call leads',
      body: 'Qualified and warm. Converting the viable ones this week is the cheapest revenue in the funnel.',
    },
  ],
  reconciliation: { meta: 32, zoho: 30, gap: 2, gap_age_hours: 30 },
} satisfies MedicalTravelLeadsData

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

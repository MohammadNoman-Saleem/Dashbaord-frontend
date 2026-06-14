// Fixtures for the /api/payouts/* endpoints.
//
// These endpoints are now live (config/endpoints.ts), so these fixtures are
// not served at runtime; they remain as the typed reference and so the
// fixture index keeps compiling. Shapes mirror the live commission model:
// gross (what the patient pays) and Saleem revenue (service charge plus
// commission) are two SEPARATE figures, never summed. Free-to-patient ledger
// rows use covers_bhd, never a negative share.
//
// Convention exception (stated in the task): this file exports three
// functions, one per payouts read endpoint, instead of the single `fixture`.

import type {
  PayoutsBookingsData,
  PayoutsRulesData,
  PayoutsSummaryData,
} from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const META = {
  updated_at: '2026-06-11T07:42:00+03:00',
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

// /api/payouts/summary
const SUMMARY = {
  cycle: '2026-06',
  gross_bhd: 4180,
  saleem_revenue_bhd: 1570,
  provider_payouts_bhd: 2610,
  booking_count: 6,
  commission_unset_count: 1,
  cycle_close_note: 'Cycle closes at month end',
} satisfies PayoutsSummaryData

// /api/payouts/bookings
const BOOKINGS = {
  rows: [
    {
      id: 'B-2848',
      provider: 'Dr. R. Almannai',
      patient_ref: { zoho_id: 'P-2848', initials: 'A.K.' },
      product: 'standard',
      gross_bhd: 26,
      saleem_revenue_bhd: 9.6,
      provider_payout_bhd: 21.4,
      rule_label: 'Scheduled appointment',
      manual: false,
    },
    {
      // Free to patient: Saleem covers the doctor fee. covers_bhd, no minus.
      id: 'manual_demo_1',
      provider: 'Dr. Aysha A.',
      patient_ref: { zoho_id: 'manual_demo_1', initials: '·' },
      product: 'Screening campaign',
      gross_bhd: 0,
      saleem_revenue_bhd: 0,
      covers_bhd: 8,
      provider_payout_bhd: 0,
      rule_label: 'Free to patient',
      manual: true,
    },
    {
      id: 'B-2842',
      provider: 'Dr. S. Kareem',
      patient_ref: { zoho_id: 'P-2842', initials: 'M.S.' },
      product: 'novo_scheduled',
      gross_bhd: 5,
      saleem_revenue_bhd: 3,
      provider_payout_bhd: 2,
      rule_label: 'Novo appointment',
      manual: false,
    },
  ],
} satisfies PayoutsBookingsData

// /api/payouts/rules. First matching rule wins, top to bottom.
const RULES = {
  rules: [
    {
      id: 1,
      priority: 10,
      rule_type: 'percent',
      label: 'Scheduled appointment',
      params_display:
        'Service charge BHD 5 plus commission from the doctor, then the hospital',
      params: { service_charge_bhd: 5, commission_pct: 0 },
      editable_keys: ['service_charge_bhd', 'commission_pct'],
      updated_by: null,
      updated_at: '2026-06-11T07:42:00+03:00',
      can_edit: false,
    },
    {
      id: 2,
      priority: 20,
      rule_type: 'fixed_fee',
      label: 'Novo appointment',
      params_display: 'Flat commission BHD 3, no service charge',
      params: { service_charge_bhd: 0, commission_bhd: 3 },
      editable_keys: ['service_charge_bhd', 'commission_bhd'],
      updated_by: null,
      updated_at: '2026-06-11T07:42:00+03:00',
      can_edit: false,
    },
  ],
} satisfies PayoutsRulesData

export function summaryFixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  void params
  return { data: SUMMARY, meta: META }
}

export function bookingsFixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  void params
  return { data: BOOKINGS, meta: META }
}

export function rulesFixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  void params
  return { data: RULES, meta: META }
}

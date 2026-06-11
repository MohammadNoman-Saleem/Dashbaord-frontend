// Fixtures for the /api/payouts/* endpoints.
// Values from the approved mockup, Payouts view: the four tiles, the
// "Recent bookings, split out" ledger, and the "How the split is decided"
// rules cascade.
//
// Convention exception (stated in the task): this file exports three
// functions, one per payouts endpoint, instead of the single `fixture`.
// Free-to-patient ledger rows use covers_bhd, never a negative share.

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
  patients_paid_bhd: 4180,
  provider_payouts_bhd: 2610,
  cycle_close_note: 'Cycle closes Jun 15',
  saleem_revenue_bhd: 1570,
  needs_review_count: 1,
} satisfies PayoutsSummaryData

// /api/payouts/bookings
const BOOKINGS = {
  rows: [
    {
      id: 'B-2848',
      provider: 'Dr. R. Almannai',
      product: 'Scheduled, cardiology',
      patient_paid_bhd: 26.0,
      provider_payout_bhd: 21.4,
      saleem_share_bhd: 4.6,
      rule_label: 'Service charge',
      manual: false,
    },
    {
      // Free to patient: Saleem covers the doctor fee. covers_bhd, no minus.
      id: 'B-2846',
      provider: 'Dr. Aysha A.',
      product: 'Screening campaign',
      patient_paid_bhd: 0.0,
      provider_payout_bhd: 8.0,
      covers_bhd: 8.0,
      rule_label: 'Free to patient',
      manual: false,
    },
    {
      id: 'B-2845',
      provider: 'Dr. Layla H.',
      product: 'Scheduled, dermatology',
      patient_paid_bhd: 21.0,
      provider_payout_bhd: 17.5,
      saleem_share_bhd: 3.5,
      rule_label: 'Service charge',
      manual: false,
    },
    {
      id: 'B-2842',
      provider: 'Dr. S. Kareem',
      product: 'Novo track',
      patient_paid_bhd: 5.0,
      provider_payout_bhd: 3.0,
      saleem_share_bhd: 2.0,
      rule_label: 'Campaign price',
      manual: false,
    },
    {
      id: 'B-2841',
      provider: 'Dr. Aysha A.',
      product: 'Consult Now',
      patient_paid_bhd: 9.9,
      provider_payout_bhd: 6.9,
      saleem_share_bhd: 3.0,
      rule_label: 'Fixed fee',
      manual: false,
    },
    {
      // Treatment is negotiated per case and entered by hand.
      id: 'T-019',
      provider: 'Partner hospital',
      product: 'Treatment, spine',
      patient_paid_bhd: 4900,
      provider_payout_bhd: 4165,
      saleem_share_bhd: 735,
      rule_label: 'Manual entry',
      manual: true,
    },
  ],
} satisfies PayoutsBookingsData

// /api/payouts/rules. First matching rule wins, top to bottom.
const RULES = {
  rules: [
    {
      id: 1,
      priority: 1,
      rule_type: 'campaign',
      label: 'Campaign price',
      params_display:
        'Novo track: patient pays BHD 5.0, doctor gets 3.0, Saleem keeps 2.0.',
    },
    {
      id: 2,
      priority: 1,
      rule_type: 'campaign',
      label: 'Campaign price',
      params_display:
        'Screening week: free to the patient, doctor paid BHD 8.0 by Saleem.',
    },
    {
      id: 3,
      priority: 2,
      rule_type: 'fixed_fee',
      label: 'Fixed fee',
      params_display: 'Consult Now: BHD 9.9 flat, doctor 6.9, Saleem 3.0.',
    },
    {
      id: 4,
      priority: 3,
      rule_type: 'percent',
      label: 'Percentage',
      params_display:
        'Scheduled default: doctor sets the fee, Saleem adds its service charge.',
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

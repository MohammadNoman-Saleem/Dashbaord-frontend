// Fixture for GET /api/funnels/direct?variant=full|instant.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Funnels view, Direct Appointment tab, DIRECT dataset). All data is fictional.
//
// The full variant uses the 6-step canonical booking funnel naming. The mockup
// showed 5 steps; the Consult Booking Form Viewed count (985) is interpolated
// between the mockup's Doctor chosen (1212) and Details filled (736) steps.
// The verified-paid-step sentence ("The paid step is checked against the admin
// panel, not just measured.") is static UI copy driven by paid_verified.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FunnelDirectData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:18:00+03:00'

// Side card copy, shared by both variants in the mockup.
const READINGS = {
  biggest_drop:
    'The big drop comes right after the consult page. 69% leave before clicking the start CTA. Profile clarity is the lever.',
  healthy_step: 'Payment completion is healthy. 2 of 3 who start a payment finish it.',
  owner: 'Noman reports on this every second Friday with a fix per drop.',
}

const FULL = {
  variant: 'full',
  steps: [
    { label: 'Consult page viewed', count: 3940, pct_of_first: 100 },
    { label: 'Start CTA clicked', count: 1212, pct_of_first: 30.8 },
    { label: 'Consult Booking Form Viewed', count: 985, pct_of_first: 25 },
    { label: 'Summary step viewed', count: 736, pct_of_first: 18.7 },
    { label: 'Payment initiated', count: 402, pct_of_first: 10.2 },
    { label: 'Payment success', count: 268, pct_of_first: 6.8 },
  ],
  end_to_end_pct: 6.8,
  paid_verified: true,
  readings: READINGS,
} satisfies FunnelDirectData

const INSTANT = {
  variant: 'instant',
  steps: [
    { label: 'Consult page', count: 2180, pct_of_first: 100 },
    { label: 'Doctor matched', count: 690, pct_of_first: 31.7 },
    { label: 'Details filled', count: 415, pct_of_first: 19 },
    { label: 'Payment started', count: 240, pct_of_first: 11 },
    { label: 'Paid', count: 171, pct_of_first: 7.8 },
  ],
  end_to_end_pct: 7.8,
  paid_verified: true,
  readings: READINGS,
} satisfies FunnelDirectData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const data = params?.variant === 'instant' ? INSTANT : FULL
  return { data, meta: META }
}

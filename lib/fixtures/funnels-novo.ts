// Fixture for GET /api/funnels/novo.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Funnels view, Novo tab). All data is fictional.
//
// meta.reliable is false while the funnel definition mismatch stands; the UI
// renders the Optimism Banner and dims the funnel from this flag alone.
// BMI categories show percentages in the mockup (33, 31, 22, 14). The contract
// carries counts, so they are converted against the 311 completed checks
// (103 + 96 + 68 + 44 = 311).

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FunnelNovoData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:18:00+03:00'

const NOVO = {
  tiles: {
    landing_views: { value: 4120, chip: 'measured' },
    funnel_says_paid: { value: 0, chip: 'misreading' },
    real_consults: { value: 86, chip: 'verified' },
    bmi_checks: { value: 311 },
  },
  novo_funnels: [
    {
      key: 'novo_a_instant',
      label: 'Novo A, instant',
      end_to_end_pct: 0,
      steps: [
        { label: 'Landing', count: 1180, pct_of_first: 100 },
        { label: 'Path chosen', count: 41, pct_of_first: 3.5 },
        { label: 'Booked', count: 2, pct_of_first: 0.2 },
        { label: 'Paid', count: 0, pct_of_first: 0 },
      ],
    },
    {
      key: 'novo_a_scheduled',
      label: 'Novo A, scheduled',
      end_to_end_pct: 0,
      steps: [
        { label: 'Landing', count: 940, pct_of_first: 100 },
        { label: 'Path chosen', count: 18, pct_of_first: 1.9 },
        { label: 'Booked', count: 1, pct_of_first: 0.1 },
        { label: 'Paid', count: 0, pct_of_first: 0 },
      ],
    },
    {
      key: 'novo_b_instant',
      label: 'Novo B, instant',
      end_to_end_pct: 0,
      steps: [
        { label: 'Landing', count: 1320, pct_of_first: 100 },
        { label: 'Path chosen', count: 9, pct_of_first: 0.7 },
        { label: 'Booked', count: 0, pct_of_first: 0 },
        { label: 'Paid', count: 0, pct_of_first: 0 },
      ],
    },
    {
      key: 'novo_b_scheduled',
      label: 'Novo B, scheduled',
      end_to_end_pct: 0,
      steps: [
        { label: 'Landing', count: 680, pct_of_first: 100 },
        { label: 'Path chosen', count: 3, pct_of_first: 0.4 },
        { label: 'Booked', count: 0, pct_of_first: 0 },
        { label: 'Paid', count: 0, pct_of_first: 0 },
      ],
    },
  ],
  direct_benchmarks: [
    {
      key: 'direct_instant',
      label: 'Direct instant',
      end_to_end_pct: 4.1,
      steps: [
        { label: 'Consult page', count: 820, pct_of_first: 100 },
        { label: 'Start CTA', count: 210, pct_of_first: 25.6 },
        { label: 'Payment initiated', count: 60, pct_of_first: 7.3 },
        { label: 'Payment success', count: 34, pct_of_first: 4.1 },
      ],
    },
    {
      key: 'direct_scheduled',
      label: 'Direct scheduled',
      end_to_end_pct: 5.2,
      steps: [
        { label: 'Consult page', count: 540, pct_of_first: 100 },
        { label: 'Start CTA', count: 150, pct_of_first: 27.8 },
        { label: 'Payment initiated', count: 41, pct_of_first: 7.6 },
        { label: 'Payment success', count: 28, pct_of_first: 5.2 },
      ],
    },
  ],
  ctas_by_type: [
    { label: 'Book now', count: 312 },
    { label: 'WhatsApp us', count: 188 },
    { label: 'Learn more', count: 95 },
    { label: 'BMI check', count: 0, not_instrumented: true },
  ],
  bmi_categories: [
    { label: '30 to 35', count: 103 },
    { label: '25 to 30', count: 96 },
    { label: '35 and up', count: 68 },
    { label: 'Under 25', count: 44 },
  ],
  landing_by_campaign: [
    { label: 'novo-email', views: 1720 },
    { label: 'meta-obesity', views: 1260 },
    { label: 'direct / none', views: 660 },
    { label: 'qr-clinic', views: 480 },
  ],
} satisfies FunnelNovoData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: false,
  reasons: [
    {
      key: 'definition_mismatch',
      title: 'These funnel numbers do not match reality',
      text: 'The landing page took 4,120 visits this month, but the funnel below reads near zero because its definition is wrong. The fix is in review, and the verified consult count is the number to trust.',
      owner: 'Noman',
      due: '2026-06-12',
    },
  ],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: NOVO, meta: META }
}

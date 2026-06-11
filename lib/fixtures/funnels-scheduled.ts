// Fixture for GET /api/funnels/scheduled.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Funnels view, Scheduled tab). All data is fictional.
//
// Step percentages match the mockup labels (47, 17, 7.6, 4.8). The footer
// sentence about slot picking and the 4.8% end-to-end figure are UI copy;
// the end-to-end value equals the last step's pct_of_first.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FunnelScheduledData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:18:00+03:00'

const SCHEDULED = {
  steps: [
    { label: 'Doctors list', count: 5210, pct_of_first: 100 },
    { label: 'Profile opened', count: 2460, pct_of_first: 47 },
    { label: 'Slot picked', count: 880, pct_of_first: 17 },
    { label: 'Payment started', count: 395, pct_of_first: 7.6 },
    { label: 'Confirmed', count: 251, pct_of_first: 4.8 },
  ],
  confirmed_by_specialty: [
    { label: 'Dermatology', count: 64 },
    { label: 'Endocrinology', count: 55 },
    { label: 'Family medicine', count: 45 },
    { label: 'Mental health', count: 33 },
    { label: 'Other', count: 54 },
  ],
} satisfies FunnelScheduledData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: SCHEDULED, meta: META }
}

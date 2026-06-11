// Fixture for GET /api/funnels/general.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Funnels view, General tab). All data is fictional.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FunnelGeneralData } from '@/lib/api/contract'

// The mockup header reads "Updated 24 min ago" against a 7:42 AM session.
const UPDATED_AT = '2026-06-11T07:18:00+03:00'

// Daily series follows the mockup spark shape: a rising zigzag that peaks on
// the final day (Sunday 1,180 after the WhatsApp send). The 14 values sum to
// the 12,480 site-visits tile.
const GENERAL = {
  tiles: {
    site_visits: 12480,
    consult_page_views: 3940,
    booking_starts: 642,
    dead_clicks: 318,
  },
  visits_14d: [620, 560, 740, 690, 840, 790, 920, 860, 1010, 950, 1080, 1150, 1090, 1180],
  top_pages: [
    { label: '/consult', views: 3940 },
    { label: 'Doctors list', views: 3080 },
    { label: 'Novo landing', views: 2360 },
    { label: 'Doctor profiles', views: 2140 },
    { label: 'Medical travel', views: 1290 },
  ],
} satisfies FunnelGeneralData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: GENERAL, meta: META }
}

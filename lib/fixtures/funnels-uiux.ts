// Fixture for GET /api/funnels/uiux.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Funnels view, UI/UX tab). All data is fictional.
//
// The mockup table also carries a Where column (Doctors list, Booking step 2,
// Site footer, Novo page). The contract has no field for it, so the location
// is folded into the component label where it is not already implied.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FunnelUiuxData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:18:00+03:00'

const UIUX = {
  dead_clicks: [
    { component: '"Read more" on doctor cards', count: 96, call: 'Fix queued' },
    { component: 'Date picker on Safari, booking step 2', count: 71, call: 'Fix queued' },
    { component: 'Footer partner logos', count: 38, call: 'Leave' },
    { component: 'Hero image, Novo landing', count: 26, call: 'Watch' },
  ],
  frustration: [
    {
      signal: '"Pay" button during gateway timeouts',
      detail: '22 rage clicks, clustered Sunday evening. Add a clear waiting state.',
    },
    {
      signal: 'Everything else is quiet',
      detail: 'No new frustration hotspots this fortnight.',
    },
  ],
} satisfies FunnelUiuxData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: UIUX, meta: META }
}

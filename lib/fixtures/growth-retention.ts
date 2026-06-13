// Fixture for GET /api/growth/retention.
// Behaviour retention matrices (Mixpanel weekly cohorts), lead-to-booking
// conversion by source, and repeat-booking month cohorts. All data is
// fictional. Cohort labels are weeks or months and sources are channel
// names; identity never appears in this payload.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { GrowthRetentionData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:18:00+03:00'

const RETENTION = {
  behaviour: {
    born_event: 'Consult Page Viewed',
    return_event: 'Consult Payment Success',
    columns: ['Day 0', 'Day 7', 'Day 14', 'Day 21', 'Day 28'],
    visits: [
      { date: '2026-04-20', size: 412, cells: [100, 18, 11, 8, 6] },
      { date: '2026-04-27', size: 388, cells: [100, 21, 13, 9, 7] },
      { date: '2026-05-04', size: 451, cells: [100, 19, 12, 8, 6] },
      { date: '2026-05-11', size: 472, cells: [100, 22, 14, 10, null] },
      { date: '2026-05-18', size: 506, cells: [100, 20, 12, null, null] },
      { date: '2026-05-25', size: 489, cells: [100, 23, null, null, null] },
      { date: '2026-06-01', size: 534, cells: [100, null, null, null, null] },
      { date: '2026-06-08', size: 261, cells: [100, null, null, null, null] },
    ],
    bookings: [
      { date: '2026-04-20', size: 412, cells: [4, 2, 1, 1, 0] },
      { date: '2026-04-27', size: 388, cells: [5, 2, 1, 1, 1] },
      { date: '2026-05-04', size: 451, cells: [4, 3, 1, 1, 0] },
      { date: '2026-05-11', size: 472, cells: [5, 2, 2, 1, null] },
      { date: '2026-05-18', size: 506, cells: [6, 3, 1, null, null] },
      { date: '2026-05-25', size: 489, cells: [5, 2, null, null, null] },
      { date: '2026-06-01', size: 534, cells: [6, null, null, null, null] },
      { date: '2026-06-08', size: 261, cells: [5, null, null, null, null] },
    ],
  },
  lead_to_booking: {
    by_source: [
      { source: 'Instagram', leads: 412, booked: 58, conversion_pct: 14.1, median_days: 4 },
      { source: 'Google Ads', leads: 286, booked: 49, conversion_pct: 17.1, median_days: 3 },
      { source: 'Unknown', leads: 244, booked: 18, conversion_pct: 7.4, median_days: 9 },
      { source: 'WhatsApp', leads: 158, booked: 34, conversion_pct: 21.5, median_days: 2 },
      { source: 'Referral', leads: 96, booked: 21, conversion_pct: 21.9, median_days: 5 },
    ],
    overall: { leads: 1196, booked: 180, conversion_pct: 15.1, median_days: 4 },
    leads_total: 1418,
    leads_with_email: 1196,
    definition:
      'Email join, one lead per unique email (earliest record, its source attributed). A lead converts when a ' +
      'paid booking (Status "Done", Rate > 1 BHD) exists on/after lead creation (24h grace for the ' +
      'booking-creates-lead ordering). Direct bookers who never became leads are not counted.',
  },
  booking_cohorts: {
    cohorts: [
      { key: '2025-10', label: 'Oct 2025', size: 38, repeat_1m_pct: 11, repeat_2m_pct: 16, repeat_3m_pct: 21, repeat_revenue: 1240, first_revenue: 1980 },
      { key: '2025-11', label: 'Nov 2025', size: 42, repeat_1m_pct: 12, repeat_2m_pct: 17, repeat_3m_pct: 24, repeat_revenue: 1410, first_revenue: 2230 },
      { key: '2025-12', label: 'Dec 2025', size: 35, repeat_1m_pct: 9, repeat_2m_pct: 14, repeat_3m_pct: 20, repeat_revenue: 980, first_revenue: 1820 },
      { key: '2026-01', label: 'Jan 2026', size: 51, repeat_1m_pct: 14, repeat_2m_pct: 20, repeat_3m_pct: 25, repeat_revenue: 1760, first_revenue: 2640 },
      { key: '2026-02', label: 'Feb 2026', size: 47, repeat_1m_pct: 13, repeat_2m_pct: 19, repeat_3m_pct: 23, repeat_revenue: 1520, first_revenue: 2410 },
      { key: '2026-03', label: 'Mar 2026', size: 56, repeat_1m_pct: 16, repeat_2m_pct: 21, repeat_3m_pct: null, repeat_revenue: 1680, first_revenue: 2890 },
      { key: '2026-04', label: 'Apr 2026', size: 61, repeat_1m_pct: 15, repeat_2m_pct: null, repeat_3m_pct: null, repeat_revenue: 1120, first_revenue: 3140 },
      { key: '2026-05', label: 'May 2026', size: 66, repeat_1m_pct: null, repeat_2m_pct: null, repeat_3m_pct: null, repeat_revenue: 410, first_revenue: 3390 },
      { key: '2026-06', label: 'Jun 2026', size: 24, repeat_1m_pct: null, repeat_2m_pct: null, repeat_3m_pct: null, repeat_revenue: 0, first_revenue: 1260 },
    ],
    identified_patients: 487,
    definition:
      'Cohort = month of first paid booking (Status "Done", Rate > 1 BHD) per unique patient (Patient lookup id). ' +
      'Repeat % = share of the cohort booking again within N calendar months of their first booking. ' +
      'Repeat revenue = all paid bookings after the first, attributed to the cohort.',
  },
} satisfies GrowthRetentionData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: RETENTION, meta: META }
}

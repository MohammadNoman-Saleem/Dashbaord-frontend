// Fixture for GET /api/social/ga4.
// The Social view is the legacy /social page ported (not in the v3 mockup,
// flagged for Khalid per the parking-list rule), so these values are
// invented in the shape the legacy GA4 route served. All data is fictional.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { SocialGa4Data } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const GA4 = {
  period: '28d',
  kpi: {
    sessions: 4180,
    users: 3120,
    new_users: 2410,
    pageviews: 11260,
    bounce_rate: 41,
    avg_session_duration: 142,
    sessions_change: 12,
    users_change: 9,
    pageviews_change: 15,
    bounce_change: -3,
  },
  sessions_over_time: [
    { date: '20260601', sessions: 130, users: 98 },
    { date: '20260602', sessions: 142, users: 104 },
    { date: '20260603', sessions: 151, users: 110 },
    { date: '20260604', sessions: 139, users: 101 },
    { date: '20260605', sessions: 160, users: 118 },
    { date: '20260606', sessions: 171, users: 126 },
    { date: '20260607', sessions: 158, users: 115 },
  ],
  by_channel: [
    { channel: 'Organic Search', sessions: 1620, users: 1240 },
    { channel: 'Direct', sessions: 1080, users: 820 },
    { channel: 'Paid Social', sessions: 760, users: 590 },
    { channel: 'Organic Social', sessions: 430, users: 310 },
    { channel: 'Referral', sessions: 290, users: 160 },
  ],
  by_device: [
    { device: 'mobile', sessions: 2920 },
    { device: 'desktop', sessions: 1090 },
    { device: 'tablet', sessions: 170 },
  ],
  top_pages: [
    { path: '/', title: 'Saleem', sessions: 1480, pageviews: 2210, avg_duration: 96 },
    { path: '/consult', title: 'Talk to a doctor', sessions: 920, pageviews: 1660, avg_duration: 188 },
    { path: '/novo', title: 'Novo program', sessions: 610, pageviews: 1020, avg_duration: 154 },
    { path: '/doctors', title: 'Our doctors', sessions: 410, pageviews: 760, avg_duration: 121 },
    { path: '/pricing', title: 'Pricing', sessions: 280, pageviews: 430, avg_duration: 88 },
  ],
} satisfies SocialGa4Data

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const period = String(params?.period ?? '28d')
  const data =
    period === '7d' || period === '90d' || period === 'mtd'
      ? { ...GA4, period: period as SocialGa4Data['period'] }
      : GA4
  return { data, meta: META }
}

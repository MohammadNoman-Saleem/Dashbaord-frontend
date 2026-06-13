// Fixture for GET /api/growth/engagement.
// DAU/MAU, top events, and traffic for the Funnels General tab. All data is
// fictional; the shapes mirror the legacy /api/mixpanel overview, top-events
// and traffic routes ported into saleem-api.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { GrowthEngagementData, GrowthTrendPoint } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:18:00+03:00'

// A gently rising 30-day daily-uniques series ending at the DAU tile value.
const DAU_SERIES = [
  84, 78, 92, 88, 96, 90, 104, 98, 92, 108, 102, 116, 110, 104, 122, 114, 126,
  118, 132, 124, 118, 138, 130, 144, 136, 128, 150, 142, 156, 148,
]

const TREND: GrowthTrendPoint[] = DAU_SERIES.map((dau, i) => {
  const slice = DAU_SERIES.slice(Math.max(0, i - 6), i + 1)
  const day = new Date('2026-05-12T00:00:00Z')
  day.setUTCDate(day.getUTCDate() + i)
  return {
    date: day.toISOString().slice(0, 10),
    dau,
    rolling_avg: Math.round(slice.reduce((s, v) => s + v, 0) / slice.length),
  }
})

const ENGAGEMENT = {
  active_users: {
    dau: 148,
    mau: 2860,
    stickiness_pct: 5.2,
    event: 'Consult Page Viewed',
    trend_30d: TREND,
  },
  top_events: [
    { name: 'Consult Page Viewed', count_7d: 940, count_30d: 3940, trend_pct: 12 },
    { name: 'Index Page Viewed', count_7d: 720, count_30d: 3080, trend_pct: 6 },
    { name: 'Viewed Doctor Profile', count_7d: 510, count_30d: 2140, trend_pct: -4 },
    { name: 'Consult Start CTA Clicked', count_7d: 160, count_30d: 642, trend_pct: 9 },
    { name: 'Novo Landing Page Viewed', count_7d: 540, count_30d: 2360, trend_pct: null },
    { name: 'Consult Payment Success', count_7d: 38, count_30d: 151, trend_pct: 15 },
  ],
  traffic: {
    window_days: 30,
    homepage_views: 3080,
    consult_views: 3940,
    trend_homepage_pct: 6.4,
    trend_consult_pct: 11.8,
    device_split: { mobile: 2140, desktop: 820, other: 120 },
  },
} satisfies GrowthEngagementData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: ENGAGEMENT, meta: META }
}

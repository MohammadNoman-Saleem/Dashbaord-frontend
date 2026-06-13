// Fixture for GET /api/social/platforms.
// Mirrors the live shape: LinkedIn and Zoho Social serve numbers while
// TikTok shows the expired-token state and Instagram the not-configured
// state, so the page exercises both the data and the honest-null
// treatments. All data is fictional.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { SocialPlatformsData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const PLATFORMS = {
  linkedin: {
    followers: 1840,
    page_views_30d: 620,
    posts: [
      {
        id: 'urn:li:share:1',
        published_at: '2026-06-08T09:00:00Z',
        text: 'Meet the doctors behind Saleem telemedicine.',
        impressions: 2140,
        likes: 36,
        comments: 5,
        shares: 4,
        clicks: 58,
      },
      {
        id: 'urn:li:share:2',
        published_at: '2026-06-04T11:30:00Z',
        text: 'How medical travel works with a licensed coordinator.',
        impressions: 1730,
        likes: 28,
        comments: 3,
        shares: 6,
        clicks: 41,
      },
    ],
  },
  tiktok: null,
  instagram: null,
  zoho_social: {
    engagement_rate: 2.84,
    total_reach: 48200,
    total_interactions: 1310,
    posts: [
      {
        id: '9001',
        platform: 'Instagram',
        content_preview: 'Three questions to ask before booking a procedure',
        reach: 5200,
        likes: 142,
        comments: 18,
        shares: 9,
        published_at: '2026-06-09T08:00:00Z',
      },
      {
        id: '9002',
        platform: 'Facebook',
        content_preview: 'Clinic spotlight: cardiology partners',
        reach: 3900,
        likes: 96,
        comments: 11,
        shares: 14,
        published_at: '2026-06-06T10:00:00Z',
      },
    ],
  },
} satisfies SocialPlatformsData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [
    {
      key: 'tiktok_token_expired',
      title: 'The TikTok connection expired',
      text: 'The TikTok token in the shared store is expired. Reconnect TikTok from the old dashboard, which owns the OAuth flow; this view picks the new token up automatically.',
      owner: 'afaf',
    },
    {
      key: 'instagram_not_configured',
      title: 'Instagram is not connected',
      text: 'META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID are not set on saleem-api, so Instagram reads null.',
    },
  ],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: PLATFORMS, meta: META }
}

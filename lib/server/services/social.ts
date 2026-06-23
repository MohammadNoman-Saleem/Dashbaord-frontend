// Social view data: GA4 website analytics plus the four social platform
// reads (LinkedIn, TikTok, Instagram, Zoho Social). Ported from the NestJS
// backend src/social/social.service.ts. The @Injectable SocialService with
// constructor DI (ENV, CacheService, Ga4Client, LinkedinClient, TiktokClient,
// InstagramClient, ZohoAuthService, ZohoClient) becomes a globalThis-pinned
// singleton (g.__socialRead) reading the foundation accessors getEnv(),
// getCache(), getGa4Client(), getLinkedinClient(), getTiktokClient(),
// getInstagramClient(), getZohoAuth(), getZohoClient(). Logic and DTOs are
// kept VERBATIM.
//
// Honesty rules carried in meta:
//   - A platform with no working source serves null plus an authored
//     reason, never an invented number. Expired tokens are an expected
//     state with their own reasons; TikTok's names the OLD dashboard as
//     the place to reconnect (the OAuth flows were deliberately not
//     ported here).
//   - Only successful upstream snapshots enter the cache, so a transient
//     failure never pins a null for a full TTL.
//
// No patient data appears anywhere in this payload (website analytics and
// public social metrics only).
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getEnv, type Env } from '../env';
import { getCache, type CacheService } from '../cache';
import type { ReasonDto, SourceMeta } from '../envelope';
import {
  getGa4Client,
  type Ga4Client,
  type Ga4Report,
  type Ga4Row,
} from '../integrations/ga4';
import { getZohoAuth, type ZohoAuthService } from '../integrations/zoho/auth';
import { getZohoClient, type ZohoClient } from '../integrations/zoho/client';
import {
  getLinkedinClient,
  LinkedinClient,
  LinkedinTokenExpiredError,
  type LinkedinSnapshot,
} from '../integrations/linkedin';
import {
  getTiktokClient,
  TiktokClient,
  TiktokTokenExpiredError,
  type TiktokSnapshot,
} from '../integrations/tiktok';
import {
  getInstagramClient,
  InstagramClient,
  InstagramTokenExpiredError,
  type InstagramSnapshot,
} from '../integrations/instagram';

// -- Payload shapes (mirrored by lib/api/contract.ts) --

export type Ga4Period = '7d' | '28d' | '90d' | 'mtd';

export interface SocialGa4Payload {
  period: Ga4Period;
  kpi: {
    sessions: number;
    users: number;
    new_users: number;
    pageviews: number;
    bounce_rate: number;
    avg_session_duration: number;
    sessions_change: number | null;
    users_change: number | null;
    pageviews_change: number | null;
    bounce_change: number | null;
  };
  sessions_over_time: Array<{ date: string; sessions: number; users: number }>;
  by_channel: Array<{ channel: string; sessions: number; users: number }>;
  by_device: Array<{ device: string; sessions: number }>;
  top_pages: Array<{
    path: string;
    title: string;
    sessions: number;
    pageviews: number;
    avg_duration: number;
  }>;
}

export interface ZohoSocialPost {
  id: string;
  platform: string;
  content_preview: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  published_at: string | null;
}

export interface ZohoSocialSnapshot {
  engagement_rate: number;
  total_reach: number;
  total_interactions: number;
  posts: ZohoSocialPost[];
}

export interface SocialPlatformsPayload {
  linkedin: LinkedinSnapshot | null;
  tiktok: TiktokSnapshot | null;
  instagram: InstagramSnapshot | null;
  zoho_social: ZohoSocialSnapshot | null;
}

interface SocialResult<T> {
  data: T;
  parts: SourceMeta[];
}

// -- Authored reasons --

const LINKEDIN_NOT_CONFIGURED: ReasonDto = {
  key: 'linkedin_not_configured',
  title: 'LinkedIn is not connected',
  text: 'LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORGANIZATION_ID is not set on saleem-api, so LinkedIn reads null. Copy them from the legacy dashboard environment.',
};

const LINKEDIN_TOKEN_EXPIRED: ReasonDto = {
  key: 'linkedin_token_expired',
  title: 'The LinkedIn token expired',
  text: 'LinkedIn tokens last 60 days and there is no refresh flow. Regenerate LINKEDIN_ACCESS_TOKEN in the LinkedIn developer portal and update the saleem-api environment.',
  owner: 'noman',
};

const TIKTOK_NOT_CONNECTED: ReasonDto = {
  key: 'tiktok_not_connected',
  title: 'TikTok is not connected',
  text: 'No TikTok token exists in the shared token store. Connect TikTok from the old dashboard, which owns the OAuth flow; this view picks the token up automatically.',
};

const TIKTOK_TOKEN_EXPIRED: ReasonDto = {
  key: 'tiktok_token_expired',
  title: 'The TikTok connection expired',
  text: 'The TikTok token in the shared store is expired. Reconnect TikTok from the old dashboard, which owns the OAuth flow; this view picks the new token up automatically.',
  owner: 'afaf',
};

const INSTAGRAM_NOT_CONFIGURED: ReasonDto = {
  key: 'instagram_not_configured',
  title: 'Instagram is not connected',
  text: 'META_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID are not set on saleem-api, so Instagram reads null.',
};

const INSTAGRAM_TOKEN_EXPIRED: ReasonDto = {
  key: 'instagram_token_expired',
  title: 'The Instagram token expired',
  text: 'The Meta Graph token for Instagram expired or was invalidated. Regenerate META_ACCESS_TOKEN in the Meta developer portal and update the saleem-api environment.',
};

const ZOHO_SOCIAL_NOT_CONFIGURED: ReasonDto = {
  key: 'zoho_social_not_configured',
  title: 'Zoho Social is not connected',
  text: 'ZOHO_SOCIAL_BRAND_ID is not set on saleem-api (or the Zoho OAuth client is missing), so Zoho Social reads null.',
};

function unavailableReason(
  platformKey: string,
  title: string,
  err: unknown,
): ReasonDto {
  const message = err instanceof Error ? err.message : String(err);
  return {
    key: `${platformKey}_unavailable`,
    title,
    text: `${title}: ${message.slice(0, 300)}`,
  };
}

function absentPart(reason: ReasonDto): SourceMeta {
  return {
    fetched_at: new Date(),
    cached: false,
    stale: false,
    reliable: true,
    reasons: [reason],
  };
}

function metricVal(row: Ga4Row | undefined, idx: number): number {
  return parseFloat(row?.metricValues?.[idx]?.value ?? '0');
}

function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export class SocialReadService {
  constructor(
    private readonly env: Env,
    private readonly cache: CacheService,
    private readonly ga4Client: Ga4Client,
    private readonly linkedin: LinkedinClient,
    private readonly tiktok: TiktokClient,
    private readonly instagram: InstagramClient,
    private readonly zohoAuth: ZohoAuthService,
    private readonly zoho: ZohoClient,
  ) {}

  // -- GA4 --

  async ga4(period: Ga4Period): Promise<SocialResult<SocialGa4Payload | null>> {
    if (!this.ga4Client.configured()) {
      return {
        data: null,
        parts: [absentPart(this.ga4Client.notConfiguredReason())],
      };
    }
    const read = await this.cache.read<SocialGa4Payload>(
      `ga4:overview:${period}`,
      'ga4',
      () => this.fetchGa4(period),
    );
    return { data: read.data, parts: [read.meta] };
  }

  /** The six legacy reports, split into two parallel batches of three
   *  (batchRunReports caps at five requests per call). */
  private async fetchGa4(period: Ga4Period): Promise<SocialGa4Payload> {
    const cur = this.periodToGa(period);
    const prev = this.prevPeriod(period);
    const kpiMetrics = [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'newUsers' },
    ];

    const [batch1, batch2] = await Promise.all([
      this.ga4Client.batchRunReports([
        { dateRanges: [cur], metrics: kpiMetrics },
        { dateRanges: [prev], metrics: kpiMetrics },
        {
          dateRanges: [cur],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
          orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
        },
      ]),
      this.ga4Client.batchRunReports([
        {
          dateRanges: [cur],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        },
        {
          dateRanges: [cur],
          dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
          metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' },
          ],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        },
        {
          dateRanges: [cur],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        },
      ]),
    ]);

    const reports: Ga4Report[] = [...batch1, ...batch2];
    const kpiRow = reports[0]?.rows?.[0];
    const prevRow = reports[1]?.rows?.[0];

    const sessions = Math.round(metricVal(kpiRow, 0));
    const users = Math.round(metricVal(kpiRow, 1));
    const pageviews = Math.round(metricVal(kpiRow, 2));
    const bounceRate = Math.round(metricVal(kpiRow, 3) * 100);
    const prevSessions = Math.round(metricVal(prevRow, 0));
    const prevUsers = Math.round(metricVal(prevRow, 1));
    const prevPageviews = Math.round(metricVal(prevRow, 2));
    const prevBounce = Math.round(metricVal(prevRow, 3) * 100);

    return {
      period,
      kpi: {
        sessions,
        users,
        new_users: Math.round(metricVal(kpiRow, 5)),
        pageviews,
        bounce_rate: bounceRate,
        avg_session_duration: Math.round(metricVal(kpiRow, 4)),
        sessions_change: pct(sessions, prevSessions),
        users_change: pct(users, prevUsers),
        pageviews_change: pct(pageviews, prevPageviews),
        bounce_change: pct(bounceRate, prevBounce),
      },
      sessions_over_time: (reports[2]?.rows ?? []).map((row) => ({
        date: row.dimensionValues?.[0]?.value ?? '',
        sessions: Math.round(metricVal(row, 0)),
        users: Math.round(metricVal(row, 1)),
      })),
      by_channel: (reports[3]?.rows ?? []).map((row) => ({
        channel: row.dimensionValues?.[0]?.value ?? 'Unknown',
        sessions: Math.round(metricVal(row, 0)),
        users: Math.round(metricVal(row, 1)),
      })),
      top_pages: (reports[4]?.rows ?? []).map((row) => ({
        path: row.dimensionValues?.[0]?.value ?? '/',
        title: row.dimensionValues?.[1]?.value ?? '',
        sessions: Math.round(metricVal(row, 0)),
        pageviews: Math.round(metricVal(row, 1)),
        avg_duration: Math.round(metricVal(row, 2)),
      })),
      by_device: (reports[5]?.rows ?? []).map((row) => ({
        device: row.dimensionValues?.[0]?.value ?? 'Unknown',
        sessions: Math.round(metricVal(row, 0)),
      })),
    };
  }

  private periodToGa(period: Ga4Period): {
    startDate: string;
    endDate: string;
  } {
    if (period === '7d') return { startDate: '7daysAgo', endDate: 'today' };
    if (period === '90d') return { startDate: '90daysAgo', endDate: 'today' };
    if (period === 'mtd') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString().slice(0, 10), endDate: 'today' };
    }
    return { startDate: '28daysAgo', endDate: 'today' };
  }

  private prevPeriod(period: Ga4Period): {
    startDate: string;
    endDate: string;
  } {
    if (period === '7d') return { startDate: '14daysAgo', endDate: '8daysAgo' };
    if (period === '90d') {
      return { startDate: '180daysAgo', endDate: '91daysAgo' };
    }
    if (period === 'mtd') {
      const now = new Date();
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysPast = Math.floor(
        (now.getTime() - mStart.getTime()) / 86_400_000,
      );
      const pmEnd = new Date(mStart.getTime() - 86_400_000);
      const pmStart = new Date(
        pmEnd.getFullYear(),
        pmEnd.getMonth(),
        pmEnd.getDate() - daysPast,
      );
      return {
        startDate: pmStart.toISOString().slice(0, 10),
        endDate: pmEnd.toISOString().slice(0, 10),
      };
    }
    return { startDate: '56daysAgo', endDate: '29daysAgo' };
  }

  // -- Platforms --

  async platforms(): Promise<SocialResult<SocialPlatformsPayload>> {
    const [linkedin, tiktok, instagram, zohoSocial] = await Promise.all([
      this.linkedinBlock(),
      this.tiktokBlock(),
      this.instagramBlock(),
      this.zohoSocialBlock(),
    ]);
    return {
      data: {
        linkedin: linkedin.block,
        tiktok: tiktok.block,
        instagram: instagram.block,
        zoho_social: zohoSocial.block,
      },
      parts: [linkedin.part, tiktok.part, instagram.part, zohoSocial.part],
    };
  }

  private async linkedinBlock(): Promise<{
    block: LinkedinSnapshot | null;
    part: SourceMeta;
  }> {
    if (!this.linkedin.configured()) {
      return { block: null, part: absentPart(LINKEDIN_NOT_CONFIGURED) };
    }
    try {
      const read = await this.cache.read<LinkedinSnapshot>(
        'social:linkedin',
        'social',
        () => this.linkedin.snapshot(),
      );
      return { block: read.data, part: read.meta };
    } catch (err) {
      if (err instanceof LinkedinTokenExpiredError) {
        return { block: null, part: absentPart(LINKEDIN_TOKEN_EXPIRED) };
      }
      return {
        block: null,
        part: absentPart(
          unavailableReason('linkedin', 'LinkedIn did not answer', err),
        ),
      };
    }
  }

  private async tiktokBlock(): Promise<{
    block: TiktokSnapshot | null;
    part: SourceMeta;
  }> {
    try {
      const stored = await this.tiktok.storedToken();
      if (!stored) {
        return { block: null, part: absentPart(TIKTOK_NOT_CONNECTED) };
      }
      if (stored.expires_at && new Date(stored.expires_at) <= new Date()) {
        return { block: null, part: absentPart(TIKTOK_TOKEN_EXPIRED) };
      }
      const read = await this.cache.read<TiktokSnapshot>(
        'social:tiktok',
        'social',
        () => this.tiktok.snapshot(stored.access_token),
      );
      return { block: read.data, part: read.meta };
    } catch (err) {
      if (err instanceof TiktokTokenExpiredError) {
        return { block: null, part: absentPart(TIKTOK_TOKEN_EXPIRED) };
      }
      return {
        block: null,
        part: absentPart(
          unavailableReason('tiktok', 'TikTok did not answer', err),
        ),
      };
    }
  }

  private async instagramBlock(): Promise<{
    block: InstagramSnapshot | null;
    part: SourceMeta;
  }> {
    if (!this.instagram.configured()) {
      return { block: null, part: absentPart(INSTAGRAM_NOT_CONFIGURED) };
    }
    try {
      const read = await this.cache.read<InstagramSnapshot>(
        'social:instagram',
        'social',
        () => this.instagram.snapshot(),
      );
      return { block: read.data, part: read.meta };
    } catch (err) {
      if (err instanceof InstagramTokenExpiredError) {
        return { block: null, part: absentPart(INSTAGRAM_TOKEN_EXPIRED) };
      }
      return {
        block: null,
        part: absentPart(
          unavailableReason('instagram', 'Instagram did not answer', err),
        ),
      };
    }
  }

  private async zohoSocialBlock(): Promise<{
    block: ZohoSocialSnapshot | null;
    part: SourceMeta;
  }> {
    if (!this.env.ZOHO_SOCIAL_BRAND_ID || !this.zohoAuth.configured()) {
      return { block: null, part: absentPart(ZOHO_SOCIAL_NOT_CONFIGURED) };
    }
    try {
      const read = await this.cache.read<ZohoSocialSnapshot>(
        'social:zoho_social',
        'social',
        () => this.fetchZohoSocial(),
      );
      return { block: read.data, part: read.meta };
    } catch (err) {
      // Most likely cause today: the saleem-api OAuth client was minted
      // without the ZohoSocial scope the legacy dashboard token carries.
      return {
        block: null,
        part: absentPart(
          unavailableReason(
            'zoho_social',
            'Zoho Social did not answer (the saleem-api OAuth client may be missing the ZohoSocial scope)',
            err,
          ),
        ),
      };
    }
  }

  /** Published posts for the brand; the engagement summary is computed the
   *  same way the legacy /api/zoho/social/engagement route did (per-post
   *  rates averaged, two decimals). */
  private async fetchZohoSocial(): Promise<ZohoSocialSnapshot> {
    const brandId = this.env.ZOHO_SOCIAL_BRAND_ID as string;
    const data = await this.zoho.get<Record<string, unknown>>(
      `https://social.zoho.com/social/v1/brands/${brandId}/posts/published`,
      { limit: '50' },
    );
    const raw = (data.posts ?? data.data ?? []) as Array<
      Record<string, unknown>
    >;
    const num = (v: unknown): number => Number(v) || 0;
    // Only primitives become strings; an unexpected object shape coerces to ''
    // rather than '[object Object]'.
    const str = (v: unknown): string =>
      typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    const interactionsOf = (p: Record<string, unknown>): number =>
      (num(p.likes) || num(p.like_count)) +
      (num(p.comments) || num(p.comment_count)) +
      (num(p.shares) || num(p.share_count));

    const posts: ZohoSocialPost[] = raw.map((p) => ({
      id: str(p.post_id ?? p.id),
      platform: str(p.network ?? p.platform) || 'Unknown',
      content_preview: str(p.message ?? p.content).slice(0, 80),
      reach: num(p.reach),
      likes: num(p.likes) || num(p.like_count),
      comments: num(p.comments) || num(p.comment_count),
      shares: num(p.shares) || num(p.share_count),
      published_at: str(p.published_time ?? p.created_time) || null,
    }));

    const totalReach = raw.reduce((sum, p) => sum + num(p.reach), 0);
    const totalInteractions = raw.reduce(
      (sum, p) => sum + interactionsOf(p),
      0,
    );
    let engagementRate = 0;
    if (raw.length > 0 && totalReach > 0) {
      const rates = raw.map((p) => {
        const reach = num(p.reach);
        return reach > 0 ? (interactionsOf(p) / reach) * 100 : 0;
      });
      engagementRate =
        Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) /
        100;
    }

    return {
      engagement_rate: engagementRate,
      total_reach: totalReach,
      total_interactions: totalInteractions,
      posts,
    };
  }
}

// globalThis-pinned singleton: shares the one cache, GA4 client, platform
// clients, and Zoho read client/auth so warm token caches and the L1 cache are
// reused across every social-facing route (ga4 and platforms).
const SOCIAL_READ_KEY = '__socialRead';

type GlobalWithSocialRead = typeof globalThis & {
  [SOCIAL_READ_KEY]?: SocialReadService;
};

export function getSocialRead(): SocialReadService {
  const g = globalThis as GlobalWithSocialRead;
  if (!g[SOCIAL_READ_KEY]) {
    g[SOCIAL_READ_KEY] = new SocialReadService(
      getEnv(),
      getCache(),
      getGa4Client(),
      getLinkedinClient(),
      getTiktokClient(),
      getInstagramClient(),
      getZohoAuth(),
      getZohoClient(),
    );
  }
  return g[SOCIAL_READ_KEY];
}

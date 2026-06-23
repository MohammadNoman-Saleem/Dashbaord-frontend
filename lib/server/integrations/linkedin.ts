// LinkedIn organization read client, ported from the NestJS backend
// src/social/linkedin.client.ts (itself a port of the legacy
// lib/linkedin/client.js and app/api/social/linkedin/route.js). Read paths
// only: follower statistics, page statistics, recent posts and their share
// statistics. The legacy route's Supabase side writes are NOT ported; the
// cache_entries table does the persistence job and token expiry surfaces as
// an authored reason instead of an urgent item.
//
// LinkedIn API quirks preserved from the legacy client:
//   1. The List() multi-value syntax must not be URL-encoded by
//      URLSearchParams (it double-encodes the parentheses), so those calls
//      append a raw query string.
//   2. Tokens last 60 days and there is no refresh flow; a 401 throws the
//      typed expiry error so the service can author the right reason.
//
// The @Injectable class with @Inject(ENV) becomes a globalThis-pinned
// singleton (g.__linkedinClient) reading env via getEnv(). Logic verbatim.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getEnv, type Env } from '../env';

const LINKEDIN_BASE = 'https://api.linkedin.com/v2';

const COMMON_HEADERS = {
  'LinkedIn-Version': '202401',
  'X-Restli-Protocol-Version': '2.0.0',
};

export class LinkedinTokenExpiredError extends Error {
  constructor() {
    super('LinkedIn answered 401: the access token expired.');
  }
}

export interface LinkedinPost {
  id: string;
  published_at: string | null;
  text: string;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

export interface LinkedinSnapshot {
  followers: number;
  page_views_30d: number;
  posts: LinkedinPost[];
}

interface FollowerCounts {
  organicFollowerCount?: number | string;
  paidFollowerCount?: number | string;
}

interface FollowerStatsElement {
  followerCountsByStaffCountRange?: Array<{ followerCounts?: FollowerCounts }>;
  followerCountByAssociationType?: Array<{ followerCounts?: FollowerCounts }>;
}

interface PageStatsElement {
  totalPageStatistics?: {
    views?: { allPageViews?: { pageViews?: number | string } };
  };
}

interface UgcPost {
  id?: string;
  firstPublishedAt?: number;
  created?: { time?: number };
  specificContent?: Record<
    string,
    { shareCommentary?: { text?: string } } | undefined
  >;
}

interface ShareStatsElement {
  totalShareStatistics?: {
    impressionCount?: number | string;
    likeCount?: number | string;
    commentCount?: number | string;
    shareCount?: number | string;
    clickCount?: number | string;
  };
}

function safeInt(v: unknown): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

export class LinkedinClient {
  constructor(private readonly env: Env) {}

  configured(): boolean {
    return Boolean(
      this.env.LINKEDIN_ACCESS_TOKEN && this.env.LINKEDIN_ORGANIZATION_ID,
    );
  }

  /** Followers, 30 day page views, and the 10 most recent posts with their
   *  engagement. One snapshot per cache TTL; the per-post statistics loop
   *  is why this is never called on a hot path. */
  async snapshot(): Promise<LinkedinSnapshot> {
    const urn = this.orgUrn();
    const encodedUrn = encodeURIComponent(urn);

    const followerData = await this.get<{ elements?: FollowerStatsElement[] }>(
      'organizationalEntityFollowerStatistics',
      { q: 'organizationalEntity', organizationalEntity: urn },
    );
    const followers = this.extractFollowers(followerData.elements?.[0]);

    const pageData = await this.get<{ elements?: PageStatsElement[] }>(
      'organizationPageStatistics',
      { q: 'organization', organization: urn },
    );
    const pageViews30d = safeInt(
      pageData.elements?.[0]?.totalPageStatistics?.views?.allPageViews
        ?.pageViews,
    );

    const postsData = await this.getRaw<{ elements?: UgcPost[] }>(
      'ugcPosts',
      `q=authors&authors=List(${encodedUrn})&count=10`,
    );

    const posts: LinkedinPost[] = [];
    for (const post of postsData.elements ?? []) {
      const postId = post.id ?? '';
      let stats: ShareStatsElement | undefined;
      try {
        const statsData = await this.getRaw<{
          elements?: ShareStatsElement[];
        }>(
          'organizationalEntityShareStatistics',
          `q=organizationalEntity&organizationalEntity=${encodedUrn}&ugcPosts=List(${encodeURIComponent(postId)})`,
        );
        stats = statsData.elements?.[0];
      } catch {
        // An individual post's statistics failing is non-fatal.
      }
      const totals = stats?.totalShareStatistics ?? {};
      const publishedMs = post.firstPublishedAt ?? post.created?.time ?? null;
      posts.push({
        id: postId,
        published_at: publishedMs ? new Date(publishedMs).toISOString() : null,
        text: this.extractPostText(post),
        impressions: safeInt(totals.impressionCount),
        likes: safeInt(totals.likeCount),
        comments: safeInt(totals.commentCount),
        shares: safeInt(totals.shareCount),
        clicks: safeInt(totals.clickCount),
      });
    }

    return { followers, page_views_30d: pageViews30d, posts };
  }

  private orgUrn(): string {
    const orgId = String(this.env.LINKEDIN_ORGANIZATION_ID);
    return orgId.startsWith('urn:') ? orgId : `urn:li:organization:${orgId}`;
  }

  private headers(): Record<string, string> {
    return {
      ...COMMON_HEADERS,
      authorization: `Bearer ${this.env.LINKEDIN_ACCESS_TOKEN}`,
    };
  }

  private async get<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${LINKEDIN_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return this.fetchJson<T>(url.toString(), path);
  }

  /** For queries carrying the List() syntax, appended raw. */
  private async getRaw<T>(path: string, rawQuery: string): Promise<T> {
    const url = `${LINKEDIN_BASE}/${path}${rawQuery ? `?${rawQuery}` : ''}`;
    return this.fetchJson<T>(url, path);
  }

  private async fetchJson<T>(url: string, path: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 401) throw new LinkedinTokenExpiredError();
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LinkedIn API ${res.status} on ${path}: ${body}`);
    }
    return (await res.json()) as T;
  }

  /** Each follower appears in exactly one bucket per dimension, so summing
   *  one dimension gives the total (legacy comment, org-verified). */
  private extractFollowers(el: FollowerStatsElement | undefined): number {
    const sum = (
      buckets: Array<{ followerCounts?: FollowerCounts }> | undefined,
    ): number =>
      (buckets ?? []).reduce(
        (acc, bucket) =>
          acc +
          safeInt(bucket.followerCounts?.organicFollowerCount) +
          safeInt(bucket.followerCounts?.paidFollowerCount),
        0,
      );
    if (el?.followerCountsByStaffCountRange?.length) {
      return sum(el.followerCountsByStaffCountRange);
    }
    return sum(el?.followerCountByAssociationType);
  }

  private extractPostText(post: UgcPost): string {
    const content =
      post.specificContent?.['com.linkedin.ugc.ShareContent'] ??
      post.specificContent?.['com.linkedin.ugc.MemberNetworkVisibility'];
    return (content?.shareCommentary?.text ?? '').slice(0, 120);
  }
}

// globalThis-pinned singleton: env is read once and the instance is reused
// across requests within one warm instance, consistent with the other
// integration clients.
const LINKEDIN_KEY = '__linkedinClient';

type GlobalWithLinkedin = typeof globalThis & {
  [LINKEDIN_KEY]?: LinkedinClient;
};

export function getLinkedinClient(): LinkedinClient {
  const g = globalThis as GlobalWithLinkedin;
  if (!g[LINKEDIN_KEY]) {
    g[LINKEDIN_KEY] = new LinkedinClient(getEnv());
  }
  return g[LINKEDIN_KEY];
}

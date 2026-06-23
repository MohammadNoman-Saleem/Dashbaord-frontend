// TikTok read client, ported from the NestJS backend src/social/tiktok.client.ts
// (itself a port of the legacy lib/tiktok/client.js and the GET half of
// app/api/social/tiktok/route.js). READ paths only by design: the OAuth
// connect, callback, and refresh flows are NOT ported. The access token lives
// in the shared social_tokens table, written by the OLD dashboard's connect
// flow; when it is missing or expired this client reports that state and the
// service authors a reason pointing back to the old dashboard to reconnect.
//
// TikTok API quirks preserved from the legacy client:
//   1. Fields ride the ?fields= query param, never the body.
//   2. video/list is a POST but its fields still go in the URL.
//   3. Error code 10005 (or access_token_invalid/expired in the message)
//      means the token is dead.
//
// The @Injectable class with @Inject(PG_POOL) becomes a globalThis-pinned
// singleton (g.__tiktokClient) reading the pool via getPool(). Logic verbatim.
//
// SERVER ONLY. Node runtime (uses pg). Never import from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

// user.info.basic + user.info.stats scopes.
const USER_FIELDS = 'display_name,follower_count,video_count,profile_image_url';
// video.list scope. reach/impressions would need video.insights, which the
// TikTok Login Kit does not expose (legacy finding).
const VIDEO_FIELDS =
  'id,title,create_time,view_count,like_count,comment_count,share_count';

export class TiktokTokenExpiredError extends Error {}

export interface TiktokStoredToken {
  access_token: string;
  expires_at: string | null;
}

export interface TiktokVideo {
  id: string;
  title: string;
  published_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface TiktokSnapshot {
  display_name: string;
  followers: number;
  video_count: number;
  videos: TiktokVideo[];
}

interface TiktokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

interface TiktokUser {
  display_name?: string;
  follower_count?: number | string;
  video_count?: number | string;
}

interface TiktokRawVideo {
  id?: number | string;
  title?: string;
  create_time?: number;
  view_count?: number | string;
  like_count?: number | string;
  comment_count?: number | string;
  share_count?: number | string;
}

function safeInt(v: unknown): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

function isExpiredMessage(message: string): boolean {
  return (
    message.includes('access_token_invalid') ||
    message.includes('access_token_expired') ||
    message.includes('10005')
  );
}

export class TiktokClient {
  constructor(private readonly pool: Pool) {}

  /** The token row the old dashboard's connect flow stored, or null. A
   *  missing social_tokens table is treated as no token: the table is owned
   *  by the old dashboard's connect flow, so its absence means TikTok was
   *  never connected, not a fault to surface as a raw Postgres error. */
  async storedToken(): Promise<TiktokStoredToken | null> {
    try {
      const { rows } = await this.pool.query<TiktokStoredToken>(
        `select access_token, expires_at from social_tokens
         where platform = 'tiktok' limit 1`,
      );
      return rows[0] ?? null;
    } catch (err) {
      // 42P01 is undefined_table; anything else is a real failure to bubble.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === '42P01'
      ) {
        return null;
      }
      throw err;
    }
  }

  async snapshot(accessToken: string): Promise<TiktokSnapshot> {
    const userRes = await this.call<{ user?: TiktokUser }>(
      'user/info/',
      USER_FIELDS,
      accessToken,
    );
    const user = userRes.data?.user ?? {};

    // Video list failure is non-fatal: account numbers still serve.
    let videos: TiktokVideo[] = [];
    try {
      const videoRes = await this.call<{ videos?: TiktokRawVideo[] }>(
        'video/list/',
        VIDEO_FIELDS,
        accessToken,
        { max_count: 20 },
      );
      videos = (videoRes.data?.videos ?? []).map((v) => ({
        id: String(v.id ?? ''),
        title: v.title ?? '',
        published_at: v.create_time
          ? new Date(v.create_time * 1000).toISOString()
          : null,
        views: safeInt(v.view_count),
        likes: safeInt(v.like_count),
        comments: safeInt(v.comment_count),
        shares: safeInt(v.share_count),
      }));
    } catch (err) {
      if (err instanceof TiktokTokenExpiredError) throw err;
    }

    return {
      display_name: user.display_name ?? '',
      followers: safeInt(user.follower_count),
      video_count: safeInt(user.video_count),
      videos,
    };
  }

  private async call<T>(
    path: string,
    fields: string,
    accessToken: string,
    body?: unknown,
  ): Promise<TiktokEnvelope<T>> {
    const url = new URL(`${TIKTOK_API_BASE}/${path}`);
    url.searchParams.set('fields', fields);
    const res = await fetch(url.toString(), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as TiktokEnvelope<T>;
    if (json.error?.code && json.error.code !== 'ok') {
      const message = `${json.error.code} ${json.error.message ?? ''}`;
      if (isExpiredMessage(message)) {
        throw new TiktokTokenExpiredError(`TikTok API error: ${message}`);
      }
      throw new Error(`TikTok API error: ${message}`);
    }
    return json;
  }
}

// globalThis-pinned singleton: shares the one pool and is reused across
// requests within one warm instance, consistent with the other integration
// clients.
const TIKTOK_KEY = '__tiktokClient';

type GlobalWithTiktok = typeof globalThis & {
  [TIKTOK_KEY]?: TiktokClient;
};

export function getTiktokClient(): TiktokClient {
  const g = globalThis as GlobalWithTiktok;
  if (!g[TIKTOK_KEY]) {
    g[TIKTOK_KEY] = new TiktokClient(getPool());
  }
  return g[TIKTOK_KEY];
}

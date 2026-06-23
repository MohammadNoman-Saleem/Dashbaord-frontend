// Instagram business account read client, ported from the NestJS backend
// src/social/instagram.client.ts (itself a port of the legacy
// lib/instagram/client.js and app/api/social/instagram/route.js). Uses the
// Meta Graph API v19.0 (kept at the legacy-verified version) with a static
// META_ACCESS_TOKEN. This token is distinct from META_SYSTEM_USER_TOKEN
// (ads spend, integrations/meta); it was deliberately not copied from the
// legacy env yet, so configured() is false today and Instagram serves null
// with the authored not-configured reason.
//
// The @Injectable class with @Inject(ENV) becomes a globalThis-pinned
// singleton (g.__instagramClient) reading env via getEnv(). Logic verbatim.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getEnv, type Env } from '../env';

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export class InstagramTokenExpiredError extends Error {}

export interface InstagramPost {
  id: string;
  published_at: string | null;
  caption: string;
  media_type: string;
  likes: number;
  comments: number;
  impressions: number | null;
  reach: number | null;
  saves: number | null;
}

export interface InstagramSnapshot {
  followers: number;
  media_count: number;
  posts: InstagramPost[];
}

interface GraphError {
  error?: { code?: number; message?: string };
}

interface AccountFields extends GraphError {
  followers_count?: number;
  media_count?: number;
}

interface MediaList extends GraphError {
  data?: Array<{
    id?: string;
    timestamp?: string;
    caption?: string;
    media_type?: string;
    like_count?: number;
    comments_count?: number;
    impressions?: number;
    reach?: number;
    saved?: number;
  }>;
}

export class InstagramClient {
  constructor(private readonly env: Env) {}

  configured(): boolean {
    return Boolean(
      this.env.META_ACCESS_TOKEN && this.env.META_INSTAGRAM_ACCOUNT_ID,
    );
  }

  async snapshot(): Promise<InstagramSnapshot> {
    const accountId = this.env.META_INSTAGRAM_ACCOUNT_ID as string;

    const account = await this.get<AccountFields>(accountId, {
      fields: 'followers_count,media_count',
    });

    // impressions, reach and saved need instagram_manage_insights approval.
    const media = await this.get<MediaList>(`${accountId}/media`, {
      fields:
        'id,timestamp,caption,media_type,like_count,comments_count,impressions,reach,saved',
      limit: '20',
    });

    return {
      followers: account.followers_count ?? 0,
      media_count: account.media_count ?? 0,
      posts: (media.data ?? []).map((m) => ({
        id: m.id ?? '',
        published_at: m.timestamp ?? null,
        caption: (m.caption ?? '').slice(0, 120),
        media_type: m.media_type ?? 'IMAGE',
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        impressions: m.impressions ?? null,
        reach: m.reach ?? null,
        saves: m.saved ?? null,
      })),
    };
  }

  private async get<T extends GraphError>(
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const qs = new URLSearchParams({
      access_token: this.env.META_ACCESS_TOKEN as string,
      ...params,
    });
    const res = await fetch(`${GRAPH_BASE}/${path}?${qs}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as T;
    if (json.error) {
      const { code, message } = json.error;
      if (code === 190) {
        throw new InstagramTokenExpiredError(
          `Instagram token expired or invalid: ${message ?? ''}`,
        );
      }
      if (code === 10 || code === 200) {
        throw new Error(
          `Instagram permission denied, instagram_basic and instagram_manage_insights must be approved: ${message ?? ''}`,
        );
      }
      throw new Error(`Instagram API error ${code}: ${message ?? ''}`);
    }
    return json;
  }
}

// globalThis-pinned singleton: env is read once and the instance is reused
// across requests within one warm instance, consistent with the other
// integration clients.
const INSTAGRAM_KEY = '__instagramClient';

type GlobalWithInstagram = typeof globalThis & {
  [INSTAGRAM_KEY]?: InstagramClient;
};

export function getInstagramClient(): InstagramClient {
  const g = globalThis as GlobalWithInstagram;
  if (!g[INSTAGRAM_KEY]) {
    g[INSTAGRAM_KEY] = new InstagramClient(getEnv());
  }
  return g[INSTAGRAM_KEY];
}

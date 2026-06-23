// Authenticated Mixpanel Query API client, ported from the NestJS backend
// src/integrations/mixpanel/mixpanel.client.ts. The @Injectable class with
// @Inject(ENV) and the CacheService dependency becomes a globalThis-pinned
// singleton (g.__mixpanel) reading env via getEnv() and the L2 cache via
// getCache(). The refresh-throttle service already lives in the spine
// (lib/server/cache.ts, getRefreshThrottle()), so it is not redefined here.
//
// Four protective layers preserved exactly:
//   1. Response cache. CacheService reads under keys mixpanel:<endpoint>:<hash>.
//      The TTL (3600s in sources.ts) matches Mixpanel's 60-requests-per-hour
//      rate limit window, and the Postgres tier means a cold start serves saved
//      numbers instead of burning the shared budget. The legacy dashboard still
//      runs against the same project, so every call spends from a shared pool.
//   2. In-flight de-dup. Stale-hit revalidation is already single-flight inside
//      CacheService; the local map below covers cold misses and forced refreshes.
//   3. Concurrency cap. Mixpanel allows 5 simultaneous queries per project; we
//      hold 4 slots and leave one of headroom. A slot is held through any 429
//      retry sleep.
//   4. 429 retry plus a typed surface. One retry after 1200ms. A second 429
//      throws MixpanelRateLimitedError with retryAfterMs; the funnels service
//      catches it and serves saved numbers with an authored reason.
//
// Read-only by construction: query endpoints only, basic auth from a service
// account with no write capability.
//
// SERVER ONLY. Node runtime (uses node:crypto and Buffer). Never import from a
// client component.
import { createHash } from 'node:crypto';
import { getEnv, type Env } from '../env';
import { getCache, CacheService, type CachedRead } from '../cache';
import type { ReasonDto } from '../envelope';

const BASE_US = 'https://mixpanel.com/api/2.0';
const BASE_EU = 'https://eu.mixpanel.com/api/2.0';
const MAX_CONCURRENT = 4; // Mixpanel allows 5; keep one slot of headroom.
const RETRY_DELAY_MS = 1200;

export class MixpanelRateLimitedError extends Error {
  readonly rateLimited = true;

  constructor(
    public readonly endpoint: string,
    public readonly retryAfterMs: number,
  ) {
    super(`Mixpanel ${endpoint} rate limited (429)`);
    this.name = 'MixpanelRateLimitedError';
  }
}

/** Authored copy for the saved-numbers fallback when a forced refresh hits the
 *  rate limit but a cached payload exists. */
export function savedNumbersReason(fetchedAt: Date): ReasonDto {
  const time = fetchedAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return {
    key: 'mixpanel_rate_limited',
    title: 'Mixpanel is busy right now',
    text: `Mixpanel is busy right now. Showing saved numbers from ${time}. It refreshes again within the hour.`,
  };
}

export interface MixpanelQueryOptions {
  /** Skip cache freshness for this read (manual refresh). The fetch still goes
   *  through the semaphore, and the result is written through. */
  bypassTtl?: boolean;
}

export class MixpanelClient {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private running = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly env: Env,
    private readonly cache: CacheService,
  ) {}

  configured(): boolean {
    return Boolean(
      this.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME &&
        this.env.MIXPANEL_SERVICE_ACCOUNT_PASSWORD &&
        this.env.MIXPANEL_PROJECT_ID,
    );
  }

  /**
   * Fetch a Query API endpoint (e.g. 'funnels', 'segmentation', 'events')
   * through the cache. params holds the query string entries; project_id is
   * appended automatically.
   */
  async query<T>(
    endpoint: string,
    params: Record<string, string>,
    options: MixpanelQueryOptions = {},
  ): Promise<CachedRead<T>> {
    if (!this.configured()) {
      throw new Error(
        'Mixpanel is not configured: set MIXPANEL_SERVICE_ACCOUNT_USERNAME, MIXPANEL_SERVICE_ACCOUNT_PASSWORD and MIXPANEL_PROJECT_ID.',
      );
    }
    const key = this.cacheKey(endpoint, params);

    if (options.bypassTtl) {
      try {
        const data = await this.fetchDeduped<T>(key, endpoint, params);
        const fetchedAt = new Date();
        await this.cache.write(key, 'mixpanel', data, fetchedAt);
        return {
          data,
          meta: { fetched_at: fetchedAt, cached: false, stale: false },
        };
      } catch (err) {
        if (!(err instanceof MixpanelRateLimitedError)) throw err;
        // The forced refresh hit the rate limit. Serve the saved payload when
        // one exists (the cache fetcher only runs on a true cold miss, where it
        // rethrows and the caller authors the no-data reason).
        const read = await this.cache.read<T>(key, 'mixpanel', () =>
          Promise.reject(err),
        );
        return {
          data: read.data,
          meta: {
            ...read.meta,
            cached: true,
            reasons: [
              ...(read.meta.reasons ?? []),
              savedNumbersReason(read.meta.fetched_at),
            ],
          },
        };
      }
    }

    return this.cache.read<T>(key, 'mixpanel', () =>
      this.fetchDeduped<T>(key, endpoint, params),
    );
  }

  /** Stable key: endpoint plus a hash of the canonical (sorted) params. */
  private cacheKey(endpoint: string, params: Record<string, string>): string {
    const canonical = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const hash = createHash('sha256').update(canonical).digest('hex');
    return `mixpanel:${endpoint}:${hash.slice(0, 16)}`;
  }

  private fetchDeduped<T>(
    key: string,
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const job = this.withSlot(() =>
      this.fetchWithRetry<T>(endpoint, params),
    ).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  /** Run fn once a concurrency slot is free, then release the slot. */
  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_CONCURRENT) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.running += 1;
    try {
      return await fn();
    } finally {
      this.running -= 1;
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  private buildUrl(endpoint: string, params: Record<string, string>): string {
    const base = this.env.MIXPANEL_API_REGION === 'eu' ? BASE_EU : BASE_US;
    const qs = new URLSearchParams({
      project_id: this.env.MIXPANEL_PROJECT_ID as string,
      ...params,
    }).toString();
    return `${base}/${endpoint}?${qs}`;
  }

  private async fetchWithRetry<T>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const creds = Buffer.from(
      `${this.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME}:${this.env.MIXPANEL_SERVICE_ACCOUNT_PASSWORD}`,
    ).toString('base64');

    let res = await this.fetchOnce(url, creds);
    let firstRetryAfter: number | null = null;
    if (res.status === 429) {
      firstRetryAfter = this.parseRetryAfter(res);
      await res.text().catch(() => undefined);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      res = await this.fetchOnce(url, creds);
    }
    if (res.status === 429) {
      const retryAfter = this.parseRetryAfter(res) ?? firstRetryAfter ?? 60000;
      await res.text().catch(() => undefined);
      throw new MixpanelRateLimitedError(endpoint, retryAfter);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Mixpanel ${endpoint} failed: ${res.status} ${body}`);
    }
    return (await res.json()) as T;
  }

  private fetchOnce(url: string, creds: string): Promise<Response> {
    return fetch(url, {
      headers: {
        authorization: `Basic ${creds}`,
        accept: 'application/json',
      },
    });
  }

  /** Mixpanel sometimes sends Retry-After in seconds. */
  private parseRetryAfter(res: Response): number | null {
    const raw = res.headers.get('retry-after');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
  }
}

// globalThis-pinned singleton: the in-flight map and the 4-slot semaphore state
// survive across requests in one warm instance, so concurrent callers share
// fetches and the concurrency cap is honored process-wide.
const MIXPANEL_KEY = '__mixpanel';

type GlobalWithMixpanel = typeof globalThis & {
  [MIXPANEL_KEY]?: MixpanelClient;
};

export function getMixpanel(): MixpanelClient {
  const g = globalThis as GlobalWithMixpanel;
  if (!g[MIXPANEL_KEY]) {
    g[MIXPANEL_KEY] = new MixpanelClient(getEnv(), getCache());
  }
  return g[MIXPANEL_KEY];
}

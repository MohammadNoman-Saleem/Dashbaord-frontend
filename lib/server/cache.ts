// Two-tier stale-while-revalidate cache, plus the refresh throttle. Ported from
// the NestJS backend src/cache/cache.service.ts and
// src/integrations/mixpanel/refresh-throttle.service.ts. The @Injectable DI
// classes become globalThis-pinned singletons accessed via getCache() and
// getRefreshThrottle(); the pool is read from db.ts rather than injected.
//
//   L1: in-memory Map. Each warm serverless instance keeps its own, so it
//       absorbs read traffic between TTL expiries for that instance.
//   L2: cache_entries in Postgres. Survives cold starts and deploys, so a fresh
//       instance serves last good numbers instead of hammering upstreams.
//
// Read path: fresh hit returns immediately; a stale hit returns the stale
// payload at once (flagged stale) and revalidates in the background with one
// in-flight refresh per key; a cold miss blocks on the fetcher. A failed
// background revalidation keeps the stale entry and logs; the panel keeps
// rendering last good numbers per the never-block-on-an-upstream principle.
//
// SERVER ONLY. Background revalidation in a serverless instance only completes
// while the instance is warm; the L2 row and the next read make it eventually
// consistent regardless.
import type { Pool } from 'pg';
import { getPool } from './db';
import { SOURCE_TTLS, type SourceKey } from './sources';
import type { SourceMeta } from './envelope';

interface L1Entry {
  payload: unknown;
  fetchedAt: Date;
}

export interface CachedRead<T> {
  data: T;
  meta: SourceMeta;
}

export class CacheService {
  private readonly l1 = new Map<string, L1Entry>();
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly pool: Pool) {}

  async read<T>(
    key: string,
    source: SourceKey,
    fetcher: () => Promise<T>,
  ): Promise<CachedRead<T>> {
    const ttlMs = SOURCE_TTLS[source] * 1000;
    const now = Date.now();

    const l1 = this.l1.get(key);
    if (l1) {
      const age = now - l1.fetchedAt.getTime();
      if (age < ttlMs) {
        return this.hit<T>(l1.payload, l1.fetchedAt, false);
      }
      this.revalidateInBackground(key, fetcher);
      return this.hit<T>(l1.payload, l1.fetchedAt, true);
    }

    const l2 = await this.readL2(key);
    if (l2) {
      this.l1.set(key, l2);
      const age = now - l2.fetchedAt.getTime();
      if (age < ttlMs) {
        return this.hit<T>(l2.payload, l2.fetchedAt, false);
      }
      this.revalidateInBackground(key, fetcher);
      return this.hit<T>(l2.payload, l2.fetchedAt, true);
    }

    // Cold miss: nothing to serve, block on the upstream once.
    const data = await fetcher();
    const fetchedAt = new Date();
    await this.write(key, source, data, fetchedAt);
    return this.hit<T>(data, fetchedAt, false);
  }

  /** Upsert both tiers. Public so refresh paths can write through. */
  async write(
    key: string,
    source: SourceKey,
    payload: unknown,
    fetchedAt = new Date(),
  ): Promise<void> {
    this.l1.set(key, { payload, fetchedAt });
    try {
      await this.pool.query(
        `insert into cache_entries (key, payload, fetched_at, ttl_seconds)
         values ($1, $2, $3, $4)
         on conflict (key) do update
           set payload = excluded.payload,
               fetched_at = excluded.fetched_at,
               ttl_seconds = excluded.ttl_seconds`,
        [
          key,
          JSON.stringify(payload),
          fetchedAt.toISOString(),
          SOURCE_TTLS[source],
        ],
      );
    } catch (err) {
      // L2 persistence is best effort; L1 still serves this instance.
      console.warn(
        `cache_entries upsert failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Drop a key from both tiers. Writes that change upstream data (the board's
   *  Zoho task moves and ticket creates) call this so the next read refetches
   *  instead of serving the pre-write payload for a full TTL. */
  async invalidate(key: string): Promise<void> {
    this.l1.delete(key);
    try {
      await this.pool.query('delete from cache_entries where key = $1', [key]);
    } catch (err) {
      console.warn(
        `cache_entries delete failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Read-only peek: whatever either tier holds, never fetches upstream.
   *  For producers (pulse) that must not trigger work on a hot path. */
  async peek<T>(key: string): Promise<CachedRead<T> | null> {
    const entry = this.l1.get(key) ?? (await this.readL2(key));
    if (!entry) return null;
    const source = this.sourceOf(key);
    const ttlMs = source ? SOURCE_TTLS[source] * 1000 : null;
    const stale =
      ttlMs !== null && Date.now() - entry.fetchedAt.getTime() >= ttlMs;
    return this.hit<T>(entry.payload, entry.fetchedAt, stale);
  }

  /** Entries past factor x their TTL, for the pulse staleness feed. */
  async entriesPastTtl(
    factor: number,
  ): Promise<Array<{ key: string; fetched_at: Date }>> {
    const { rows } = await this.pool.query<{ key: string; fetched_at: Date }>(
      `select key, fetched_at from cache_entries
       where fetched_at < now() - (ttl_seconds * $1) * interval '1 second'`,
      [factor],
    );
    return rows;
  }

  private hit<T>(
    payload: unknown,
    fetchedAt: Date,
    stale: boolean,
  ): CachedRead<T> {
    return {
      data: payload as T,
      meta: { fetched_at: fetchedAt, cached: false, stale },
    };
  }

  private async readL2(key: string): Promise<L1Entry | null> {
    try {
      const { rows } = await this.pool.query<{
        payload: unknown;
        fetched_at: Date;
      }>('select payload, fetched_at from cache_entries where key = $1', [key]);
      const row = rows[0];
      return row
        ? { payload: row.payload, fetchedAt: new Date(row.fetched_at) }
        : null;
    } catch (err) {
      console.warn(
        `cache_entries read failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private revalidateInBackground(
    key: string,
    fetcher: () => Promise<unknown>,
  ): void {
    if (this.inflight.has(key)) return;
    const job = (async () => {
      try {
        const data = await fetcher();
        const source = this.sourceOf(key);
        if (source) await this.write(key, source, data);
      } catch (err) {
        console.warn(
          `revalidation failed for ${key}, keeping stale entry: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, job);
  }

  /** Keys follow source:rest (e.g. zoho_crm:deals:all). */
  private sourceOf(key: string): SourceKey | null {
    const prefix = key.split(':')[0] as SourceKey;
    return prefix in SOURCE_TTLS ? prefix : null;
  }
}

// In-memory throttle for the ?refresh=1 cache bypass: one forced refresh per
// viewer per route every ten minutes. Over the limit the flag is silently
// ignored and the read serves from cache as normal, so a refresh-happy viewer
// cannot drain the shared Mixpanel budget. Per-instance state, like L1.
const WINDOW_MS = 10 * 60 * 1000;

export class RefreshThrottleService {
  private readonly last = new Map<string, number>();

  /** True when this viewer may force a refresh on this route right now.
   *  A true result records the attempt and starts the window. */
  allow(viewerKey: string, route: string): boolean {
    const key = `${viewerKey}:${route}`;
    const now = Date.now();
    const prev = this.last.get(key) ?? 0;
    if (now - prev < WINDOW_MS) return false;
    this.last.set(key, now);
    return true;
  }
}

// globalThis-pinned singletons: warm reuse of the L1 map, in-flight dedupe, and
// throttle windows across requests within one instance.
const CACHE_KEY = '__saleem_cache__';
const THROTTLE_KEY = '__saleem_refresh_throttle__';

type GlobalWithCache = typeof globalThis & {
  [CACHE_KEY]?: CacheService;
  [THROTTLE_KEY]?: RefreshThrottleService;
};

export function getCache(): CacheService {
  const g = globalThis as GlobalWithCache;
  if (!g[CACHE_KEY]) {
    g[CACHE_KEY] = new CacheService(getPool());
  }
  return g[CACHE_KEY];
}

export function getRefreshThrottle(): RefreshThrottleService {
  const g = globalThis as GlobalWithCache;
  if (!g[THROTTLE_KEY]) {
    g[THROTTLE_KEY] = new RefreshThrottleService();
  }
  return g[THROTTLE_KEY];
}

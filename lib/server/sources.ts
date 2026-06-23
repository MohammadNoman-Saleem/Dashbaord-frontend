// Per-source cache TTLs (seconds). A cache entry past STALE_BLIP_FACTOR x its
// TTL feeds the pulse staleness check. Ported verbatim from the NestJS backend
// src/config/sources.ts. SERVER ONLY.
export const SOURCE_TTLS = {
  adminpanel: 15 * 60,
  zoho_crm: 10 * 60,
  zoho_books: 30 * 60,
  zoho_projects: 15 * 60,
  mixpanel: 60 * 60,
  ga4: 60 * 60,
  // Medical travel leads 30 minutes, Meta spend 60 minutes.
  mtl: 30 * 60,
  meta: 60 * 60,
  // Social platform reads (LinkedIn, TikTok, Instagram, Zoho Social): all four
  // upstreams are slow and rate limited, one hour matches ga4.
  social: 60 * 60,
} as const;

export type SourceKey = keyof typeof SOURCE_TTLS;

export const STALE_BLIP_FACTOR = 3;

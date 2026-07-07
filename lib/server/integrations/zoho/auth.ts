// Zoho OAuth token refresh, ported from the NestJS backend
// src/integrations/zoho/zoho-auth.service.ts. The @Injectable singleton with
// the @Inject(ENV) dependency becomes a globalThis-pinned singleton (g.__zohoAuth)
// reading env via getEnv(). Token cached ~56 minutes (Zoho expiry is 60),
// concurrent refreshes share one in-flight promise.
//
// This client was planned to use a NEW read-only OAuth client minted for
// saleem-api (plan Wave 0). Sanctioned deviation, pending Khalid and Al Saeed
// sign-off: the team board and IT ticketing port needs Zoho Projects WRITE
// scopes, so the configured client carries them (see projects.ts, the single
// write surface).
//
// SERVER ONLY. Node runtime (fetch is fine on edge, but this is pinned to the
// Node-runtime integration tree by convention and reuse with the pg-backed
// cache). Never import from a client component.
import { getEnv, type Env } from '../../env';

const TOKEN_TTL_MS = 3400 * 1000;

export class ZohoAuthService {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly env: Env) {}

  configured(): boolean {
    return Boolean(
      this.env.ZOHO_CLIENT_ID &&
        this.env.ZOHO_CLIENT_SECRET &&
        this.env.ZOHO_REFRESH_TOKEN,
    );
  }

  /** Drop the cached token so the next accessToken() re-mints. Called after a
   *  401 from Zoho: the token is valid per our TTL but Zoho rejected it (early
   *  expiry, revocation, or the concurrent-access-token cap invalidating an
   *  older token when many warm instances share one refresh token). */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  async accessToken(): Promise<string> {
    if (!this.configured()) {
      throw new Error(
        'Zoho is not configured: set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN (the read-only saleem-api client).',
      );
    }
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: this.env.ZOHO_REFRESH_TOKEN as string,
            client_id: this.env.ZOHO_CLIENT_ID as string,
            client_secret: this.env.ZOHO_CLIENT_SECRET as string,
            grant_type: 'refresh_token',
          }),
        });
        const data = (await res.json()) as { access_token?: string };
        if (!data.access_token) {
          throw new Error('Zoho token refresh failed: ' + JSON.stringify(data));
        }
        this.token = data.access_token;
        this.expiresAt = Date.now() + TOKEN_TTL_MS;
        return this.token;
      } finally {
        // Always clear so future calls can retry after an error.
        this.inflight = null;
      }
    })();

    return this.inflight;
  }
}

// globalThis-pinned singleton: the in-memory token, expiry, and single in-flight
// refresh survive across requests within one warm instance, so concurrent
// callers share one refresh and a hot instance never re-mints per request.
const AUTH_KEY = '__zohoAuth';

type GlobalWithZohoAuth = typeof globalThis & {
  [AUTH_KEY]?: ZohoAuthService;
};

export function getZohoAuth(): ZohoAuthService {
  const g = globalThis as GlobalWithZohoAuth;
  if (!g[AUTH_KEY]) {
    g[AUTH_KEY] = new ZohoAuthService(getEnv());
  }
  return g[AUTH_KEY];
}

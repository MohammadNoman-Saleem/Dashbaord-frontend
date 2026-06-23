// GA4 Analytics Data API client, ported from the NestJS backend
// src/integrations/google/ga4.client.ts. The @Injectable class with
// @Inject(ENV) becomes a globalThis-pinned singleton (g.__ga4Client) reading
// env via getEnv(). Server-to-server only: a short-lived access token is minted
// from the service account key via an RS256 JWT, no OAuth consent flow.
// Concurrent refreshes share one in-flight promise.
//
// SERVER ONLY. Node runtime (uses node:crypto and Buffer). Never import from a
// client component.
import { createPrivateKey, createSign } from 'node:crypto';
import { getEnv, type Env } from '../env';
import type { ReasonDto } from '../envelope';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta/properties';

export interface Ga4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

export interface Ga4Report {
  rows?: Ga4Row[];
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function base64url(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export class Ga4Client {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly env: Env) {}

  configured(): boolean {
    return Boolean(
      this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        this.env.GOOGLE_PRIVATE_KEY &&
        this.env.GOOGLE_GA4_PROPERTY_ID,
    );
  }

  /** The authored reason served when GA4 reads null. */
  notConfiguredReason(): ReasonDto {
    return {
      key: 'ga4_not_configured',
      title: 'Google Analytics is not connected',
      text: 'GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_GA4_PROPERTY_ID are not set on saleem-api, so website analytics read null. Copy them from the legacy dashboard environment.',
    };
  }

  /** One batchRunReports call (Google caps it at 5 requests per call). */
  async batchRunReports(requests: unknown[]): Promise<Ga4Report[]> {
    const token = await this.accessToken();
    const property = this.env.GOOGLE_GA4_PROPERTY_ID as string;
    const res = await fetch(`${DATA_API}/${property}:batchRunReports`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
    const body = (await res.json()) as {
      reports?: Ga4Report[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        `GA4 API error ${res.status}: ${body.error?.message ?? 'unknown'}`,
      );
    }
    return body.reports ?? [];
  }

  private async accessToken(): Promise<string> {
    if (!this.configured()) {
      throw new Error(
        'GA4 is not configured: set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_GA4_PROPERTY_ID.',
      );
    }
    // 60 second safety buffer, same as the legacy cache.
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const jwt = this.mintJwt();
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
          }),
        });
        const data = (await res.json()) as TokenResponse;
        if (!data.access_token) {
          throw new Error(
            data.error_description ??
              data.error ??
              'Failed to get a Google access token',
          );
        }
        this.token = data.access_token;
        this.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
        return this.token;
      } finally {
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  private mintJwt(): string {
    const clientEmail = this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string;
    // Support both \n literals (hosting dashboards) and real newlines (.env).
    let privateKey = (this.env.GOOGLE_PRIVATE_KEY as string).replace(
      /\\n/g,
      '\n',
    );
    // Wrap bare base64 in PEM headers if someone pasted only the key body.
    if (!privateKey.includes('-----BEGIN')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey.trim()}\n-----END PRIVATE KEY-----\n`;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(
      JSON.stringify({
        iss: clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        exp: now + 3600,
        iat: now,
      }),
    );
    const unsigned = `${header}.${payload}`;
    const keyObject = createPrivateKey(privateKey);
    const sign = createSign('RSA-SHA256');
    sign.update(unsigned);
    return `${unsigned}.${base64url(sign.sign(keyObject))}`;
  }
}

// globalThis-pinned singleton: the minted access token and its expiry survive
// across requests in one warm instance, so a hot instance reuses the token and
// concurrent callers share one refresh.
const GA4_KEY = '__ga4Client';

type GlobalWithGa4 = typeof globalThis & {
  [GA4_KEY]?: Ga4Client;
};

export function getGa4Client(): Ga4Client {
  const g = globalThis as GlobalWithGa4;
  if (!g[GA4_KEY]) {
    g[GA4_KEY] = new Ga4Client(getEnv());
  }
  return g[GA4_KEY];
}

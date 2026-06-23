// Meta Marketing API client, ported from the NestJS backend
// src/integrations/meta/meta.client.ts. The @Injectable class with @Inject(ENV)
// becomes a globalThis-pinned singleton (g.__metaClient) reading env via
// getEnv(). Account 737681565467473 (TellSaleem) only, business
// 750022014211598. No other ad account is ever queried.
//
// The system user token is awaiting another business admin's approval, so
// configured() is false everywhere today and every Meta-derived field in
// /api/leads/medical-travel (meta_leads, spend, cpl, daily spend,
// reconciliation) serves null with the authored meta_token_pending reason. The
// client is complete so the token is the only missing piece when it lands.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getEnv, type Env } from '../env';
import type { ReasonDto } from '../envelope';

const GRAPH = 'https://graph.facebook.com/v23.0';

export interface MetaDailyRow {
  date: string;
  spend_usd: number;
  leads: number;
}

interface InsightsRow {
  date_start?: string;
  spend?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
}

interface InsightsPage {
  data?: InsightsRow[];
  paging?: { next?: string };
  error?: { message?: string };
}

const LEAD_ACTION_TYPES = new Set([
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
]);

export class MetaClient {
  constructor(private readonly env: Env) {}

  configured(): boolean {
    return Boolean(
      this.env.META_SYSTEM_USER_TOKEN && this.env.META_AD_ACCOUNT_ID,
    );
  }

  /** The authored reason served wherever a Meta-derived field is null. */
  pendingReason(): ReasonDto {
    return {
      key: 'meta_token_pending',
      title: 'Meta spend is not connected yet',
      text: 'The Meta system user token is awaiting approval, so spend, cost per lead, and the Meta lead count read null for now. Zoho lead counts are live and unaffected.',
      owner: 'alsaeed',
    };
  }

  /** Daily spend and lead counts for the one allowed ad account. Throws a
   *  configuration error when the token is absent; callers check configured()
   *  and serve null instead. */
  async dailySpendAndLeads(from: string, to: string): Promise<MetaDailyRow[]> {
    if (!this.configured()) {
      throw new Error(
        'Meta is not configured: META_SYSTEM_USER_TOKEN is pending approval.',
      );
    }
    const account = this.env.META_AD_ACCOUNT_ID as string;
    const params = new URLSearchParams({
      access_token: this.env.META_SYSTEM_USER_TOKEN as string,
      level: 'account',
      time_increment: '1',
      fields: 'spend,actions',
      time_range: JSON.stringify({ since: from, until: to }),
      limit: '100',
    });

    const rows: MetaDailyRow[] = [];
    let url: string | null = `${GRAPH}/act_${account}/insights?${params}`;
    while (url) {
      const res: Response = await fetch(url);
      const page = (await res.json()) as InsightsPage;
      if (!res.ok || page.error) {
        throw new Error(
          `Meta API error ${res.status}: ${page.error?.message ?? 'unknown'}`,
        );
      }
      for (const row of page.data ?? []) {
        const leads = (row.actions ?? [])
          .filter((a) => LEAD_ACTION_TYPES.has(a.action_type ?? ''))
          .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
        rows.push({
          date: row.date_start ?? '',
          spend_usd: Number(row.spend ?? 0),
          leads,
        });
      }
      url = page.paging?.next ?? null;
    }
    return rows;
  }
}

// globalThis-pinned singleton: warm reuse across requests in one instance.
const META_KEY = '__metaClient';

type GlobalWithMeta = typeof globalThis & {
  [META_KEY]?: MetaClient;
};

export function getMetaClient(): MetaClient {
  const g = globalThis as GlobalWithMeta;
  if (!g[META_KEY]) {
    g[META_KEY] = new MetaClient(getEnv());
  }
  return g[META_KEY];
}

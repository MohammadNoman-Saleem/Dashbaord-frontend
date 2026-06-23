// Authenticated Zoho fetch helpers (read) plus the single write-scoped client,
// ported from the NestJS backend src/integrations/zoho/zoho.client.ts and
// zoho-write.client.ts. The @Injectable classes with constructor DI become
// globalThis-pinned singletons (g.__zohoClient, g.__zohoWriteClient), each
// taking the shared ZohoAuthService from getZohoAuth(). Org-verified quirks
// preserved exactly:
//   1. Zoho answers 204 with an EMPTY body when a page or filter matches
//      nothing; res.json() would throw on it.
//   2. CRM pagination breaks on info.more_records, with a records.length
//      backstop so an exact multiple of 200 does not request one page past
//      the end.
//   3. Books-shaped responses carry records under a named key and signal
//      continuation via page_context.has_more_page; the CRM loop would
//      silently return nothing there.
// The read client (ZohoClient) exposes GET only. Writes (ZohoWriteClient) speak
// exactly PUT and the convert POST; there is no delete and none may be added.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getZohoAuth, type ZohoAuthService } from './auth';

const PER_PAGE = 200;
const CRM = 'https://www.zohoapis.com/crm/v3';

// BE-OPS-2: native fetch has no default timeout, so a slow Zoho upstream could
// hang a request (and a write-gate commit) indefinitely. Abort each call after
// this budget. The message names only the timeout, never patient data.
const ZOHO_TIMEOUT_MS = 15000;

interface CrmPage {
  data?: unknown[];
  info?: { more_records?: boolean };
}

type BooksPage = Record<string, unknown> & {
  page_context?: { has_more_page?: boolean };
};

export class ZohoClient {
  constructor(private readonly auth: ZohoAuthService) {}

  async get<T = Record<string, unknown>>(
    url: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const token = await this.auth.accessToken();
    const qs = new URLSearchParams(params).toString();
    const fullUrl = qs ? `${url}?${qs}` : url;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZOHO_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(fullUrl, {
        headers: { authorization: `Zoho-oauthtoken ${token}` },
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `Zoho request timed out after ${ZOHO_TIMEOUT_MS}ms at ${url}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Zoho API error ${res.status} at ${url}: ${body}`);
    }
    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  }

  /** All records of a CRM-shaped module ({ data: [...] }). */
  async getAll(
    url: string,
    params: Record<string, string> = {},
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    let page = 1;
    for (;;) {
      const data = await this.get<CrmPage>(url, {
        ...params,
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const records = data.data ?? [];
      all.push(...records);
      if (!data.info?.more_records) break;
      if (records.length < PER_PAGE) break; // backstop
      page++;
    }
    return all;
  }

  /** All records of a Books-shaped list ({ [listKey]: [...] }). */
  async booksGetAll(
    url: string,
    listKey: string,
    params: Record<string, string> = {},
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    let page = 1;
    for (;;) {
      const data = await this.get<BooksPage>(url, {
        ...params,
        per_page: String(PER_PAGE),
        page: String(page),
      });
      const records = data[listKey];
      const rows: unknown[] = Array.isArray(records)
        ? (records as unknown[])
        : [];
      all.push(...rows);
      if (!data.page_context?.has_more_page) break;
      page++;
    }
    return all;
  }
}

/** A Zoho CRM module the gate may write. Closed set; the gate never writes an
 *  arbitrary module. */
export type WritableModule = 'Deals' | 'Leads';

export interface ZohoWriteResult {
  ok: boolean;
  /** Zoho's per-record code, e.g. SUCCESS, or an error code on failure. */
  code: string;
  /** The id Zoho echoes back on success, for the audit trail. */
  id: string | null;
}

// The write-scoped Zoho CRM client. Used ONLY by the cockpit write gate's commit
// path. Kept separate from the read-only ZohoClient so the CRM write surface is
// one file, auditable and easy to revoke. It speaks exactly PUT (record update)
// and the convert POST. There is NO delete method and none may be added.
export class ZohoWriteClient {
  constructor(private readonly auth: ZohoAuthService) {}

  /** Update a single record's fields. PUT /crm/v3/{module}/{id} with the v3
   *  envelope { data: [fields] }. Field VALUES are never logged here (treatment
   *  deals carry patient data); only field KEYS surface in an error. */
  async updateRecord(
    module: WritableModule,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<ZohoWriteResult> {
    const token = await this.auth.accessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZOHO_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${CRM}/${module}/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          authorization: `Zoho-oauthtoken ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ data: [fields] }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `Zoho CRM PUT timed out after ${ZOHO_TIMEOUT_MS}ms on ${module}/${id}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const fieldKeys = Object.keys(fields).join(',');
      throw new Error(
        `Zoho CRM PUT ${res.status} on ${module}/${id} [fields: ${fieldKeys}]: ${body}`,
      );
    }

    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ code?: string; details?: { id?: string } }>;
    };
    const record = json.data?.[0];
    const code = record?.code ?? 'UNKNOWN';
    return {
      ok: code === 'SUCCESS',
      code,
      id: record?.details?.id ?? null,
    };
  }

  /** Convert a lead into a deal. POST /crm/v3/Leads/{id}/actions/convert with
   *  the v3 convert envelope { data: [{ overwrite: true, Deals: { ...deal } }] }.
   *  This is a create-by-conversion, not a delete: the lead is marked Converted,
   *  never removed. Field KEYS only ever surface in an error. */
  async convertLead(
    leadId: string,
    deal: { Deal_Name?: string; Pipeline: string; Stage: string },
  ): Promise<{ ok: boolean; dealId: string | null }> {
    const token = await this.auth.accessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ZOHO_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `${CRM}/Leads/${encodeURIComponent(leadId)}/actions/convert`,
        {
          method: 'POST',
          headers: {
            authorization: `Zoho-oauthtoken ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ data: [{ overwrite: true, Deals: deal }] }),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          `Zoho CRM convert timed out after ${ZOHO_TIMEOUT_MS}ms on Leads/${leadId}`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const fieldKeys = Object.keys(deal).join(',');
      throw new Error(
        `Zoho CRM convert ${res.status} on Leads/${leadId} [fields: ${fieldKeys}]: ${body}`,
      );
    }

    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ Deals?: string | { id?: string } }>;
    };
    const deals = json.data?.[0]?.Deals;
    const dealId = typeof deals === 'string' ? deals : (deals?.id ?? null);
    return { ok: !!dealId, dealId };
  }
}

// globalThis-pinned singletons. Both reuse the one ZohoAuthService singleton so
// the read and write paths share the same warm token cache.
const READ_KEY = '__zohoClient';
const WRITE_KEY = '__zohoWriteClient';

type GlobalWithZohoClients = typeof globalThis & {
  [READ_KEY]?: ZohoClient;
  [WRITE_KEY]?: ZohoWriteClient;
};

export function getZohoClient(): ZohoClient {
  const g = globalThis as GlobalWithZohoClients;
  if (!g[READ_KEY]) {
    g[READ_KEY] = new ZohoClient(getZohoAuth());
  }
  return g[READ_KEY];
}

export function getZohoWriteClient(): ZohoWriteClient {
  const g = globalThis as GlobalWithZohoClients;
  if (!g[WRITE_KEY]) {
    g[WRITE_KEY] = new ZohoWriteClient(getZohoAuth());
  }
  return g[WRITE_KEY];
}

// The medical travel leads READ logic that pulse and cases depend on (07
// sections 3 and 4). Zoho-side numbers are fully live from the Leads module;
// classification runs through lib/server/classification and the normalized view
// is upserted into leads_enrichment on demand inside this read (no scheduled job
// this wave), cached 30 minutes. Every Meta-derived field (meta_leads, spend,
// cpl, daily spend, reconciliation) serves null with the authored
// meta_token_pending reason until the system user token lands.
//
// Ported from the NestJS backend src/leads/leads.service.ts AND src/leads/
// reads.ts (the pure reads engine + reconciliation gate, inlined here since
// they are single-consumer of this service). The @Injectable LeadsService with
// constructor DI (PG_POOL, CacheService, ZohoClient, MetaClient,
// CrmReadService) becomes a globalThis-pinned singleton (g.__leadsRead) reading
// the foundation accessors getPool(), getCache(), getZohoClient(),
// getMetaClient(), getCrmRead(). Logic and DTOs are kept VERBATIM.
//
// No patient or lead names appear anywhere in this payload for any role.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';
import { getCache, type CacheService } from '../cache';
import { getZohoClient, type ZohoClient } from '../integrations/zoho/client';
import {
  getMetaClient,
  type MetaClient,
  type MetaDailyRow,
} from '../integrations/meta';
import { getCrmRead, type CrmReadService } from '../crm-read';
import type { SourceMeta } from '../envelope';
import {
  GCC_COUNTRIES,
  destinationGroupOf,
  inferOrigin,
  normalizeLeadStatus,
  specialtyGroupOf,
} from '../classification';

// ---------------------------------------------------------------------------
// The reads engine and the reconciliation gate (07 sections 3 and 4). Inlined
// VERBATIM from the backend src/leads/reads.ts. Pure functions so the bodies
// are server-rendered strings the dashboard and any export read identically.
// ---------------------------------------------------------------------------

export interface ReadItem {
  key: 'creative_fatigue' | 'corridor_gap' | 'warm_leads';
  title: string;
  body: string;
}

export interface DestinationDemand {
  group: string;
  n: number;
  corridor_status: string | null;
  corridor_note?: string | null;
}

export interface ReadsFacts {
  /** Days since the campaign started, day one inclusive. */
  campaign_day: number;
  /** Null until Meta spend exists; creative_fatigue cannot fire without
   *  CPL. */
  cpl: { delta_pct: number; first_week_usd: number; since_usd: number } | null;
  destinations: DestinationDemand[];
  intro_done: number;
}

const FATIGUE_DELTA_PCT = 30;
const FATIGUE_MIN_CAMPAIGN_DAYS = 8;
const WARM_LEADS_MIN = 5;
const MAX_READS = 3;

const STATUS_PHRASE: Record<string, string> = {
  live: 'live',
  proposal: 'at proposal stage',
  final_stages: 'in final stages',
  developing: 'in development',
  not_contacted: 'not contacted yet',
};

export function corridorStatusPhrase(status: string | null): string {
  return STATUS_PHRASE[status ?? ''] ?? 'not contacted yet';
}

/** creative_fatigue: CPL since the split date exceeds first-week CPL by 30
 *  percent or more and the campaign is at least 8 days old. */
export function creativeFatigueFires(facts: ReadsFacts): boolean {
  return (
    facts.cpl !== null &&
    facts.cpl.delta_pct >= FATIGUE_DELTA_PCT &&
    facts.campaign_day >= FATIGUE_MIN_CAMPAIGN_DAYS
  );
}

/** corridor_gap: the most-demanded corridor destination has a status other
 *  than live. Only groups present in corridor_config count as corridors;
 *  Bahrain and Other carry no corridor status and never trigger this. */
export function corridorGapFires(facts: ReadsFacts): boolean {
  const corridors = facts.destinations
    .filter((d) => d.corridor_status !== null && d.n > 0)
    .sort((a, b) => b.n - a.n);
  return corridors.length > 0 && corridors[0].corridor_status !== 'live';
}

export function warmLeadsFires(facts: ReadsFacts): boolean {
  return facts.intro_done >= WARM_LEADS_MIN;
}

/** Up to three reads, in the spec's order. All copy authored here. */
export function composeReads(facts: ReadsFacts): ReadItem[] {
  const reads: ReadItem[] = [];

  if (creativeFatigueFires(facts) && facts.cpl) {
    reads.push({
      key: 'creative_fatigue',
      title: 'Refresh the creative this week',
      body: `Cost per lead since the mid-campaign split is ${Math.round(facts.cpl.delta_pct)} percent above the first week ($${facts.cpl.since_usd.toFixed(2)} against $${facts.cpl.first_week_usd.toFixed(2)}). The May campaign showed the same curve, and a creative refresh brought it back down.`,
    });
  }

  if (corridorGapFires(facts)) {
    const corridors = facts.destinations
      .filter((d) => d.corridor_status !== null && d.n > 0)
      .sort((a, b) => b.n - a.n);
    const top = corridors[0];
    const lines = corridors
      .slice(0, 3)
      .map(
        (d) =>
          `${d.group} (${d.n} ${d.n === 1 ? 'lead' : 'leads'}) is ${corridorStatusPhrase(d.corridor_status)}`,
      );
    reads.push({
      key: 'corridor_gap',
      title: `Demand points at ${top.group} before that corridor is ready`,
      body: `${lines.join('; ')}. The most requested destination is not live yet, so corridor work is the lever this week.`,
    });
  }

  if (warmLeadsFires(facts)) {
    reads.push({
      key: 'warm_leads',
      title: `${facts.intro_done} warm leads are waiting on a next step`,
      body: `${facts.intro_done} leads have finished their intro call and have no next step logged. A same-week follow-up keeps them warm; they cool fast after that.`,
    });
  }

  return reads.slice(0, MAX_READS);
}

export interface ReconciliationResult {
  meta: number;
  zoho: number;
  gap: number;
  gap_age_hours: number;
}

/** The reconciliation result for an active campaign. gap_since is when the
 *  current gap was first observed (persisted by the caller); a gap with no
 *  prior observation starts its clock now. */
export function reconcileLeadCounts(
  metaCount: number,
  zohoCount: number,
  gapSince: string | null,
  now: Date = new Date(),
): ReconciliationResult {
  const gap = metaCount - zohoCount;
  if (gap === 0)
    return { meta: metaCount, zoho: zohoCount, gap: 0, gap_age_hours: 0 };
  const since = gapSince ? new Date(gapSince).getTime() : now.getTime();
  const hours = Math.max(0, (now.getTime() - since) / (60 * 60 * 1000));
  return {
    meta: metaCount,
    zoho: zohoCount,
    gap,
    gap_age_hours: Math.round(hours * 10) / 10,
  };
}

/** The pulse producer's gate: a gap that has persisted past 24 hours
 *  (07 section 4, tolerance zero with a one-day patience window). */
export function reconciliationFires(
  recon: ReconciliationResult | null,
): boolean {
  return recon !== null && recon.gap !== 0 && recon.gap_age_hours >= 24;
}

// ---------------------------------------------------------------------------
// LeadsReadService (ported from LeadsService). DI swapped for the foundation
// accessors; logic verbatim.
// ---------------------------------------------------------------------------

// The active paid campaign: June 2026 medical travel lead generation on
// Meta, landing in the Zoho Leads module as Lead_Source "Meta Ads". No
// campaigns table exists yet; this constant becomes admin-editable config
// when a second campaign starts.
export const ACTIVE_CAMPAIGN = {
  key: 'mt-leadgen-2026-06',
  zoho_lead_source: 'Meta Ads',
  start: '2026-06-01',
};

// Currency conversion is fixed at the pegged rate, applied server-side;
// the UI never converts (09 section 8).
export const USD_PER_BHD = 2.65;
/** Authored display labels for specialty groups. The action table shows
 * these, never the patient-typed concern text: a patient's own words about
 * their condition are health information and stay in leads_enrichment for
 * the care team only (review finding, Jun 12). */
const SPECIALTY_DISPLAY: Record<string, string> = {
  neuro_spine_rehab: 'Neuro, spine and rehab',
  orthopedics: 'Orthopedics',
  gastro: 'Digestive health',
  cosmetic: 'Cosmetic',
  womens_health: 'Womens health',
  other: 'Other',
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
export const usdToBhd = (usd: number): number => round2(usd / USD_PER_BHD);

const CRM = 'https://www.zohoapis.com/crm/v3';
const FIRST_WEEK_DAYS = 7;
const GAP_STATE_KEY = 'meta:lead-recon-gap-since';

interface CampaignLeadRecord {
  id: string;
  Zoho_ID: string | null;
  Lead_Source: string | null;
  Lead_Status: string | null;
  Country: string | null;
  Phone: string | null;
  Mobile: string | null;
  Created_Time: string | null;
  Prefered_Country_of_Treatment_Consultation: string | string[] | null;
  Main_Concern_Reason_for_Consultation: string | null;
  $converted?: boolean;
}

interface EnrichedLead {
  zoho_lead_id: string;
  zoho_ref: string;
  created_date: string;
  origin_country: string;
  origin_inferred: boolean;
  destination_raw: string | null;
  destination_group: string | null;
  specialty_raw: string | null;
  specialty_group: string | null;
  status_normalized: ReturnType<typeof normalizeLeadStatus>;
  converted_deal_id: string | null;
  deal_stage: string | null;
}

export interface MedicalTravelData {
  period: {
    from: string;
    to: string;
    partial_day: boolean;
    campaign_day: number;
  };
  totals: {
    zoho_leads: number;
    meta_leads: number | null;
    outside_bahrain_pct: number;
    gcc_countries: number;
    converted: number;
  };
  cpl: {
    basis: 'meta_reported';
    blended_usd: number;
    blended_bhd: number;
    first_week_usd: number | null;
    since_usd: number | null;
    split_date: string;
    delta_pct: number | null;
    fatigue: boolean;
  } | null;
  spend: { usd: number; bhd: number } | null;
  daily: Array<{ date: string; leads: number; spend_usd: number | null }>;
  origins: Array<{ country: string; n: number; inferred_n: number }>;
  destinations: Array<{
    group: string;
    n: number;
    corridor_status: string | null;
  }>;
  specialties: Array<{ group: string; n: number }>;
  statuses: {
    converted: number;
    intro_done: number;
    waiting: number;
    new: number;
    not_qualified: number;
  };
  action_rows: Array<{
    ref: string;
    from: string;
    destination: string | null;
    treatment: string | null;
    status: string;
    deal_stage: string | null;
    zoho_lead_id: string;
    zoho_ref: string;
  }>;
  reads: ReadItem[];
  reconciliation: ReconciliationResult | null;
}

export class LeadsReadService {
  constructor(
    private readonly pool: Pool,
    private readonly cache: CacheService,
    private readonly zoho: ZohoClient,
    private readonly meta: MetaClient,
    private readonly crm: CrmReadService,
  ) {}

  /** Defaults to the active campaign's running window. */
  defaultWindow(): { from: string; to: string } {
    return {
      from: ACTIVE_CAMPAIGN.start,
      to: new Date().toISOString().slice(0, 10),
    };
  }

  async medicalTravel(
    from?: string,
    to?: string,
  ): Promise<{ data: MedicalTravelData; parts: SourceMeta[] }> {
    const window = this.defaultWindow();
    const f = from ?? window.from;
    const t = to ?? window.to;
    const read = await this.cache.read<MedicalTravelData>(
      `mtl:medical-travel:${f}:${t}`,
      'mtl',
      () => this.compose(f, t),
    );
    const parts: SourceMeta[] = [read.meta];
    if (!this.meta.configured()) {
      parts.push({
        fetched_at: new Date(),
        cached: false,
        stale: false,
        reliable: true,
        reasons: [this.meta.pendingReason()],
      });
    }
    return { data: read.data, parts };
  }

  /** Read-only peek at the cached default window for the pulse producer.
   *  Never triggers an upstream fetch. */
  async reconciliationSnapshot(): Promise<ReconciliationResult | null> {
    const { from, to } = this.defaultWindow();
    const cached = await this.cache.peek<MedicalTravelData>(
      `mtl:medical-travel:${from}:${to}`,
    );
    return cached?.data?.reconciliation ?? null;
  }

  private async compose(from: string, to: string): Promise<MedicalTravelData> {
    const records = (await this.zoho.getAll(`${CRM}/Leads`, {
      fields: [
        'Zoho_ID',
        'Lead_Source',
        'Lead_Status',
        'Country',
        'Phone',
        'Mobile',
        'Created_Time',
        'Prefered_Country_of_Treatment_Consultation',
        'Main_Concern_Reason_for_Consultation',
      ].join(','),
      converted: 'both',
    })) as CampaignLeadRecord[];

    const inWindow = records.filter((r) => {
      if (r.Lead_Source !== ACTIVE_CAMPAIGN.zoho_lead_source) return false;
      const day = (r.Created_Time ?? '').slice(0, 10);
      return day >= from && day <= to;
    });
    inWindow.sort((a, b) =>
      (a.Created_Time ?? '').localeCompare(b.Created_Time ?? ''),
    );

    const enriched = await this.enrich(inWindow);
    await this.upsertEnrichment(enriched);

    const corridor = await this.corridorMap();
    const today = new Date().toISOString().slice(0, 10);
    const effectiveTo = to <= today ? to : today;
    const campaignDay =
      Math.floor(
        (new Date(`${effectiveTo}T00:00:00Z`).getTime() -
          new Date(`${from}T00:00:00Z`).getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1;

    // Meta-derived facts: live when the token exists, null with the
    // authored reason until then.
    let metaDaily: MetaDailyRow[] | null = null;
    if (this.meta.configured()) {
      try {
        metaDaily = await this.meta.dailySpendAndLeads(from, to);
      } catch (err) {
        console.warn(
          `Meta insights failed, serving nulls: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const statuses = {
      converted: 0,
      intro_done: 0,
      waiting: 0,
      new: 0,
      not_qualified: 0,
    };
    for (const lead of enriched) statuses[lead.status_normalized]++;

    const origins = new Map<string, { n: number; inferred_n: number }>();
    for (const lead of enriched) {
      const entry = origins.get(lead.origin_country) ?? { n: 0, inferred_n: 0 };
      entry.n++;
      if (lead.origin_inferred) entry.inferred_n++;
      origins.set(lead.origin_country, entry);
    }

    const destinations = new Map<string, number>();
    for (const lead of enriched) {
      const group = lead.destination_group ?? 'Unspecified';
      destinations.set(group, (destinations.get(group) ?? 0) + 1);
    }

    const specialties = new Map<string, number>();
    for (const lead of enriched) {
      const group = lead.specialty_group ?? 'unspecified';
      specialties.set(group, (specialties.get(group) ?? 0) + 1);
    }

    const outsideBahrain = enriched.filter(
      (l) => l.origin_country !== 'Bahrain',
    ).length;
    const gccPresent = new Set(
      enriched
        .map((l) => l.origin_country)
        .filter((c) => GCC_COUNTRIES.includes(c)),
    );

    const splitDate = this.addDays(from, FIRST_WEEK_DAYS);
    const spendByDate = new Map<string, number>();
    if (metaDaily) {
      for (const row of metaDaily) spendByDate.set(row.date, row.spend_usd);
    }
    const daily: MedicalTravelData['daily'] = [];
    const leadsByDate = new Map<string, number>();
    for (const lead of enriched) {
      leadsByDate.set(
        lead.created_date,
        (leadsByDate.get(lead.created_date) ?? 0) + 1,
      );
    }
    for (let d = from; d <= to; d = this.addDays(d, 1)) {
      daily.push({
        date: d,
        leads: leadsByDate.get(d) ?? 0,
        spend_usd: metaDaily ? round2(spendByDate.get(d) ?? 0) : null,
      });
    }

    let cpl: MedicalTravelData['cpl'] = null;
    let spend: MedicalTravelData['spend'] = null;
    let reconciliation: ReconciliationResult | null = null;
    let metaLeads: number | null = null;
    if (metaDaily) {
      metaLeads = metaDaily.reduce((sum, r) => sum + r.leads, 0);
      const spendUsd = round2(
        metaDaily.reduce((sum, r) => sum + r.spend_usd, 0),
      );
      spend = { usd: spendUsd, bhd: usdToBhd(spendUsd) };

      const firstWeek = metaDaily.filter((r) => r.date < splitDate);
      const since = metaDaily.filter((r) => r.date >= splitDate);
      const cplOf = (rows: MetaDailyRow[]): number | null => {
        const leads = rows.reduce((s, r) => s + r.leads, 0);
        if (leads === 0) return null;
        return round2(rows.reduce((s, r) => s + r.spend_usd, 0) / leads);
      };
      const blended = metaLeads > 0 ? round2(spendUsd / metaLeads) : 0;
      const firstWeekCpl = cplOf(firstWeek);
      const sinceCpl = cplOf(since);
      const deltaPct =
        firstWeekCpl && sinceCpl
          ? Math.round(((sinceCpl - firstWeekCpl) / firstWeekCpl) * 100)
          : null;
      cpl = {
        basis: 'meta_reported',
        blended_usd: blended,
        blended_bhd: usdToBhd(blended),
        first_week_usd: firstWeekCpl,
        since_usd: sinceCpl,
        split_date: splitDate,
        delta_pct: deltaPct,
        fatigue: deltaPct !== null && deltaPct >= 30 && campaignDay >= 8,
      };

      reconciliation = await this.reconcile(metaLeads, enriched.length);
    }

    const corridorOrNull = (group: string): string | null =>
      corridor.get(group) ?? null;

    const destinationRows = [...destinations.entries()]
      .map(([group, n]) => ({
        group,
        n,
        corridor_status: corridorOrNull(group),
      }))
      .sort((a, b) => b.n - a.n);

    const reads = composeReads({
      campaign_day: campaignDay,
      cpl:
        cpl && cpl.delta_pct !== null && cpl.first_week_usd && cpl.since_usd
          ? {
              delta_pct: cpl.delta_pct,
              first_week_usd: cpl.first_week_usd,
              since_usd: cpl.since_usd,
            }
          : null,
      destinations: destinationRows,
      intro_done: statuses.intro_done,
    });

    const actionable = new Set(['converted', 'waiting', 'new']);
    const actionRows = enriched
      .filter((l) => actionable.has(l.status_normalized))
      .map((l, i) => ({
        ref: `L${String(i + 1).padStart(2, '0')}`,
        from: l.origin_country,
        destination: l.destination_group,
        treatment: SPECIALTY_DISPLAY[l.specialty_group ?? ''] ?? null,
        status: l.status_normalized,
        deal_stage: l.deal_stage,
        zoho_lead_id: l.zoho_lead_id,
        zoho_ref: l.zoho_ref,
      }));

    return {
      period: {
        from,
        to,
        partial_day: to >= today,
        campaign_day: campaignDay,
      },
      totals: {
        zoho_leads: enriched.length,
        meta_leads: metaLeads,
        outside_bahrain_pct:
          enriched.length > 0
            ? Math.round((outsideBahrain / enriched.length) * 100)
            : 0,
        gcc_countries: gccPresent.size,
        converted: statuses.converted,
      },
      cpl,
      spend,
      daily,
      origins: [...origins.entries()]
        .map(([country, v]) => ({ country, ...v }))
        .sort((a, b) => b.n - a.n),
      destinations: destinationRows,
      specialties: [...specialties.entries()]
        .map(([group, n]) => ({ group, n }))
        .sort((a, b) => b.n - a.n),
      statuses,
      action_rows: actionRows,
      reads,
      reconciliation,
    };
  }

  private async enrich(records: CampaignLeadRecord[]): Promise<EnrichedLead[]> {
    // Converted deals: resolve the linked deal id record by record (only a
    // handful convert), then read the stage from the cached deals list.
    const dealsRead = await this.crm.deals().catch(() => null);
    const stageById = new Map<string, string | null>();
    for (const deal of dealsRead?.data ?? []) {
      stageById.set(deal.id, deal.Stage);
    }

    const out: EnrichedLead[] = [];
    for (const r of records) {
      const converted = r.$converted === true || r.Lead_Status === 'Deal Ready';
      const status = normalizeLeadStatus(r.Lead_Status, converted);
      let convertedDealId: string | null = null;
      if (status === 'converted') {
        convertedDealId = await this.convertedDealId(r.id);
      }
      const origin = inferOrigin(r.Country, r.Phone ?? r.Mobile);
      const destRaw = Array.isArray(
        r.Prefered_Country_of_Treatment_Consultation,
      )
        ? r.Prefered_Country_of_Treatment_Consultation.join(', ')
        : (r.Prefered_Country_of_Treatment_Consultation ?? null);
      out.push({
        zoho_lead_id: r.id,
        zoho_ref: r.Zoho_ID ?? r.id,
        created_date: (r.Created_Time ?? '').slice(0, 10),
        origin_country: origin.country,
        origin_inferred: origin.inferred,
        destination_raw: destRaw,
        destination_group: destinationGroupOf(destRaw),
        specialty_raw: r.Main_Concern_Reason_for_Consultation ?? null,
        specialty_group: specialtyGroupOf(
          r.Main_Concern_Reason_for_Consultation,
        ),
        status_normalized: status,
        converted_deal_id: convertedDealId,
        deal_stage: convertedDealId
          ? (stageById.get(convertedDealId) ?? null)
          : null,
      });
    }
    return out;
  }

  /** The per-record read carries $converted_detail; the list read does
   *  not. Zoho answers 204 empty for a converted lead unless converted=true
   *  rides along (verified live Jun 12 2026). */
  private async convertedDealId(leadId: string): Promise<string | null> {
    try {
      const res = await this.zoho.get<{
        data?: Array<{
          $converted_detail?: { deal?: string | { id?: string } };
        }>;
      }>(`${CRM}/Leads/${leadId}`, { converted: 'true' });
      const detail = res.data?.[0]?.$converted_detail?.deal;
      if (!detail) return null;
      return typeof detail === 'string' ? detail : (detail.id ?? null);
    } catch {
      return null;
    }
  }

  /** Store the server's normalization without mutating the Zoho record. */
  private async upsertEnrichment(leads: EnrichedLead[]): Promise<void> {
    if (leads.length === 0) return;
    const values: string[] = [];
    const params: unknown[] = [];
    leads.forEach((l, i) => {
      const base = i * 9;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, now())`,
      );
      params.push(
        l.zoho_lead_id,
        ACTIVE_CAMPAIGN.key,
        l.origin_country,
        l.origin_inferred,
        l.destination_raw,
        l.destination_group,
        l.specialty_raw,
        l.specialty_group,
        l.status_normalized,
      );
    });
    // converted_deal_id rides in a second pass to keep the parameter layout
    // simple; it changes rarely.
    try {
      await this.pool.query(
        `insert into leads_enrichment
           (zoho_lead_id, campaign_key, origin_country, origin_inferred,
            destination_raw, destination_group, specialty_raw, specialty_group,
            status_normalized, synced_at)
         values ${values.join(', ')}
         on conflict (zoho_lead_id) do update set
           campaign_key = excluded.campaign_key,
           origin_country = excluded.origin_country,
           origin_inferred = excluded.origin_inferred,
           destination_raw = excluded.destination_raw,
           destination_group = excluded.destination_group,
           specialty_raw = excluded.specialty_raw,
           specialty_group = excluded.specialty_group,
           status_normalized = excluded.status_normalized,
           synced_at = now()`,
        params,
      );
      const convertedRows = leads.filter((l) => l.converted_deal_id);
      for (const l of convertedRows) {
        await this.pool.query(
          'update leads_enrichment set converted_deal_id = $2 where zoho_lead_id = $1',
          [l.zoho_lead_id, l.converted_deal_id],
        );
      }
    } catch (err) {
      // Enrichment persistence is best effort; the payload still serves.
      console.warn(
        `leads_enrichment upsert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async corridorMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const { rows } = await this.pool.query<{
        destination_group: string;
        corridor_status: string;
      }>('select destination_group, corridor_status from corridor_config');
      for (const row of rows)
        map.set(row.destination_group, row.corridor_status);
    } catch (err) {
      console.warn(
        `corridor_config read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return map;
  }

  /** Persist when the current Meta/Zoho gap was first seen so the pulse
   *  producer's 24-hour patience window survives restarts. */
  private async reconcile(
    metaCount: number,
    zohoCount: number,
  ): Promise<ReconciliationResult> {
    const state = await this.cache.peek<{ since: string | null }>(
      GAP_STATE_KEY,
    );
    const prior = state?.data?.since ?? null;
    const gap = metaCount - zohoCount;
    const since = gap === 0 ? null : (prior ?? new Date().toISOString());
    await this.cache.write(GAP_STATE_KEY, 'meta', { since });
    return reconcileLeadCounts(metaCount, zohoCount, since);
  }

  private addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}

// globalThis-pinned singleton: shares the one cache, Zoho read client, Meta
// client, and CRM read service so the warm L1 cache and Zoho/Meta tokens are
// reused across every leads-facing route (currently pulse and cases).
const LEADS_READ_KEY = '__leadsRead';

type GlobalWithLeadsRead = typeof globalThis & {
  [LEADS_READ_KEY]?: LeadsReadService;
};

export function getLeadsRead(): LeadsReadService {
  const g = globalThis as GlobalWithLeadsRead;
  if (!g[LEADS_READ_KEY]) {
    g[LEADS_READ_KEY] = new LeadsReadService(
      getPool(),
      getCache(),
      getZohoClient(),
      getMetaClient(),
      getCrmRead(),
    );
  }
  return g[LEADS_READ_KEY];
}

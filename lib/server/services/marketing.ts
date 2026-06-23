// Marketing: leads by channel tallied from this month's CRM leads (real),
// with the paid media detail honestly absent until the Meta connector
// lands. Spend, cost per lead, WhatsApp reply rate and Instagram reach have
// no wired source yet, so they are null with an authored reason, never a
// plausible number.
//
// Ported from the NestJS backend src/marketing/marketing.service.ts. The
// @Injectable MarketingService with constructor DI (PG_POOL, CrmReadService)
// becomes a globalThis-pinned singleton (g.__marketing) reading the foundation
// accessors getPool() and getCrmRead(). Logic and DTOs are kept VERBATIM.
//
// No patient or lead names appear anywhere in this payload for any role: the
// channel tally is a per-source count and the lead-quality block is integer
// counts off the classifier; the leads tile is a count and the target is a
// numeric KPI row. The route still resolves the viewer so the global sweep runs.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';
import { getCrmRead, type CrmReadService } from '../crm-read';
import {
  isRecognizedLeadStatus,
  normalizeLeadStatus,
} from '../classification';
import type { ReasonDto, SourceMeta } from '../envelope';

export interface MarketingChannelData {
  channel: string;
  leads: number;
  spend_bhd: number | null;
  cpl_display: string;
  read: string;
}

/** Lead quality over the same window as the leads tile (this calendar
 *  month to date). total is every CRM lead created this month; won is the
 *  converted count; qualified is total minus the not-qualified count, so a
 *  lead still in flight counts as qualified until it is rejected.
 *  unclassified counts leads whose Zoho status is a non-blank value the
 *  classification map does not recognize: those fold into new inside
 *  normalizeLeadStatus, so they are surfaced here rather than silently
 *  inflating qualified. A blank status is a recognized new lead, not
 *  unclassified. When unclassified is above zero, qualified and won carry
 *  that uncertainty: the unclassified leads are still inside total and
 *  qualified (they are not not-qualified), so the tiles read them as the
 *  optimistic case and the count says how many are unsure. */
export interface MarketingLeadQuality {
  total: number;
  qualified: number;
  won: number;
  unclassified: number;
}

export interface MarketingPayload {
  tiles: {
    leads: { value: number; target: number | null };
    lead_quality: MarketingLeadQuality;
    cpl: { value_bhd: number; cap_bhd: number } | null;
    whatsapp_reply_pct: { value: number; target: number } | null;
    ig_reach: { value: number; spark: number[] } | null;
  };
  channels: MarketingChannelData[];
  moves: Array<{ title: string; text: string }>;
}

const META_CONNECTOR_REASON: ReasonDto = {
  key: 'meta_connector_pending',
  title: 'Meta detail connects soon',
  text: 'Meta detail connects soon. Spend and reach come in manually until then.',
};

/** Plain reading from a channel's share of this month's leads. */
function channelRead(leads: number, total: number): string {
  if (total === 0 || leads === 0) return 'No leads from here yet this month.';
  const share = leads / total;
  if (share >= 0.5) return 'Brings in at least half of all leads this month.';
  if (share >= 0.25) return 'A strong share of leads this month.';
  if (share >= 0.1) return 'A steady contributor this month.';
  return 'A small slice this month.';
}

export class MarketingService {
  constructor(
    private readonly pool: Pool,
    private readonly crm: CrmReadService,
  ) {}

  async overview(): Promise<{
    data: MarketingPayload;
    parts: SourceMeta[];
  }> {
    const leadsRead = await this.crm.leads();
    const month = new Date().toISOString().slice(0, 7);
    const monthLeads = leadsRead.data.filter((lead) =>
      (lead.Created_Time ?? '').startsWith(month),
    );

    const bySource = new Map<string, number>();
    for (const lead of monthLeads) {
      const source = lead.Lead_Source?.trim() || 'Not set';
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }
    const total = monthLeads.length;
    const channels: MarketingChannelData[] = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([channel, leads]) => ({
        channel,
        leads,
        // Spend lives in Meta and manual sheets until the connector lands.
        spend_bhd: null,
        cpl_display: 'Not tracked yet',
        read: channelRead(leads, total),
      }));

    const leadQuality = this.leadQuality(monthLeads);

    return {
      data: {
        tiles: {
          leads: { value: total, target: await this.leadsTarget(month) },
          lead_quality: leadQuality,
          cpl: null,
          whatsapp_reply_pct: null,
          ig_reach: null,
        },
        channels,
        // Marketing moves are authored by the team; no system source exists
        // yet, so the list stays empty rather than inventing advice.
        moves: [],
      },
      parts: [{ ...leadsRead.meta, reasons: [META_CONNECTOR_REASON] }],
    };
  }

  /** Real lead-quality counts over the same window as the leads tile, drawn
   *  from the single classification source so the UI never re-derives a
   *  status. won is the converted count; qualified is total minus the
   *  not-qualified count; unclassified is the honest tally of leads whose
   *  Zoho status the map does not recognize (see MarketingLeadQuality). */
  private leadQuality(
    monthLeads: Array<{
      Lead_Status: string | null;
      Converted: boolean | null;
    }>,
  ): MarketingLeadQuality {
    let won = 0;
    let notQualified = 0;
    let unclassified = 0;
    for (const lead of monthLeads) {
      const converted =
        lead.Converted === true || lead.Lead_Status === 'Deal Ready';
      const status = normalizeLeadStatus(lead.Lead_Status, converted);
      if (status === 'converted') won += 1;
      if (status === 'not_qualified') notQualified += 1;
      // A non-blank status the map does not know folds into new; count it so
      // qualified is not quietly inflated by an unknown value.
      if (!converted && !isRecognizedLeadStatus(lead.Lead_Status)) {
        unclassified += 1;
      }
    }
    const total = monthLeads.length;
    return { total, qualified: total - notQualified, won, unclassified };
  }

  /** Afaf owns the monthly leads target in kpi_targets. Only metrics that
   *  count leads qualify; cost-per-lead and percentage rows must not leak
   *  in as a count target. Note the definitional gap: the tile value counts
   *  all CRM leads this month while the current target row counts qualified
   *  medical travel leads. Absent row means no target: null, not zero. */
  private async leadsTarget(month: string): Promise<number | null> {
    const { rows } = await this.pool.query<{ target_value: number | string }>(
      `select target_value from kpi_targets
       where period = $1
         and lower(person) like 'afaf%'
         and metric in ('total_leads', 'Qualified medical travel leads')
       order by case when metric = 'total_leads' then 0 else 1 end
       limit 1`,
      [month],
    );
    const raw = rows[0]?.target_value;
    if (raw === undefined || raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
}

// globalThis-pinned singleton: shares the one pool and CRM read service so the
// warm L1 cache and Zoho token are reused across every crm-facing route.
const MARKETING_KEY = '__marketing';

type GlobalWithMarketing = typeof globalThis & {
  [MARKETING_KEY]?: MarketingService;
};

export function getMarketingService(): MarketingService {
  const g = globalThis as GlobalWithMarketing;
  if (!g[MARKETING_KEY]) {
    g[MARKETING_KEY] = new MarketingService(getPool(), getCrmRead());
  }
  return g[MARKETING_KEY];
}

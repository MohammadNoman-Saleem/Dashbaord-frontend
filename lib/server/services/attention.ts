// The attention engine (03 section 9): one rule module per person, pure
// functions over the same cached reads the panels use, never fresh upstream
// calls, at most 3 items in priority order. This is the v1 launch subset:
// every rule below is computable from data the API already reads. Rules the
// spec lists that need sources not yet ported (payment links, creative age,
// Saturday updates, invoices) join in later waves; the engine shape is the
// point. Icon keys match the frontend's icon map: alert, cal, cases, check,
// clock, cpu, flag, funnel, mega, split, user, wallet.
//
// Ported from the NestJS backend src/attention/attention.service.ts. The
// @Injectable class with its @Inject(PG_POOL) Pool, CrmReadService, and
// PipelineService dependencies becomes a plain exported class taking the
// spine accessors: getPool() for the Postgres reads, getCrmRead() for the
// cached CRM reads, and getPipelineService() for the SLA-breach rule. Business
// logic, SQL, and copy are verbatim.
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getPool()/getCrmRead()).
// Never import from a client component.
//
// Patient privacy: every attention item is a plain count/copy line and carries
// NO patient_name / patient_phone / whatsapp_message field, so the per-field
// gate has nothing to append here; the global sweep in handler() remains the
// backstop. Patient identities never enter these strings (provider/deal names
// only), keeping the engine clear of the gated keys by construction.
import type { Pool } from 'pg';
import { getPool } from '../db';
import {
  getCrmRead,
  type CrmReadService,
} from '../crm-read';
import {
  getPipelineService,
  type PipelineService,
} from './pipeline';
import type { SourceMeta } from '../envelope';

export interface AttentionItemData {
  icon: string;
  warn: boolean;
  title: string;
  text: string;
  link: { view: string; tab?: string; focus?: string };
}

interface QualityFlagRow {
  key: string;
  title_plain: string;
  text_plain: string;
  owner_key: string | null;
  due_date: string | null;
  link_view: string | null;
  link_tab: string | null;
  link_focus: string | null;
}

const MAX_ITEMS = 3;
const UNWORKED_REPLY_WINDOW_MIN = 45;

export class AttentionService {
  constructor(
    private readonly pool: Pool,
    private readonly crm: CrmReadService,
    private readonly pipeline: PipelineService,
  ) {}

  async itemsFor(
    person: string,
  ): Promise<{ data: AttentionItemData[]; parts: SourceMeta[] }> {
    const parts: SourceMeta[] = [];
    const items: AttentionItemData[] = [];

    switch (person) {
      case 'khalid': {
        items.push(...(await this.activeQualityFlags()));
        break;
      }
      case 'fatima': {
        const { item, meta } = await this.unworkedLeads();
        if (meta) parts.push(meta);
        if (item) items.push(item);
        break;
      }
      case 'afaf': {
        const { item, meta } = await this.leadsMissingContact();
        if (meta) parts.push(meta);
        if (item) items.push(item);
        break;
      }
      case 'razan': {
        const { item, meta } = await this.providersAwaitingSignoff();
        if (meta) parts.push(meta);
        if (item) items.push(item);
        break;
      }
      case 'aziz': {
        const { item, parts: healthParts } = await this.slaBreaches();
        parts.push(...healthParts);
        if (item) items.push(item);
        break;
      }
      case 'noman': {
        items.push(...(await this.activeQualityFlags('noman')));
        break;
      }
      case 'alsaeed': {
        const item = await this.failedAgents();
        if (item) items.push(item);
        break;
      }
      default:
        break;
    }

    return { data: items.slice(0, MAX_ITEMS), parts };
  }

  private async activeQualityFlags(
    ownerKey?: string,
  ): Promise<AttentionItemData[]> {
    const { rows } = await this.pool.query<QualityFlagRow>(
      `select key, title_plain, text_plain, owner_key, due_date, link_view, link_tab, link_focus
       from data_quality_flags
       where active = true ${ownerKey ? 'and owner_key = $1' : ''}
       order by key`,
      ownerKey ? [ownerKey] : [],
    );
    return rows.map((flag) => ({
      icon: 'alert',
      warn: true,
      title: flag.title_plain,
      text: flag.text_plain,
      link: {
        view: flag.link_view ?? 'agents',
        tab: flag.link_tab ?? undefined,
        focus: flag.link_focus ?? undefined,
      },
    }));
  }

  private async unworkedLeads(): Promise<{
    item: AttentionItemData | null;
    meta: SourceMeta | null;
  }> {
    const read = await this.crm.leads();
    const now = Date.now();
    const count = read.data.filter((l) => {
      if (l.Converted || l.Lead_Status === 'Deal Ready') return false;
      if (!l.Created_Time) return false;
      const ageMin = (now - new Date(l.Created_Time).getTime()) / 60000;
      return ageMin > UNWORKED_REPLY_WINDOW_MIN && ageMin < 48 * 60;
    }).length;
    if (count === 0) return { item: null, meta: read.meta };
    return {
      meta: read.meta,
      item: {
        icon: 'clock',
        warn: true,
        title: `${count} new ${count === 1 ? 'lead is' : 'leads are'} past the reply window`,
        text: 'Logged over 45 minutes ago with no first reply yet. Newest leads convert best inside the hour.',
        link: { view: 'cases', focus: 'morning-list' },
      },
    };
  }

  private async leadsMissingContact(): Promise<{
    item: AttentionItemData | null;
    meta: SourceMeta | null;
  }> {
    const read = await this.crm.leads();
    const count = read.data.filter(
      (l) => !l.Converted && l.Lead_Status !== 'Deal Ready' && !l.Email,
    ).length;
    if (count === 0) return { item: null, meta: read.meta };
    return {
      meta: read.meta,
      item: {
        icon: 'mega',
        warn: false,
        title: `${count} ${count === 1 ? 'lead is' : 'leads are'} missing contact details`,
        text: 'Logged without an email address. Worth fixing at the source form before the list grows.',
        link: { view: 'cases', focus: 'crm-slice' },
      },
    };
  }

  private async providersAwaitingSignoff(): Promise<{
    item: AttentionItemData | null;
    meta: SourceMeta | null;
  }> {
    const read = await this.crm.deals();
    const waiting = read.data.filter(
      (d) =>
        (d.Pipeline === 'Doctor' || d.Pipeline === 'Hospital or Clinic') &&
        d.Stage === 'Final Approval',
    );
    if (waiting.length === 0) return { item: null, meta: read.meta };
    const names = waiting
      .map((d) => d.Deal_Name ?? 'Unnamed provider')
      .slice(0, 3)
      .join(', ');
    return {
      meta: read.meta,
      item: {
        icon: 'user',
        warn: true,
        title: `${waiting.length} provider${waiting.length === 1 ? '' : 's'} awaiting your sign-off`,
        text: `Passed the checklist and waiting at final approval: ${names}.`,
        link: { view: 'cases', focus: 'crm-slice' },
      },
    };
  }

  private async slaBreaches(): Promise<{
    item: AttentionItemData | null;
    parts: SourceMeta[];
  }> {
    const { data, parts } = await this.pipeline.health();
    if (data.items.length === 0) return { item: null, parts };
    const worst = data.items[0];
    return {
      parts,
      item: {
        icon: 'flag',
        warn: true,
        title: `${data.items.length} ${data.items.length === 1 ? 'deal is' : 'deals are'} past an SLA`,
        text: `Worst is ${worst.over_by_days} ${worst.over_by_days === 1 ? 'day' : 'days'} over: ${worst.what}. Each one needs a root-cause look.`,
        link: { view: 'cases', focus: 'running-late' },
      },
    };
  }

  private async failedAgents(): Promise<AttentionItemData | null> {
    const { rows } = await this.pool.query<{ agent_name: string }>(
      `select distinct on (agent_name) agent_name, status
       from agent_runs
       order by agent_name, run_at desc`,
    );
    const failed = rows.filter((r: { agent_name: string; status?: string }) => {
      const status = (r as { status?: string }).status;
      return status === 'error' || status === 'stalled';
    });
    if (failed.length === 0) return null;
    return {
      icon: 'cpu',
      warn: true,
      title: `${failed.length} agent${failed.length === 1 ? '' : 's'} did not finish the last run`,
      text: `${failed
        .map((f) => f.agent_name)
        .slice(0, 3)
        .join(', ')}. The dashboard keeps serving older numbers meanwhile.`,
      link: { view: 'agents' },
    };
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm pg pool, the CRM read cache, and the pipeline service across every
// attention-facing route within one warm instance.
const ATTENTION_KEY = '__attentionService';

type GlobalWithAttention = typeof globalThis & {
  [ATTENTION_KEY]?: AttentionService;
};

export function getAttentionService(): AttentionService {
  const g = globalThis as GlobalWithAttention;
  if (!g[ATTENTION_KEY]) {
    g[ATTENTION_KEY] = new AttentionService(
      getPool(),
      getCrmRead(),
      getPipelineService(),
    );
  }
  return g[ATTENTION_KEY];
}

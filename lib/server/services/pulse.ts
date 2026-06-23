// The heartbeat strip, computed on demand in the V3 severity order (07
// section 4): 1 source outage or reliability failure, 2 Novo funnel
// definition mismatch (until verified fixed), 3 stalled agents, 4 data
// freshness past the stale threshold, 5 lead reconciliation gap. At most
// four blips show; when more exist the fourth becomes a count pointing at
// the agents view. All copy is authored here, server-side.
//
// Ported from the NestJS backend src/pulse/pulse.service.ts. The @Injectable
// PulseService with constructor DI (PG_POOL, CacheService, AgentsService,
// LeadsService) becomes a globalThis-pinned singleton (g.__pulse) reading the
// foundation accessors getPool() and getCache() plus the ported read services
// getAgentsRead() and getLeadsRead(). Logic and DTOs are kept VERBATIM.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';
import { getCache, type CacheService } from '../cache';
import { STALE_BLIP_FACTOR } from '../sources';
import { getAgentsRead, type AgentsReadService } from './agents-read';
import { getLeadsRead, type LeadsReadService } from './leads-read';
import { reconciliationFires } from './leads-read';

export interface PulseBlipData {
  key: string;
  title: string;
  text: string;
  link: { view: string; tab?: string; focus?: string };
  severity: 'outage' | 'quality' | 'agent' | 'staleness' | 'reconciliation';
}

export interface PulsePayload {
  blips: PulseBlipData[];
  steady_count: number;
  /** The standing count for the "n need attention" chip: every active
   *  candidate, shown or hidden behind the cap. */
  attention_count: number;
  updated_at: string;
}

interface QualityFlagRow {
  key: string;
  title_plain: string;
  text_plain: string;
  link_view: string | null;
  link_tab: string | null;
  link_focus: string | null;
}

interface SourceHealthRow {
  source_key: string;
  label: string;
  detail_plain: string | null;
}

const BLIPS_SHOWN = 4;
// Feeds the strip watches: the sources of config/sources.ts plus the
// agent fleet, counted as the spec's twelve monitored feeds.
const MONITORED_FEEDS = 12;

const SOURCE_LABELS: Record<string, string> = {
  adminpanel: 'the admin panel',
  zoho_crm: 'Zoho CRM',
  zoho_books: 'Zoho Books',
  zoho_projects: 'Zoho Projects',
  mixpanel: 'Mixpanel',
  ga4: 'Google Analytics',
  mtl: 'the medical travel leads feed',
  meta: 'Meta Ads',
};

export class PulseService {
  constructor(
    private readonly pool: Pool,
    private readonly cache: CacheService,
    private readonly agents: AgentsReadService,
    private readonly leads: LeadsReadService,
  ) {}

  async pulse(): Promise<PulsePayload> {
    const [outage, quality, agent, staleness, reconciliation] =
      await Promise.all([
        this.outageBlips(),
        this.qualityBlips(),
        this.agentBlips(),
        this.stalenessBlip(),
        this.reconciliationBlips(),
      ]);

    // Severity order is the array order; qualityBlips already puts the
    // Novo mismatch ahead of other quality flags.
    const all = [
      ...outage,
      ...quality,
      ...agent,
      ...staleness,
      ...reconciliation,
    ];
    let blips = all;
    if (all.length > BLIPS_SHOWN) {
      const hidden = all.length - (BLIPS_SHOWN - 1);
      blips = [
        ...all.slice(0, BLIPS_SHOWN - 1),
        {
          key: 'more-signals',
          title: `And ${hidden} more`,
          text: 'More signals are active than fit here. The agents view carries the full list.',
          link: { view: 'agents' },
          severity: all[BLIPS_SHOWN - 1].severity,
        },
      ];
    }

    return {
      blips,
      steady_count: Math.max(0, MONITORED_FEEDS - all.length),
      attention_count: all.length,
      updated_at: new Date().toISOString(),
    };
  }

  /** Severity 1: a connector the 10-minute probe marked as failing. */
  private async outageBlips(): Promise<PulseBlipData[]> {
    const { rows } = await this.pool.query<SourceHealthRow>(
      `select source_key, label, detail_plain
       from source_health
       where status = 'attention'
       order by source_key`,
    );
    return rows.map((row) => ({
      key: `source-${row.source_key}`,
      title: `${row.label} needs attention`,
      text:
        row.detail_plain ??
        `${row.label} is not answering. Its numbers keep showing the last good values with their timestamps.`,
      link: { view: 'agents' },
      severity: 'outage' as const,
    }));
  }

  /** Severity 2: data quality flags, the Novo funnel mismatch first. The
   *  lead_reconciliation flag belongs to severity 5 and is emitted there. */
  private async qualityBlips(): Promise<PulseBlipData[]> {
    const { rows } = await this.pool.query<QualityFlagRow>(
      `select key, title_plain, text_plain, link_view, link_tab, link_focus
       from data_quality_flags
       where active = true and key <> 'lead_reconciliation'
       order by (key <> 'novo_funnel_mismatch'), key`,
    );
    return rows.map((flag) => ({
      key: flag.key,
      title: flag.title_plain,
      text: flag.text_plain,
      link: {
        view: flag.link_view ?? 'agents',
        tab: flag.link_tab ?? undefined,
        focus: flag.link_focus ?? undefined,
      },
      severity: 'quality' as const,
    }));
  }

  /** Severity 3: agents whose last run did not finish. */
  private async agentBlips(): Promise<PulseBlipData[]> {
    const runs = await this.agents.latestRuns();
    return runs
      .filter((run) => run.status === 'error' || run.status === 'stalled')
      .map((run) => ({
        key: `agent-${run.key}`,
        title: `The ${run.label.toLowerCase()} agent did not finish`,
        text: `Its last run (${run.last_run_display}) ended with a problem. The dashboard keeps showing the last good numbers until it runs clean.`,
        link: { view: 'agents' },
        severity: 'agent' as const,
      }));
  }

  /** Severity 4: cache entries past three times their TTL. */
  private async stalenessBlip(): Promise<PulseBlipData[]> {
    const overdue = await this.cache.entriesPastTtl(STALE_BLIP_FACTOR);
    if (overdue.length === 0) return [];

    const sources = [
      ...new Set(
        overdue.map((entry) => {
          const prefix = entry.key.split(':')[0];
          return SOURCE_LABELS[prefix] ?? prefix;
        }),
      ),
    ];
    const n = overdue.length;
    return [
      {
        key: 'stale-feeds',
        title: `${n} data ${n === 1 ? 'feed is' : 'feeds are'} overdue a refresh`,
        text: `${sources.join(', ')} ${sources.length === 1 ? 'has' : 'have'} not refreshed within three times the usual window. The numbers still show, they are just older than normal.`,
        link: { view: 'agents' },
        severity: 'staleness' as const,
      },
    ];
  }

  /** Severity 5: the active campaign's Meta count and Zoho count disagree
   *  past the 24-hour patience window (07 section 4). Reads the cached
   *  leads payload only, never fetches; inert while the Meta token is
   *  pending because reconciliation is null then, plus any
   *  lead_reconciliation quality flag the daily job raised. */
  private async reconciliationBlips(): Promise<PulseBlipData[]> {
    const blips: PulseBlipData[] = [];

    const recon = await this.leads.reconciliationSnapshot();
    if (reconciliationFires(recon) && recon) {
      blips.push({
        key: 'lead-reconciliation',
        title: 'Meta and Zoho disagree on the lead count',
        text: `Meta reports ${recon.meta} leads for the active campaign and Zoho has ${recon.zoho}. The gap has stood for over a day; Aziz owns lead registration verification.`,
        link: { view: 'cases', focus: 'mtl-card' },
        severity: 'reconciliation' as const,
      });
    }

    const { rows } = await this.pool.query<QualityFlagRow>(
      `select key, title_plain, text_plain, link_view, link_tab, link_focus
       from data_quality_flags
       where active = true and key = 'lead_reconciliation'`,
    );
    for (const flag of rows) {
      blips.push({
        key: flag.key,
        title: flag.title_plain,
        text: flag.text_plain,
        link: {
          view: flag.link_view ?? 'cases',
          tab: flag.link_tab ?? undefined,
          focus: flag.link_focus ?? 'mtl-card',
        },
        severity: 'reconciliation' as const,
      });
    }
    return blips;
  }
}

// globalThis-pinned singleton: shares the one pg pool and cache plus the agents
// and leads read singletons, so the warm caches are reused across requests.
const PULSE_KEY = '__pulse';

type GlobalWithPulse = typeof globalThis & {
  [PULSE_KEY]?: PulseService;
};

export function getPulse(): PulseService {
  const g = globalThis as GlobalWithPulse;
  if (!g[PULSE_KEY]) {
    g[PULSE_KEY] = new PulseService(
      getPool(),
      getCache(),
      getAgentsRead(),
      getLeadsRead(),
    );
  }
  return g[PULSE_KEY];
}

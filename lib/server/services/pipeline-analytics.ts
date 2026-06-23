// CRM analytics ported from the legacy dashboard: pipeline staleness,
// per-pipeline month over month, lost value, and stage velocity. Everything
// here is an aggregate over team members, stages, reasons, and sources;
// no deal names or patient names appear in any payload. Computed
// server-side (the legacy staleness card did this in the browser) so the
// web app and the MCP read the same numbers.
//
// Ported from the NestJS backend src/pipeline/pipeline-analytics.service.ts.
// The @Injectable class with its CrmReadService dependency becomes a plain
// exported class taking the spine accessor getCrmRead() for the cached CRM
// reads, exposed as a globalThis-pinned singleton. Business logic and DTOs
// are verbatim. This is distinct from the Phase 1 PipelineService
// (lib/server/services/pipeline.ts), which owns the priority queue and
// running-late list.
//
// No patient identity rows are produced here: the owner breakdowns are CRM
// owner (team-member) names, and the buckets/cross-tabs are counts and BHD
// sums. No PatientSerializer is needed because no row carries patient
// identity; the global sweep in handler() remains the backstop.
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getCrmRead()). Never import
// from a client component.
import {
  getCrmRead,
  type CrmReadService,
  LOST_STAGE,
  PIPELINE_NAMES,
  PIPELINE_STAGES,
  WON_STAGE,
  isOpenDeal,
  type DealRecord,
} from '../crm-read';
import type { SourceMeta } from '../envelope';

const DAY_MS = 24 * 60 * 60 * 1000;

const STALE_AFTER_DAYS = 30;

const BUCKET_DEFS: Array<{
  key: string;
  label: string;
  test: (days: number) => boolean;
}> = [
  { key: 'b0', label: '0 to 7 days', test: (d) => d <= 7 },
  { key: 'b8', label: '8 to 14 days', test: (d) => d >= 8 && d <= 14 },
  { key: 'b15', label: '15 to 30 days', test: (d) => d >= 15 && d <= 30 },
  { key: 'b31', label: 'Over 30 days', test: (d) => d > 30 },
];

export interface StalenessBucketData {
  key: string;
  label: string;
  count: number;
  value_bhd: number;
}

export interface StalenessOwnerRowData {
  owner: string;
  count: number;
  value_bhd: number;
  top_stage: string;
}

export interface StalenessScopeData {
  scope: string;
  label: string;
  buckets: StalenessBucketData[];
  owners: StalenessOwnerRowData[];
}

export interface PipelineStalenessPayload {
  scopes: StalenessScopeData[];
}

export interface MomentumPipelineData {
  pipeline: string;
  total: number;
  this_month: number;
  last_month: number;
  /** Null when last month had no new deals; there is nothing honest to
   *  compare against, so the client says so instead of showing 100%. */
  change_pct: number | null;
  open: number;
  won: number;
  lost: number;
  win_rate_pct: number;
  loss_rate_pct: number;
  total_value_bhd: number;
}

export interface PipelineMomentumPayload {
  /** Server-authored comparison label, e.g. "June so far vs May". */
  compare_label: string;
  pipelines: MomentumPipelineData[];
}

export interface LossMonthData {
  key: string;
  label: string;
  count: number;
  value_bhd: number;
}

export interface LossOwnerRowData {
  owner: string;
  count: number;
  value_bhd: number;
}

export interface LossCrossData {
  sources: string[];
  rows: Array<{ reason: string; counts: number[] }>;
}

export interface PipelineLossesPayload {
  months: LossMonthData[];
  owners: LossOwnerRowData[];
  cross: LossCrossData;
  totals: {
    lost_count: number;
    lost_value_bhd: number;
    top_reason: string | null;
  };
}

export interface VelocityStatsData {
  count: number;
  avg_days: number;
  min_days: number;
  max_days: number;
}

export interface VelocityStageData extends VelocityStatsData {
  name: string;
}

export interface VelocityPipelineData {
  pipeline: string;
  stages: VelocityStageData[];
  /** Created to close for deals sitting in the won stage; null when the
   *  pipeline has no won deals yet. */
  won: VelocityStatsData | null;
  fastest: { name: string; avg_days: number } | null;
  bottleneck: { name: string; avg_days: number } | null;
  open_avg_days: number;
}

export interface PipelineVelocityPayload {
  pipelines: VelocityPipelineData[];
}

function daysSince(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
}

function daysBetween(startIso: string, endIso: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS,
    ),
  );
}

function stats(ages: number[]): VelocityStatsData | null {
  if (ages.length === 0) return null;
  return {
    count: ages.length,
    avg_days: Math.round(ages.reduce((a, b) => a + b, 0) / ages.length),
    min_days: Math.min(...ages),
    max_days: Math.max(...ages),
  };
}

function amountOf(deal: DealRecord): number {
  return Number(deal.Amount) || 0;
}

export class PipelineAnalyticsService {
  constructor(private readonly crm: CrmReadService) {}

  /** Open deals bucketed by days since last update, plus the over-30-days
   *  chase list grouped by owner. One scope per pipeline plus All, so the
   *  client switches scope without refetching. */
  async staleness(): Promise<{
    data: PipelineStalenessPayload;
    parts: SourceMeta[];
  }> {
    const dealsRead = await this.crm.deals();
    const now = Date.now();

    const openDeals = dealsRead.data.filter(isOpenDeal).map((d) => ({
      deal: d,
      staleDays: daysSince(d.Modified_Time ?? d.Created_Time, now),
    }));

    const scopeOf = (scope: string, label: string): StalenessScopeData => {
      const inScope =
        scope === 'all'
          ? openDeals
          : openDeals.filter((x) => x.deal.Pipeline === scope);

      const buckets = BUCKET_DEFS.map((b) => {
        const ds = inScope.filter((x) => b.test(x.staleDays));
        return {
          key: b.key,
          label: b.label,
          count: ds.length,
          value_bhd: Math.round(ds.reduce((s, x) => s + amountOf(x.deal), 0)),
        };
      });

      const byOwner = new Map<
        string,
        { count: number; value: number; stages: Map<string, number> }
      >();
      for (const x of inScope) {
        if (x.staleDays <= STALE_AFTER_DAYS) continue;
        const owner = x.deal.Owner?.name ?? 'Unassigned';
        const entry = byOwner.get(owner) ?? {
          count: 0,
          value: 0,
          stages: new Map<string, number>(),
        };
        entry.count += 1;
        entry.value += amountOf(x.deal);
        const stage = x.deal.Stage ?? 'Unknown';
        entry.stages.set(stage, (entry.stages.get(stage) ?? 0) + 1);
        byOwner.set(owner, entry);
      }
      const owners = [...byOwner.entries()]
        .map(([owner, v]) => ({
          owner,
          count: v.count,
          value_bhd: Math.round(v.value),
          top_stage:
            [...v.stages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '·',
        }))
        .sort((a, b) => b.value_bhd - a.value_bhd || b.count - a.count);

      return { scope, label, buckets, owners };
    };

    return {
      data: {
        scopes: [
          scopeOf('all', 'All pipelines'),
          ...PIPELINE_NAMES.map((p) => scopeOf(p, p)),
        ],
      },
      parts: [dealsRead.meta],
    };
  }

  /** Per-pipeline month over month: new deals this month against last,
   *  alongside the open, won, lost, and value picture. */
  async momentum(): Promise<{
    data: PipelineMomentumPayload;
    parts: SourceMeta[];
  }> {
    const dealsRead = await this.crm.deals();
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const pipelines = PIPELINE_NAMES.map((pipe) => {
      const pDeals = dealsRead.data.filter((d) => d.Pipeline === pipe);
      const wonStage = WON_STAGE[pipe];
      const lostStage = LOST_STAGE[pipe];
      const won = pDeals.filter((d) => d.Stage === wonStage).length;
      const lost = pDeals.filter((d) => d.Stage === lostStage).length;
      const open = pDeals.length - won - lost;
      const inMonth = (d: DealRecord, start: Date, end?: Date): boolean => {
        if (!d.Created_Time) return false;
        const t = new Date(d.Created_Time);
        return t >= start && (end === undefined || t < end);
      };
      const thisM = pDeals.filter((d) => inMonth(d, thisMonthStart)).length;
      const lastM = pDeals.filter((d) =>
        inMonth(d, lastMonthStart, thisMonthStart),
      ).length;
      const value = pDeals.reduce((s, d) => s + amountOf(d), 0);

      return {
        pipeline: pipe,
        total: pDeals.length,
        this_month: thisM,
        last_month: lastM,
        change_pct:
          lastM === 0 ? null : Math.round(((thisM - lastM) / lastM) * 100),
        open,
        won,
        lost,
        win_rate_pct:
          pDeals.length === 0
            ? 0
            : Math.round((won / pDeals.length) * 1000) / 10,
        loss_rate_pct:
          pDeals.length === 0
            ? 0
            : Math.round((lost / pDeals.length) * 1000) / 10,
        total_value_bhd: Math.round(value),
      };
    });

    const monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const prevName = lastMonthStart.toLocaleDateString('en-US', {
      month: 'long',
    });

    return {
      data: {
        compare_label: `${monthName} so far vs ${prevName}`,
        pipelines,
      },
      parts: [dealsRead.meta],
    };
  }

  /** Lost value over time, the owner breakdown, and the loss reason by
   *  lead source cross-tab. Bucketed on close date with last update as the
   *  fallback, matching the legacy loss-reasons convention. */
  async losses(): Promise<{
    data: PipelineLossesPayload;
    parts: SourceMeta[];
  }> {
    const dealsRead = await this.crm.deals();
    const lost = dealsRead.data.filter(
      (d) => d.Stage === LOST_STAGE[d.Pipeline ?? ''],
    );

    const now = new Date();
    const months: LossMonthData[] = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
        label: dt.toLocaleDateString('en-US', { month: 'short' }),
        count: 0,
        value_bhd: 0,
      });
    }
    const monthByKey = new Map(months.map((m) => [m.key, m]));

    const byOwner = new Map<string, { count: number; value: number }>();
    const reasonTotals = new Map<string, number>();
    const sourceTotals = new Map<string, number>();
    const cross = new Map<string, Map<string, number>>();

    for (const d of lost) {
      const lossDate = d.Closing_Date ?? d.Modified_Time ?? d.Created_Time;
      const key = String(lossDate ?? '').slice(0, 7);
      const month = monthByKey.get(key);
      if (month) {
        month.count += 1;
        month.value_bhd += amountOf(d);
      }

      const owner = d.Owner?.name ?? 'Unassigned';
      const entry = byOwner.get(owner) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += amountOf(d);
      byOwner.set(owner, entry);

      const reason = d.Reason_For_Loss__s ?? 'No reason set';
      const source = d.Lead_Source ?? 'Unknown';
      reasonTotals.set(reason, (reasonTotals.get(reason) ?? 0) + 1);
      sourceTotals.set(source, (sourceTotals.get(source) ?? 0) + 1);
      const row = cross.get(reason) ?? new Map<string, number>();
      row.set(source, (row.get(source) ?? 0) + 1);
      cross.set(reason, row);
    }
    for (const m of months) m.value_bhd = Math.round(m.value_bhd);

    const owners = [...byOwner.entries()]
      .map(([owner, v]) => ({
        owner,
        count: v.count,
        value_bhd: Math.round(v.value),
      }))
      .sort((a, b) => b.value_bhd - a.value_bhd || b.count - a.count)
      .slice(0, 8);

    const topReasons = [...reasonTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([r]) => r);
    const topSources = [...sourceTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => s);

    return {
      data: {
        months,
        owners,
        cross: {
          sources: topSources,
          rows: topReasons.map((reason) => ({
            reason,
            counts: topSources.map((s) => cross.get(reason)?.get(s) ?? 0),
          })),
        },
        totals: {
          lost_count: lost.length,
          lost_value_bhd: Math.round(lost.reduce((s, d) => s + amountOf(d), 0)),
          top_reason: topReasons[0] ?? null,
        },
      },
      parts: [dealsRead.meta],
    };
  }

  /** Stage velocity per pipeline: how long open deals have sat in each
   *  stage (approximated by pipeline age, as in the legacy sla route) and
   *  actual created-to-close cycle times for won deals. */
  async velocity(): Promise<{
    data: PipelineVelocityPayload;
    parts: SourceMeta[];
  }> {
    const dealsRead = await this.crm.deals();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const pipelines = PIPELINE_NAMES.map((pipe) => {
      const pDeals = dealsRead.data.filter((d) => d.Pipeline === pipe);
      const wonStage = WON_STAGE[pipe];
      const lostStage = LOST_STAGE[pipe];
      const openDeals = pDeals.filter(
        (d) => d.Stage !== wonStage && d.Stage !== lostStage,
      );

      const agesByStage = new Map<string, number[]>();
      for (const deal of openDeals) {
        const stage = deal.Stage ?? 'Unknown';
        const ages = agesByStage.get(stage) ?? [];
        ages.push(daysSince(deal.Created_Time, now));
        agesByStage.set(stage, ages);
      }

      const stages: VelocityStageData[] = (PIPELINE_STAGES[pipe] ?? []).map(
        (name) => {
          const s = stats(agesByStage.get(name) ?? []);
          return s
            ? { name, ...s }
            : { name, count: 0, avg_days: 0, min_days: 0, max_days: 0 };
        },
      );

      const wonAges = pDeals
        .filter((d) => d.Stage === wonStage && d.Created_Time)
        .map((d) =>
          daysBetween(d.Created_Time as string, d.Closing_Date ?? nowIso),
        );
      const won = stats(wonAges);

      const active = stages.filter((s) => s.count > 0);
      const fastest = active.length
        ? active.reduce((a, b) => (a.avg_days <= b.avg_days ? a : b))
        : null;
      const bottleneck = active.length
        ? active.reduce((a, b) => (a.avg_days >= b.avg_days ? a : b))
        : null;

      const openAges = openDeals.map((d) => daysSince(d.Created_Time, now));
      const openAvg = openAges.length
        ? Math.round(openAges.reduce((a, b) => a + b, 0) / openAges.length)
        : 0;

      return {
        pipeline: pipe,
        stages,
        won,
        fastest: fastest
          ? { name: fastest.name, avg_days: fastest.avg_days }
          : null,
        bottleneck: bottleneck
          ? { name: bottleneck.name, avg_days: bottleneck.avg_days }
          : null,
        open_avg_days: openAvg,
      };
    });

    return { data: { pipelines }, parts: [dealsRead.meta] };
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm CRM read cache across every pipeline-analytics route within one warm
// instance.
const PIPELINE_ANALYTICS_KEY = '__pipelineAnalyticsService';

type GlobalWithPipelineAnalytics = typeof globalThis & {
  [PIPELINE_ANALYTICS_KEY]?: PipelineAnalyticsService;
};

export function getPipelineAnalyticsService(): PipelineAnalyticsService {
  const g = globalThis as GlobalWithPipelineAnalytics;
  if (!g[PIPELINE_ANALYTICS_KEY]) {
    g[PIPELINE_ANALYTICS_KEY] = new PipelineAnalyticsService(getCrmRead());
  }
  return g[PIPELINE_ANALYTICS_KEY];
}

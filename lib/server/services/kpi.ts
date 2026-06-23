// KPI reads and Postgres-only target writes over the shared kpi_targets table
// (legacy columns: person, metric, target_value, current_value, period;
// additive columns label, direction, source, auto_feed, unit, updated_at may be
// null on legacy rows, so every mapping has a derivation fallback). The 06:00
// sync job owns current_value until the cron handover (plan, Wave 3).
//
// Ported from the NestJS backend src/kpi/kpi.service.ts. The @Injectable
// KpiService with an injected PG_POOL and UsersService becomes a plain exported
// class taking the spine accessors: getPool() for the shared pg pool and the
// users.ts module functions (findByKey/listPeople/teamOf) in place of the
// injected UsersService. Business logic, SQL, and DTOs are verbatim; the
// BadRequest/Conflict/Forbidden errors become the foundation HttpError
// subclasses.
//
// SERVER ONLY (pg is Node-only). Never import from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';
import * as users from '../users';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../errors';
import type { RequestViewer } from '../auth/viewer';

export interface KpiStripCardData {
  metric_key: string;
  label: string;
  value_display: string;
  small?: string;
  bar_pct?: number;
  bar_state?: 'default' | 'good' | 'warn';
  note?: string;
  dot?: 'good' | 'warn' | 'mut';
}

export interface TeamSummaryRowData {
  person_key: string;
  name: string;
  pct: number;
  state: 'ahead' | 'behind' | 'on_track';
  summary_display: string;
}

export interface KpiTargetRowData {
  id: string;
  person_key: string;
  person_name: string;
  metric_key: string;
  label: string;
  month: string;
  target: number;
  current: number;
  direction: 'at_least' | 'at_most';
  source: 'auto' | 'manual';
  auto_feed: string | null;
  unit: 'count' | 'bhd' | 'pct';
  updated_at: string;
  can_edit: boolean;
  /** True when GET /api/kpi/drill can list the records behind the number. */
  drillable: boolean;
}

export interface CreateTargetInput {
  person_key: string;
  metric_key?: string;
  label?: string;
  month: string;
  target: number;
  direction?: 'at_least' | 'at_most';
  unit?: 'count' | 'bhd' | 'pct';
  source?: 'auto' | 'manual';
}

export interface TargetRow {
  id: string;
  person: string;
  metric: string;
  target_value: number | string;
  current_value: number | string | null;
  period: string;
  label: string | null;
  direction: string | null;
  source: string | null;
  auto_feed: string | null;
  unit: string | null;
  updated_at: Date | null;
}

interface MapContext {
  viewer: RequestViewer;
  byKey: Map<string, string>;
  byNameLower: Map<string, string>;
  team: Set<string> | null;
}

/** Metric keys the legacy kpi-sync agent fills automatically. */
const AUTO_METRICS = new Set([
  'consultations_booked',
  'consultations_completed',
  'medical_travel_started',
  'providers_contacted',
  'providers_live',
  'revenue',
  'leads_responded_2h',
  'total_leads',
  'b2c_leads',
  'b2b_leads',
  'qualified_leads',
  'medical_travel_leads',
  'ad_campaigns_live',
  'monthly_active_users',
  'homepage_visits',
  'consult_page_visits',
  'discovery_views',
  'platform_uptime',
  'failed_consultations',
  'task_completion_rate',
]);

/** Auto metrics whose underlying record list the drill endpoint can serve
 *  (CRM deals, Zoho Leads, bookings). The Mixpanel-pulled and rate metrics
 *  (uptime, MAU, page visits) have no record list behind them. */
export const DRILLABLE_METRICS = new Set([
  'consultations_booked',
  'consultations_completed',
  'medical_travel_started',
  'medical_travel_leads',
  'providers_contacted',
  'providers_live',
  'total_leads',
  'b2c_leads',
  'b2b_leads',
  'qualified_leads',
  'revenue',
]);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function titleCase(metric: string): string {
  const label = metric.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function guessUnit(metric: string): 'count' | 'bhd' | 'pct' {
  if (metric.includes('revenue')) return 'bhd';
  if (
    metric.includes('rate') ||
    metric.includes('pct') ||
    metric.includes('uptime')
  )
    return 'pct';
  return 'count';
}

function display(value: number, unit: 'count' | 'bhd' | 'pct'): string {
  if (unit === 'bhd') return `BHD ${Math.round(value).toLocaleString('en-US')}`;
  if (unit === 'pct') return `${Math.round(value)}%`;
  return Math.round(value).toLocaleString('en-US');
}

/** "14 / 20", "92 / 95%", "BHD 1,200 / 3,000". */
function summaryDisplay(
  current: number,
  target: number,
  unit: 'count' | 'bhd' | 'pct',
): string {
  const cur = Math.round(current).toLocaleString('en-US');
  const tgt = Math.round(target).toLocaleString('en-US');
  if (unit === 'pct') return `${cur} / ${tgt}%`;
  if (unit === 'bhd') return `BHD ${cur} / ${tgt}`;
  return `${cur} / ${tgt}`;
}

export class KpiService {
  constructor(private readonly pool: Pool) {}

  validMonth(month: string | undefined): string {
    return month && MONTH_RE.test(month) ? month : currentMonth();
  }

  async strip(person: string, month: string): Promise<KpiStripCardData[]> {
    const rows = await this.rowsFor(month);
    const personRows = await this.filterByPerson(rows, person);

    // How far through the month we are decides good vs warn pacing.
    const now = new Date();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const elapsedPct = (now.getDate() / daysInMonth) * 100;

    return personRows.slice(0, 4).map((row) => {
      const target = Number(row.target_value) || 0;
      const current = Number(row.current_value ?? 0);
      const unit =
        (row.unit as 'count' | 'bhd' | 'pct') ?? guessUnit(row.metric);
      const direction = row.direction === 'at_most' ? 'at_most' : 'at_least';
      const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
      const onPace =
        direction === 'at_most'
          ? current <= target
          : pct >= Math.min(elapsedPct, 100) * 0.8;
      return {
        metric_key: row.metric,
        label: row.label ?? titleCase(row.metric),
        value_display: display(current, unit),
        small: `of ${display(target, unit)}`,
        bar_pct: target > 0 ? Math.round(pct) : undefined,
        bar_state: onPace ? 'good' : 'warn',
        note: onPace ? 'On pace for the month' : 'Behind pace for the month',
        dot: onPace ? 'good' : 'warn',
      };
    });
  }

  /** One row per person: their first KPI target that month, paced against
   *  the day of the month. Mirrors the strip's pacing rule: behind below
   *  80% of elapsed pace, ahead at 10 points or more above it. */
  async teamSummary(month: string): Promise<TeamSummaryRowData[]> {
    const rows = await this.rowsFor(month);
    const people = await users.listPeople();

    const now = new Date();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const elapsedPct = Math.min(100, (now.getDate() / daysInMonth) * 100);

    const summaries: TeamSummaryRowData[] = [];
    for (const person of people) {
      const accepted = new Set([person.key, person.name.toLowerCase()]);
      const row = rows.find((r) => accepted.has(r.person.toLowerCase()));
      if (!row) continue;

      const target = Number(row.target_value) || 0;
      const current = Number(row.current_value ?? 0);
      const unit =
        (row.unit as 'count' | 'bhd' | 'pct') ?? guessUnit(row.metric);
      const direction = row.direction === 'at_most' ? 'at_most' : 'at_least';
      const pct =
        target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

      let state: TeamSummaryRowData['state'];
      if (direction === 'at_most') {
        // Lower is better: over the cap is behind, well under it is ahead.
        state =
          current > target
            ? 'behind'
            : pct <= elapsedPct * 0.8
              ? 'ahead'
              : 'on_track';
      } else {
        state =
          pct >= Math.min(elapsedPct + 10, 100)
            ? 'ahead'
            : pct < elapsedPct * 0.8
              ? 'behind'
              : 'on_track';
      }

      const firstName = person.name.split(/\s+/)[0];
      summaries.push({
        person_key: person.key,
        name: `${row.label ?? titleCase(row.metric)} · ${firstName}`,
        pct,
        state,
        summary_display: summaryDisplay(current, target, unit),
      });
    }
    return summaries;
  }

  async targets(
    month: string,
    viewer: RequestViewer,
  ): Promise<KpiTargetRowData[]> {
    const rows = await this.rowsFor(month);
    const ctx = await this.mapContext(viewer);
    return rows.map((row) => this.toRowData(row, ctx));
  }

  /** Single row by id, raw. Null when it no longer exists. */
  async getTarget(id: string): Promise<TargetRow | null> {
    const { rows } = await this.pool.query<TargetRow>(
      `select id, person, metric, target_value, current_value, period,
              label, direction, source, auto_feed, unit, updated_at
       from kpi_targets
       where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Scope rule shared by POST, PATCH, and DELETE: admins touch any row, a
   *  dept head only rows whose person resolves into their team. Everyone
   *  else is refused in plain words. */
  async assertCanEditPerson(
    person: string,
    viewer: RequestViewer,
  ): Promise<void> {
    if (viewer.role === 'admin') return;
    if (viewer.role === 'dept_head') {
      const ctx = await this.mapContext(viewer);
      const personKey = this.resolvePersonKey(person, ctx);
      if (ctx.team?.has(personKey)) return;
      throw new ForbiddenError(
        'You can only change targets on your own team.',
      );
    }
    throw new ForbiddenError(
      'Only admins and department heads can change KPI targets.',
    );
  }

  async assertCanEdit(row: TargetRow, viewer: RequestViewer): Promise<void> {
    return this.assertCanEditPerson(row.person, viewer);
  }

  /** Whether the row's metric fills itself (explicit source column, with
   *  the legacy auto-metric list as the fallback). */
  effectiveSource(row: TargetRow): 'auto' | 'manual' {
    if (row.source === 'auto' || row.source === 'manual') return row.source;
    return AUTO_METRICS.has(row.metric) ? 'auto' : 'manual';
  }

  /** Apply a label or target change. Renaming a row whose effective source
   *  is auto disconnects the feed (source manual, auto_feed null); the UI
   *  warns before sending. updated_at is set inside the UPDATE statement
   *  and the row comes back via RETURNING, so the response always carries
   *  the write time (03 section 14, known issue 1). */
  async updateTarget(
    row: TargetRow,
    patch: { label?: string; target?: number },
    viewer: RequestViewer,
  ): Promise<KpiTargetRowData> {
    const newLabel = patch.label?.trim();
    const currentLabel = row.label ?? titleCase(row.metric);
    const renames = newLabel !== undefined && newLabel !== currentLabel;
    const disconnects = renames && this.effectiveSource(row) === 'auto';

    const { rows } = await this.pool.query<TargetRow>(
      `update kpi_targets
       set label = coalesce($2::text, label),
           target_value = coalesce($3::numeric, target_value),
           source = case when $4::boolean then 'manual' else source end,
           auto_feed = case when $4::boolean then null else auto_feed end,
           updated_at = now()
       where id = $1
       returning id, person, metric, target_value, current_value, period,
                 label, direction, source, auto_feed, unit, updated_at`,
      [row.id, newLabel ?? null, patch.target ?? null, disconnects],
    );
    const ctx = await this.mapContext(viewer);
    return this.toRowData(rows[0], ctx);
  }

  async deleteTarget(id: string): Promise<void> {
    await this.pool.query('delete from kpi_targets where id = $1', [id]);
  }

  /** "Quotes out within 72h" -> "quotes_out_within_72h". */
  private slugifyMetric(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /** Create a row in kpi_targets. The person is stored as the user key
   *  (matching the legacy seeds); one row per person, metric, and month is
   *  enforced both by a pre-check across key and display-name spellings and
   *  by the table's unique constraint, each surfacing as a plain 409. */
  async createTarget(
    input: CreateTargetInput,
    viewer: RequestViewer,
  ): Promise<KpiTargetRowData> {
    const user = await users.findByKey(input.person_key);
    if (!user) {
      throw new BadRequestError(
        `No user is registered with the key ${input.person_key}.`,
      );
    }

    const metric =
      input.metric_key?.trim() || this.slugifyMetric(input.label ?? '');
    if (!/^[a-z0-9][a-z0-9_]{1,79}$/.test(metric)) {
      throw new BadRequestError(
        'The metric needs at least two letters or numbers to make a key.',
      );
    }
    const label = input.label?.trim() || titleCase(metric);

    const source =
      input.source ?? (AUTO_METRICS.has(metric) ? 'auto' : 'manual');
    if (source === 'auto' && !AUTO_METRICS.has(metric)) {
      throw new BadRequestError(
        `${metric} has no automatic feed. Leave source out or send manual.`,
      );
    }

    const conflictMessage = `${user.name} already has a ${label} target for ${input.month}. Edit that row instead.`;
    const dupe = await this.pool.query(
      `select 1 from kpi_targets
       where period = $1 and metric = $2 and lower(person) in ($3, $4)`,
      [input.month, metric, user.key, user.name.toLowerCase()],
    );
    if (dupe.rowCount && dupe.rowCount > 0) {
      throw new ConflictError(conflictMessage);
    }

    let rows: TargetRow[];
    try {
      const result = await this.pool.query<TargetRow>(
        `insert into kpi_targets
           (person, metric, target_value, period, created_by,
            label, direction, source, auto_feed, unit, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         returning id, person, metric, target_value, current_value, period,
                   label, direction, source, auto_feed, unit, updated_at`,
        [
          user.key,
          metric,
          input.target,
          input.month,
          viewer.key,
          label,
          input.direction ?? 'at_least',
          source,
          source === 'auto' ? metric : null,
          input.unit ?? guessUnit(metric),
        ],
      );
      rows = result.rows;
    } catch (err) {
      // Unique (person, metric, period) violation: a concurrent insert won.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictError(conflictMessage);
      }
      throw err;
    }
    const ctx = await this.mapContext(viewer);
    return this.toRowData(rows[0], ctx);
  }

  private async mapContext(viewer: RequestViewer): Promise<MapContext> {
    const people = await users.listPeople();
    return {
      viewer,
      byKey: new Map(people.map((p) => [p.key, p.name])),
      byNameLower: new Map(people.map((p) => [p.name.toLowerCase(), p.key])),
      team:
        viewer.role === 'dept_head'
          ? new Set(await users.teamOf(viewer.key))
          : null,
    };
  }

  /** Legacy rows store person as a display name or a key; resolve either. */
  private resolvePersonKey(person: string, ctx: MapContext): string {
    return (
      ctx.byNameLower.get(person.toLowerCase()) ??
      (ctx.byKey.has(person.toLowerCase()) ? person.toLowerCase() : person)
    );
  }

  private toRowData(row: TargetRow, ctx: MapContext): KpiTargetRowData {
    const personKey = this.resolvePersonKey(row.person, ctx);
    const unit = (row.unit as 'count' | 'bhd' | 'pct') ?? guessUnit(row.metric);
    const source = this.effectiveSource(row);
    const canEdit =
      ctx.viewer.role === 'admin'
        ? true
        : ctx.team
          ? ctx.team.has(personKey)
          : false;
    return {
      id: row.id,
      person_key: personKey,
      person_name: ctx.byKey.get(personKey) ?? row.person,
      metric_key: row.metric,
      label: row.label ?? titleCase(row.metric),
      month: row.period,
      target: Number(row.target_value) || 0,
      current: Number(row.current_value ?? 0),
      direction: row.direction === 'at_most' ? 'at_most' : 'at_least',
      source,
      auto_feed: row.auto_feed ?? (source === 'auto' ? row.metric : null),
      unit,
      updated_at: (row.updated_at ?? new Date()).toISOString(),
      can_edit: canEdit,
      drillable: source === 'auto' && DRILLABLE_METRICS.has(row.metric),
    };
  }

  private async rowsFor(month: string): Promise<TargetRow[]> {
    const { rows } = await this.pool.query<TargetRow>(
      `select id, person, metric, target_value, current_value, period,
              label, direction, source, auto_feed, unit, updated_at
       from kpi_targets
       where period = $1
       order by person, metric`,
      [month],
    );
    return rows;
  }

  /** Legacy rows store person as a name or username; match either. */
  private async filterByPerson(
    rows: TargetRow[],
    person: string,
  ): Promise<TargetRow[]> {
    const user = await users.findByKey(person);
    const accepted = new Set(
      [person.toLowerCase(), user?.name.toLowerCase(), user?.key].filter(
        (v): v is string => Boolean(v),
      ),
    );
    return rows.filter((r) => accepted.has(r.person.toLowerCase()));
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the one pg pool across every kpi-facing route within a warm instance.
const KPI_KEY = '__kpiService';

type GlobalWithKpi = typeof globalThis & {
  [KPI_KEY]?: KpiService;
};

export function getKpiService(): KpiService {
  const g = globalThis as GlobalWithKpi;
  if (!g[KPI_KEY]) {
    g[KPI_KEY] = new KpiService(getPool());
  }
  return g[KPI_KEY];
}

// Reads and status writes over the legacy kpi_deliverables table (columns:
// id, kpi_key, name, category, tier, owner, delivery_partner, deadline,
// status, progress_pct, auto_metric, auto_metric_value, notes, period,
// created_at, updated_at). Additive-only rules apply: the legacy app still
// writes this table, so writes touch existing columns only and stay inside
// the legacy status vocabulary (the table has a check constraint on it).
//
// Status vocabulary map, legacy -> contract:
//   done        -> done
//   in_progress -> in_progress
//   not_started -> needs_start
//   at_risk     -> in_review   (closest contract state: it needs eyes now)
//   deferred    -> needs_start (parked, so it reads as not yet started)
//
// Writes go the other way (contract -> legacy): done -> done, in_progress ->
// in_progress, in_review -> at_risk, needs_start -> not_started. The
// contract's on_track never maps to a legacy state, so it is not settable.
//
// Ported from the NestJS backend src/deliverables/deliverables.service.ts. The
// @Injectable DeliverablesService with an injected PG_POOL and UsersService
// becomes a plain exported class taking the spine accessors: getPool() for the
// shared pg pool and the users.ts functions (listPeople/teamOf) for the edit
// scope. Business logic, SQL, and DTOs are verbatim; ForbiddenException becomes
// ForbiddenError.
//
// SERVER ONLY. Node runtime (pulls in pg via getPool()). Never import from a
// client component.
import { getPool } from '../db';
import { listPeople, teamOf } from '../users';
import { ForbiddenError } from '../errors';
import type { RequestViewer } from '../auth/viewer';

export interface DeliverableRowData {
  id: string;
  title: string;
  owner_keys: string[];
  month: string;
  status: 'done' | 'on_track' | 'in_progress' | 'in_review' | 'needs_start';
  progress_note: string;
  measured_auto: boolean;
  due_date: string | null;
  updated_at: string;
  can_edit: boolean;
}

export interface DeliverableRow {
  id: string;
  name: string;
  owner: string;
  deadline: Date | null;
  status: string;
  progress_pct: number;
  auto_metric: string | null;
  notes: string | null;
  period: string;
  updated_at: Date | null;
}

const STATUS_MAP: Record<string, DeliverableRowData['status']> = {
  done: 'done',
  in_progress: 'in_progress',
  not_started: 'needs_start',
  at_risk: 'in_review',
  deferred: 'needs_start',
};

/** Contract -> legacy, the settable statuses only. */
export const STATUS_WRITE_MAP: Record<string, string> = {
  done: 'done',
  in_progress: 'in_progress',
  in_review: 'at_risk',
  needs_start: 'not_started',
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

interface EditContext {
  viewer: RequestViewer;
  team: Set<string> | null;
  byName: Map<string, string>;
}

export class DeliverablesService {
  validMonth(month: string | undefined): string {
    return month && MONTH_RE.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);
  }

  async list(
    month: string,
    viewer: RequestViewer,
  ): Promise<DeliverableRowData[]> {
    const { rows } = await getPool().query<DeliverableRow>(
      `select id, name, owner, deadline, status, progress_pct,
              auto_metric, notes, period, updated_at
       from kpi_deliverables
       where period = $1
       order by deadline, name`,
      [month],
    );
    const ctx = await this.editContext(viewer);
    return rows.map((row) => this.toRowData(row, ctx));
  }

  /** Single row by id, raw. Null when it no longer exists. */
  async getById(id: string): Promise<DeliverableRow | null> {
    const { rows } = await getPool().query<DeliverableRow>(
      `select id, name, owner, deadline, status, progress_pct,
              auto_metric, notes, period, updated_at
       from kpi_deliverables
       where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Mirror of the KPI targets scope rule: admins edit any row, a dept head
   *  only rows owned by someone on their team. Everyone else is refused in
   *  plain words. */
  async assertCanEdit(
    row: DeliverableRow,
    viewer: RequestViewer,
  ): Promise<void> {
    if (viewer.role === 'admin') return;
    if (viewer.role === 'dept_head') {
      const ctx = await this.editContext(viewer);
      if (this.canEditRow(row, ctx)) return;
      throw new ForbiddenError(
        'You can only update deliverables owned by your own team.',
      );
    }
    throw new ForbiddenError(
      'Only admins and department heads can update deliverables.',
    );
  }

  /** Apply a status change (contract vocabulary, mapped to legacy) and an
   *  optional progress note. updated_at is set inside the UPDATE and the
   *  row comes back via RETURNING, mirroring the targets write. */
  async update(
    row: DeliverableRow,
    patch: { legacyStatus: string; progressNote?: string },
    viewer: RequestViewer,
  ): Promise<DeliverableRowData> {
    const { rows } = await getPool().query<DeliverableRow>(
      `update kpi_deliverables
       set status = $2,
           notes = coalesce($3::text, notes),
           updated_at = now()
       where id = $1
       returning id, name, owner, deadline, status, progress_pct,
                 auto_metric, notes, period, updated_at`,
      [row.id, patch.legacyStatus, patch.progressNote?.trim() || null],
    );
    const ctx = await this.editContext(viewer);
    return this.toRowData(rows[0], ctx);
  }

  private async editContext(viewer: RequestViewer): Promise<EditContext> {
    const people = await listPeople();
    return {
      viewer,
      byName: new Map(people.map((p) => [p.name.toLowerCase(), p.key])),
      team:
        viewer.role === 'dept_head'
          ? new Set(await teamOf(viewer.key))
          : null,
    };
  }

  private canEditRow(row: DeliverableRow, ctx: EditContext): boolean {
    if (ctx.viewer.role === 'admin') return true;
    if (!ctx.team) return false;
    return this.ownerKeys(row.owner, ctx.byName).some((key) =>
      ctx.team?.has(key),
    );
  }

  private toRowData(row: DeliverableRow, ctx: EditContext): DeliverableRowData {
    return {
      id: row.id,
      title: row.name,
      owner_keys: this.ownerKeys(row.owner, ctx.byName),
      month: row.period,
      status: STATUS_MAP[row.status] ?? 'needs_start',
      progress_note:
        row.notes?.trim() || `${Number(row.progress_pct) || 0}% complete.`,
      measured_auto: row.auto_metric !== null,
      due_date: row.deadline
        ? new Date(row.deadline).toISOString().slice(0, 10)
        : null,
      updated_at: (row.updated_at ?? new Date()).toISOString(),
      can_edit: this.canEditRow(row, ctx),
    };
  }

  /** Legacy rows store full names ("Mohammad Noman"), sometimes several
   *  separated by commas, while users.name holds the short name ("Noman").
   *  Match the whole name, then any single token, then fall back to the
   *  last token lowercased so unknown owners still render something stable. */
  private ownerKeys(owner: string, byName: Map<string, string>): string[] {
    return owner
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((name) => {
        const lower = name.toLowerCase();
        const whole = byName.get(lower);
        if (whole) return whole;
        const tokens = lower.split(/\s+/);
        for (const token of tokens) {
          const hit = byName.get(token);
          if (hit) return hit;
        }
        return tokens[tokens.length - 1];
      });
  }
}

// Singleton instance for the route handlers, mirroring the other service
// modules (e.g. cockpitService).
export const deliverablesService = new DeliverablesService();

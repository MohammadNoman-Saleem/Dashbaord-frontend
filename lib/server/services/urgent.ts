// Urgent items board. Reads and human writes over the legacy urgent_items
// table (shared with the still-running old dashboard, additive-only rules
// apply). DTO maps legacy columns to the contract: title -> text,
// created_by -> raised_by. Agent-raised items keep their source_key dedupe
// semantics via the separate createUrgentItem port (Wave 3); human adds
// here carry no source_key, exactly like the legacy /api/urgent route.
//
// Ported verbatim from the NestJS backend src/urgent/urgent.service.ts. The
// @Injectable DI class becomes a globalThis-pinned singleton accessed via
// getUrgentService(); the pg Pool is read from db.ts rather than injected, and
// NotFoundException becomes the foundation NotFoundError. The query text,
// column mapping, RESOLVED_SHOWN cap, name resolution and fallback are kept
// unchanged. urgent_items carries no patient PII, so there is no per-field gate
// here; the handler's global sweep is the backstop.
//
// SERVER ONLY (pg).
import type { Pool } from 'pg';
import { getPool } from '../db';
import { NotFoundError } from '../errors';

export interface UrgentItemRecord {
  id: string;
  text: string;
  raised_by: string;
  raised_by_name: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface UrgentRow {
  id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  created_at: Date;
  resolved: boolean;
  resolved_at: Date | null;
  resolved_by: string | null;
}

const RESOLVED_SHOWN = 15;

export class UrgentService {
  constructor(private readonly pool: Pool) {}

  async board(): Promise<{
    open: UrgentItemRecord[];
    resolved: UrgentItemRecord[];
  }> {
    const { rows } = await this.pool.query<UrgentRow>(
      `select id, title, description, created_by, created_at, resolved, resolved_at, resolved_by
       from urgent_items
       order by created_at desc
       limit 200`,
    );
    const names = await this.nameMap(rows);
    const mapped = rows.map((r) => this.toRecord(r, names));
    return {
      open: mapped.filter((r) => r.resolved_at === null),
      resolved: mapped
        .filter((r) => r.resolved_at !== null)
        .slice(0, RESOLVED_SHOWN),
    };
  }

  async add(text: string, raisedBy: string): Promise<UrgentItemRecord> {
    const { rows } = await this.pool.query<UrgentRow>(
      `insert into urgent_items (title, created_by, resolved)
       values ($1, $2, false)
       returning id, title, description, created_by, created_at, resolved, resolved_at, resolved_by`,
      [text, raisedBy],
    );
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  async resolve(id: string, resolvedBy: string): Promise<UrgentItemRecord> {
    const { rows } = await this.pool.query<UrgentRow>(
      `update urgent_items
       set resolved = true, resolved_at = now(), resolved_by = $2
       where id = $1
       returning id, title, description, created_by, created_at, resolved, resolved_at, resolved_by`,
      [id, resolvedBy],
    );
    if (rows.length === 0) {
      throw new NotFoundError('That urgent item no longer exists.');
    }
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  async openItem(id: string): Promise<UrgentItemRecord | null> {
    const { rows } = await this.pool.query<UrgentRow>(
      `select id, title, description, created_by, created_at, resolved, resolved_at, resolved_by
       from urgent_items where id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  private toRecord(
    row: UrgentRow,
    names: Map<string, string>,
  ): UrgentItemRecord {
    const raisedBy = row.created_by ?? 'unknown';
    return {
      id: row.id,
      text: row.description ? `${row.title}. ${row.description}` : row.title,
      raised_by: raisedBy,
      raised_by_name: names.get(raisedBy) ?? this.fallbackName(raisedBy),
      created_at: new Date(row.created_at).toISOString(),
      resolved_at: row.resolved_at
        ? new Date(row.resolved_at).toISOString()
        : null,
      resolved_by: row.resolved_by,
    };
  }

  /** Legacy rows store usernames; resolve display names where we know them. */
  private async nameMap(rows: UrgentRow[]): Promise<Map<string, string>> {
    const keys = [
      ...new Set(rows.flatMap((r) => (r.created_by ? [r.created_by] : []))),
    ];
    const map = new Map<string, string>();
    if (keys.length === 0) return map;
    const { rows: users } = await this.pool.query<{
      key: string;
      name: string;
    }>('select key, name from users where key = any($1)', [keys]);
    for (const u of users) map.set(u.key, u.name);
    return map;
  }

  private fallbackName(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

const URGENT_KEY = '__saleem_urgent__';

type GlobalWithUrgent = typeof globalThis & { [URGENT_KEY]?: UrgentService };

export function getUrgentService(): UrgentService {
  const g = globalThis as GlobalWithUrgent;
  if (!g[URGENT_KEY]) {
    g[URGENT_KEY] = new UrgentService(getPool());
  }
  return g[URGENT_KEY];
}

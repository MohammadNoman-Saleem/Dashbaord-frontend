// Blockers board (07 sections 1 and 3). Mirrors the urgent items pattern:
// internal Postgres reads, uncached, every write audited by the route. The
// updated_at rule from the known-issues register applies from day one: every
// write returns the row it changed, so the next read reflects fresh timestamps
// immediately.
//
// Ported from the NestJS backend src/blockers/blockers.service.ts and
// src/blockers/similarity.ts. The @Injectable class with its @Inject(PG_POOL)
// Pool becomes a plain exported class taking getPool(); the repeat-detection
// helpers are folded in here so the service is self-contained. SQL, copy, and
// business logic are verbatim. The OpsRaiseService Zoho write leg is DEFERRED
// and is NOT ported.
//
// SERVER ONLY. Node runtime (pulls in pg via getPool()). Never import from a
// client component.
//
// Patient privacy: blocker rows carry no patient_name / patient_phone /
// whatsapp_message field by construction (free text raised by a person, plus
// the raiser's own key/name), so the per-field gate has nothing to append; the
// global sweep in handler() remains the backstop.
import type { Pool } from 'pg';
import { getPool } from '../db';
import { ConflictError, NotFoundError } from '../errors';

// ---------------------------------------------------------------------------
// Repeat detection (07 section 3). Deviation from 07, build lead decision:
// trigram similarity in Postgres needs the pg_trgm extension, which is not
// enabled; this runs app-side as character-bigram Dice similarity with the
// same 0.6 threshold. Cheap and imperfect is fine per the spec; Aziz can set or
// clear the flag manually via PATCH.
// ---------------------------------------------------------------------------

export const REPEAT_THRESHOLD = 0.6;

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeBlockerText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient over character bigrams of the normalized texts: in
 *  [0, 1], 1 for identical wording, robust to small edits. */
export function bigramDice(a: string, b: string): number {
  const na = normalizeBlockerText(a);
  const nb = normalizeBlockerText(b);
  if (na === nb) return na.length > 0 ? 1 : 0;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  let totalA = 0;
  for (const [gram, n] of ga) {
    totalA += n;
    const m = gb.get(gram);
    if (m) overlap += Math.min(n, m);
  }
  let totalB = 0;
  for (const n of gb.values()) totalB += n;
  return (2 * overlap) / (totalA + totalB);
}

// ---------------------------------------------------------------------------
// Blockers service
// ---------------------------------------------------------------------------

export interface BlockerRecord {
  id: string;
  text: string;
  waiting_on: string | null;
  raised_by: string;
  raised_by_name: string;
  raised_at: string;
  age_label: string;
  status: 'open' | 'unblocked' | 'withdrawn';
  repeat_of: string | null;
  root_cause_flag: boolean;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  /** Zoho task id when this blocker was raised as an Ops item (dual write);
   *  null for plain blockers and IT-raised items. */
  zoho_task_id: string | null;
}

export interface BlockersBoard {
  open: BlockerRecord[];
  resolved: BlockerRecord[];
}

export interface SaturdayGroup {
  raised_by: string;
  raised_by_name: string;
  items: BlockerRecord[];
}

interface BlockerRow {
  id: string;
  raised_by: string;
  text: string;
  waiting_on: string | null;
  status: string;
  raised_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
  repeat_of: string | null;
  root_cause_flag: boolean;
  week_key: string;
  zoho_task_id: string | null;
}

const ROW_FIELDS = `id, raised_by, text, waiting_on, status, raised_at,
       resolved_at, resolved_by, resolution_note, repeat_of, root_cause_flag, week_key, zoho_task_id`;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const REPEAT_LOOKBACK_DAYS = 60;

// Bahrain is UTC+3 with no daylight saving, the same offset the cockpit SLA
// helpers use. raised_at defaults to the DB's UTC now(), so the week key is
// derived from the Bahrain calendar date for the same instant; otherwise a
// blocker raised late at night on a non-Bahrain server could land in the wrong
// ISO week.
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;

/** ISO week key of an instant on the Bahrain calendar, e.g. 2026-W24. */
export function isoWeekKey(d: Date): string {
  const bahrain = new Date(d.getTime() + BAHRAIN_OFFSET_MS);
  const date = new Date(
    Date.UTC(
      bahrain.getUTCFullYear(),
      bahrain.getUTCMonth(),
      bahrain.getUTCDate(),
    ),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function ageLabel(raisedAt: Date, now: number): string {
  const diff = Math.max(0, now - raisedAt.getTime());
  if (diff < HOUR_MS) return `${Math.max(1, Math.floor(diff / MINUTE_MS))}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
  return `${Math.floor(diff / DAY_MS)}d`;
}

export class BlockersService {
  constructor(private readonly pool: Pool) {}

  /** Open blockers newest first, plus everything resolved in the last
   *  7 days. */
  async board(): Promise<BlockersBoard> {
    const { rows } = await this.pool.query<BlockerRow>(
      `select ${ROW_FIELDS}
       from blockers
       where status = 'open'
          or resolved_at >= now() - interval '7 days'
       order by raised_at desc`,
    );
    const names = await this.nameMap(rows);
    const mapped = rows.map((r) => this.toRecord(r, names));
    return {
      open: mapped.filter((r) => r.status === 'open'),
      resolved: mapped.filter((r) => r.status !== 'open'),
    };
  }

  /** Create a blocker with repeat detection over the last 60 days of
   *  blockers from every raiser: at 0.6 bigram Dice similarity or above the
   *  new row points at the prior one and the root cause flag goes up. */
  async create(
    text: string,
    waitingOn: string | null,
    raisedBy: string,
    zohoTaskId: string | null = null,
  ): Promise<BlockerRecord> {
    const { rows: priors } = await this.pool.query<{
      id: string;
      text: string;
    }>(
      `select id, text from blockers
       where raised_at >= now() - ($1 || ' days')::interval
       order by raised_at desc`,
      [REPEAT_LOOKBACK_DAYS],
    );
    let repeatOf: string | null = null;
    let bestScore = 0;
    for (const prior of priors) {
      const score = bigramDice(text, prior.text);
      if (score >= REPEAT_THRESHOLD && score > bestScore) {
        bestScore = score;
        repeatOf = prior.id;
      }
    }

    const { rows } = await this.pool.query<BlockerRow>(
      `insert into blockers (raised_by, text, waiting_on, repeat_of, root_cause_flag, week_key, zoho_task_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${ROW_FIELDS}`,
      [
        raisedBy,
        text,
        waitingOn,
        repeatOf,
        repeatOf !== null,
        isoWeekKey(new Date()),
        zohoTaskId,
      ],
    );
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  async byId(id: string): Promise<BlockerRecord | null> {
    const { rows } = await this.pool.query<BlockerRow>(
      `select ${ROW_FIELDS} from blockers where id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  /** Resolve an open blocker as unblocked or withdrawn. Refuses rows that
   *  are already resolved so a second click cannot rewrite history. */
  async resolve(
    id: string,
    status: 'unblocked' | 'withdrawn',
    resolvedBy: string,
    resolutionNote: string | null,
  ): Promise<BlockerRecord> {
    const { rows } = await this.pool.query<BlockerRow>(
      `update blockers
       set status = $2, resolved_at = now(), resolved_by = $3, resolution_note = $4
       where id = $1 and status = 'open'
       returning ${ROW_FIELDS}`,
      [id, status, resolvedBy, resolutionNote],
    );
    if (rows.length === 0) {
      const existing = await this.byId(id);
      if (!existing)
        throw new NotFoundError('That blocker no longer exists.');
      throw new ConflictError('That blocker is already resolved.');
    }
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  async setRootCauseFlag(id: string, value: boolean): Promise<BlockerRecord> {
    const { rows } = await this.pool.query<BlockerRow>(
      `update blockers set root_cause_flag = $2
       where id = $1
       returning ${ROW_FIELDS}`,
      [id, value],
    );
    if (rows.length === 0)
      throw new NotFoundError('That blocker no longer exists.');
    const names = await this.nameMap(rows);
    return this.toRecord(rows[0], names);
  }

  /** Open blockers grouped by raiser for one ISO week, consumed by the
   *  Saturday 19:30 brief job and the weekly update draft. */
  async saturday(week: string): Promise<{
    week: string;
    groups: SaturdayGroup[];
  }> {
    const { rows } = await this.pool.query<BlockerRow>(
      `select ${ROW_FIELDS}
       from blockers
       where status = 'open' and week_key = $1
       order by raised_by, raised_at desc`,
      [week],
    );
    const names = await this.nameMap(rows);
    const groups = new Map<string, SaturdayGroup>();
    for (const row of rows) {
      const record = this.toRecord(row, names);
      const group = groups.get(row.raised_by) ?? {
        raised_by: row.raised_by,
        raised_by_name: record.raised_by_name,
        items: [],
      };
      group.items.push(record);
      groups.set(row.raised_by, group);
    }
    return { week, groups: [...groups.values()] };
  }

  private toRecord(row: BlockerRow, names: Map<string, string>): BlockerRecord {
    return {
      id: row.id,
      text: row.text,
      waiting_on: row.waiting_on,
      raised_by: row.raised_by,
      raised_by_name:
        names.get(row.raised_by) ??
        row.raised_by.charAt(0).toUpperCase() + row.raised_by.slice(1),
      raised_at: new Date(row.raised_at).toISOString(),
      age_label: ageLabel(new Date(row.raised_at), Date.now()),
      status: row.status as BlockerRecord['status'],
      repeat_of: row.repeat_of,
      root_cause_flag: row.root_cause_flag,
      resolution_note: row.resolution_note,
      resolved_at: row.resolved_at
        ? new Date(row.resolved_at).toISOString()
        : null,
      resolved_by: row.resolved_by,
      zoho_task_id: row.zoho_task_id,
    };
  }

  private async nameMap(rows: BlockerRow[]): Promise<Map<string, string>> {
    const keys = [...new Set(rows.map((r) => r.raised_by))];
    const map = new Map<string, string>();
    if (keys.length === 0) return map;
    const { rows: users } = await this.pool.query<{
      key: string;
      name: string;
    }>('select key, name from users where key = any($1)', [keys]);
    for (const u of users) map.set(u.key, u.name);
    return map;
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// one BlockersService (and its pool reference) across every blockers-facing
// route within one warm instance.
const BLOCKERS_KEY = '__blockersService';

type GlobalWithBlockers = typeof globalThis & {
  [BLOCKERS_KEY]?: BlockersService;
};

export function getBlockersService(): BlockersService {
  const g = globalThis as GlobalWithBlockers;
  if (!g[BLOCKERS_KEY]) {
    g[BLOCKERS_KEY] = new BlockersService(getPool());
  }
  return g[BLOCKERS_KEY];
}

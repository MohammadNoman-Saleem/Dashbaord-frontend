// Append-only audit trail. Ported from the NestJS backend
// src/audit/audit.service.ts with the same contract: NEVER throws, failures are
// logged so the parent mutation is not blocked. Every write endpoint calls
// this. The @Injectable DI class becomes a globalThis-pinned singleton accessed
// via getAudit(); the pool is read from db.ts rather than injected.
//
// Table shape is the legacy audit_log: ts default now(), actor, actor_role,
// action, entity_type, entity_id, before, after, context.
//
// SERVER ONLY. Keep patient names out of the before/after/context payloads at
// the call sites; the audit row is not scrubbed.
import type { Pool } from 'pg';
import { getPool } from './db';

export interface AuditEntry {
  actor?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | number | null;
  before?: unknown;
  after?: unknown;
  context?: unknown;
}

export class AuditService {
  constructor(private readonly pool: Pool) {}

  async log(entry: AuditEntry): Promise<boolean> {
    if (!entry.action || !entry.entity_type) {
      console.warn('audit entry missing action or entity_type, dropped');
      return false;
    }
    try {
      await this.pool.query(
        `insert into audit_log (actor, actor_role, action, entity_type, entity_id, before, after, context)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.actor ?? null,
          entry.actor_role ?? null,
          entry.action,
          entry.entity_type,
          entry.entity_id == null ? null : String(entry.entity_id),
          entry.before == null ? null : JSON.stringify(entry.before),
          entry.after == null ? null : JSON.stringify(entry.after),
          entry.context == null ? null : JSON.stringify(entry.context),
        ],
      );
      return true;
    } catch (err) {
      console.warn(
        `audit insert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}

const AUDIT_KEY = '__saleem_audit__';

type GlobalWithAudit = typeof globalThis & { [AUDIT_KEY]?: AuditService };

export function getAudit(): AuditService {
  const g = globalThis as GlobalWithAudit;
  if (!g[AUDIT_KEY]) {
    g[AUDIT_KEY] = new AuditService(getPool());
  }
  return g[AUDIT_KEY];
}

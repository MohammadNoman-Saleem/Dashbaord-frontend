// Cockpit patient notes service. Reads and human writes over the new
// case_notes table (migration 0023), reached through the shared service-role
// pool. Postgres-only: no Zoho write, no write-gate, no sign-off. Mirrors the
// urgent_items service shape (a globalThis-pinned singleton via getCaseNotes()).
//
// PRIVACY (NHRA, compliance-critical): a note body is case-manager working text
// that may contain patient detail, so the routes gate read and write to viewers
// with sees_patient_names. This service never logs a note body or an author
// name; only the count/id paths surface, and even those stay in the route's
// audit row (action + ids), never in console output.
//
// Soft delete: an author may remove their own note; a manager (admin or
// dept_head) may remove anyone's. Anyone else gets ForbiddenError.
//
// SERVER ONLY (pg).
import type { Pool } from 'pg';
import { getPool } from '../db';
import { ForbiddenError, NotFoundError } from '../errors';
import type { RequestViewer } from '../auth/viewer';

/** The note shape the routes return. No author_key leaks to the client; the
 *  display name is resolved here, and `mine` carries the author identity the UI
 *  needs without exposing other users' keys. */
export interface CaseNote {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
  mine: boolean;
}

interface CaseNoteRow {
  id: string;
  zoho_id: string;
  author_key: string;
  body: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export class CaseNotesService {
  constructor(private readonly pool: Pool) {}

  /** Active notes for a case, newest first, mapped for the given viewer. */
  async listForCase(zohoId: string, viewer: RequestViewer): Promise<CaseNote[]> {
    const { rows } = await this.pool.query<CaseNoteRow>(
      `select id, zoho_id, author_key, body, created_at, updated_at, deleted_at
       from case_notes
       where zoho_id = $1 and deleted_at is null
       order by created_at desc`,
      [zohoId],
    );
    const names = await this.nameMap(rows.map((r) => r.author_key));
    return rows.map((r) => this.toNote(r, names, viewer));
  }

  /** Insert a note and return it mapped for the author. */
  async add(input: {
    zohoId: string;
    authorKey: string;
    body: string;
  }): Promise<CaseNote> {
    const { rows } = await this.pool.query<CaseNoteRow>(
      `insert into case_notes (zoho_id, author_key, body)
       values ($1, $2, $3)
       returning id, zoho_id, author_key, body, created_at, updated_at, deleted_at`,
      [input.zohoId, input.authorKey, input.body],
    );
    const names = await this.nameMap([input.authorKey]);
    // The viewer adding is, by definition, the author; pass a minimal viewer
    // shape so `mine` is true without a second lookup.
    return this.toNote(rows[0], names, { key: input.authorKey } as RequestViewer);
  }

  /** Soft-delete a note. Allowed for the author or a manager (admin/dept_head);
   *  otherwise ForbiddenError. Returns the id of the removed note. */
  async softDelete(input: {
    noteId: string;
    viewer: RequestViewer;
  }): Promise<{ id: string }> {
    const { rows } = await this.pool.query<{ id: string; author_key: string }>(
      `select id, author_key from case_notes
       where id = $1 and deleted_at is null`,
      [input.noteId],
    );
    const existing = rows[0];
    if (!existing) {
      throw new NotFoundError('That note no longer exists.');
    }

    const isAuthor = existing.author_key === input.viewer.key;
    const isManager =
      input.viewer.role === 'admin' || input.viewer.role === 'dept_head';
    if (!isAuthor && !isManager) {
      throw new ForbiddenError('You can only remove your own notes.');
    }

    await this.pool.query(
      `update case_notes
       set deleted_at = now(), updated_at = now()
       where id = $1 and deleted_at is null`,
      [input.noteId],
    );
    return { id: existing.id };
  }

  private toNote(
    row: CaseNoteRow,
    names: Map<string, string>,
    viewer: RequestViewer,
  ): CaseNote {
    return {
      id: row.id,
      body: row.body,
      author_name: names.get(row.author_key) ?? this.fallbackName(row.author_key),
      created_at: new Date(row.created_at).toISOString(),
      mine: row.author_key === viewer.key,
    };
  }

  /** Resolve display names for author keys from the users table. */
  private async nameMap(keys: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(keys.filter(Boolean))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const { rows } = await this.pool.query<{ key: string; name: string }>(
      'select key, name from users where key = any($1)',
      [unique],
    );
    for (const u of rows) map.set(u.key, u.name);
    return map;
  }

  private fallbackName(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

const CASE_NOTES_KEY = '__saleem_case_notes__';

type GlobalWithCaseNotes = typeof globalThis & {
  [CASE_NOTES_KEY]?: CaseNotesService;
};

export function getCaseNotes(): CaseNotesService {
  const g = globalThis as GlobalWithCaseNotes;
  if (!g[CASE_NOTES_KEY]) {
    g[CASE_NOTES_KEY] = new CaseNotesService(getPool());
  }
  return g[CASE_NOTES_KEY];
}

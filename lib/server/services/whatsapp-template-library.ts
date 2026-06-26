// WhatsApp template library service. A Supabase-backed, editable library of
// WhatsApp message templates the team manages in-app. On a patient case, the
// case manager picks a template; the app fills the placeholders and opens
// WhatsApp through a click-to-chat deep link (wa.me) with the patient's number
// and the message pre-typed, then the manager presses send. There is NO
// automated sending and NO WhatsApp API.
//
// PRIVACY (NHRA): templates carry NO patient data. A body holds only fixed copy
// plus {{first_name}}/{{full_name}} placeholders, rendered client-side from the
// case's patient name at send time. There is no per-field gate here; the
// handler's global sweep is the backstop.
//
// NOTE: this is the NEW editable library. The legacy hardcoded first-contact
// greeting lives in a separate module (lib/server/services/whatsapp-templates.ts,
// route /api/whatsapp/template/first_contact) and is untouched by this service.
//
// Mirrors the ProviderBoard service structure: a pg pool via getPool(), a
// globalThis-pinned singleton accessed via getWhatsappTemplateLibrary().
//
// SERVER ONLY (pg).
import type { Pool } from 'pg';
import { getPool } from '../db';
import { NotFoundError } from '../errors';

// One template as the library exposes it to the client: identity plus the
// editable copy. The actor and timestamps stay server-side.
export interface WhatsappTemplate {
  id: string;
  title: string;
  body: string;
}

export class WhatsappTemplateLibraryService {
  constructor(private readonly pool: Pool) {}

  /** Active templates (removed_at is null), ordered by title. */
  async list(): Promise<WhatsappTemplate[]> {
    const { rows } = await this.pool.query<WhatsappTemplate>(
      `select id, title, body
       from whatsapp_templates
       where removed_at is null
       order by title asc`,
    );
    return rows;
  }

  /** Add a template. Returns the new row id. */
  async create(title: string, body: string, by: string): Promise<{ id: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into whatsapp_templates (title, body, created_by)
       values ($1, $2, $3)
       returning id`,
      [title, body, by],
    );
    return { id: rows[0].id };
  }

  /** Edit an active template's title and body. NotFoundError when the row is
   *  missing or already removed. Returns the row id. */
  async update(id: string, title: string, body: string): Promise<{ id: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update whatsapp_templates
       set title = $2, body = $3, updated_at = now()
       where id = $1 and removed_at is null
       returning id`,
      [id, title, body],
    );
    if (rows.length === 0) {
      throw new NotFoundError('That template no longer exists.');
    }
    return { id: rows[0].id };
  }

  /** Soft-remove a template (set removed_at). NotFoundError when the row is
   *  missing or already removed. Returns the row id. */
  async remove(id: string): Promise<{ id: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update whatsapp_templates
       set removed_at = now()
       where id = $1 and removed_at is null
       returning id`,
      [id],
    );
    if (rows.length === 0) {
      throw new NotFoundError('That template no longer exists.');
    }
    return { id: rows[0].id };
  }
}

const WHATSAPP_TEMPLATE_LIBRARY_KEY = '__saleem_whatsapp_template_library__';

type GlobalWithWhatsappTemplateLibrary = typeof globalThis & {
  [WHATSAPP_TEMPLATE_LIBRARY_KEY]?: WhatsappTemplateLibraryService;
};

export function getWhatsappTemplateLibrary(): WhatsappTemplateLibraryService {
  const g = globalThis as GlobalWithWhatsappTemplateLibrary;
  if (!g[WHATSAPP_TEMPLATE_LIBRARY_KEY]) {
    g[WHATSAPP_TEMPLATE_LIBRARY_KEY] = new WhatsappTemplateLibraryService(
      getPool(),
    );
  }
  return g[WHATSAPP_TEMPLATE_LIBRARY_KEY];
}

// Zoho CRM Notes reader. Notes live as a related-list on each Deal/Lead record
// in Zoho CRM. This service fetches that related list READ-ONLY through the
// read-scoped getZohoClient().get(...) and maps the v3 Note shape to the shape
// the cockpit renders. There is no write path here: notes are authored in Zoho,
// and the cockpit only displays them.
//
// PRIVACY (NHRA): a note body is case-manager working text that may carry
// patient detail. This module never logs the body, the title, or any patient
// identity; the route that calls it gates access to name-seers and the
// handler's global PII sweep is the backstop. Keep it that way.
//
// SERVER ONLY. Node runtime (the read client pulls in the auth/token path).
import { getZohoClient } from '@/lib/server/integrations/zoho/client';

// The read client's get() takes a FULL url (it does not prepend a base); every
// caller builds it from this CRM v3 root, same constant the other read services
// use. Notes are a CRM-only related list, so this is always the CRM host.
const CRM = 'https://www.zohoapis.com/crm/v3';

/** The Zoho CRM module a record belongs to. Notes hang off Deals and Leads. */
export type NoteModule = 'Deals' | 'Leads';

/** A cockpit-facing note. Mapped from the Zoho v3 Notes record; newest first.
 *  Defined locally (contract.ts / keys.ts are off-limits). */
export interface CaseNote {
  id: string;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
}

// The raw v3 Notes record we read. Only the fields we request are relied on.
interface ZohoNote {
  id?: string;
  Note_Title?: string | null;
  Note_Content?: string | null;
  Created_Time?: string | null;
  Created_By?: { name?: string | null } | null;
}

interface ZohoNotesResponse {
  data?: ZohoNote[];
}

/** List the Notes related-list for one CRM record, newest first.
 *  GET crm/v3/{module}/{recordId}/Notes with sort_by=Created_Time desc and the
 *  four fields we map. Zoho answers 204 (empty body -> get() returns {}) when
 *  the record has no notes; that maps to an empty array. */
export async function listForRecord(
  module: NoteModule,
  recordId: string,
): Promise<CaseNote[]> {
  const res = await getZohoClient().get<ZohoNotesResponse>(
    `${CRM}/${module}/${encodeURIComponent(recordId)}/Notes`,
    {
      sort_by: 'Created_Time',
      sort_order: 'desc',
      fields: 'Note_Title,Note_Content,Created_Time,Created_By',
    },
  );

  const rows = res.data ?? [];
  return rows.map((n) => ({
    id: n.id ?? '',
    title: n.Note_Title ?? '',
    body: n.Note_Content ?? '',
    author_name: n.Created_By?.name ?? '',
    created_at: n.Created_Time ?? '',
  }));
}

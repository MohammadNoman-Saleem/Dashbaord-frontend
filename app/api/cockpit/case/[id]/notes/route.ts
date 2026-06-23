// /api/cockpit/case/[id]/notes
//   GET - notes for the case [id] (a deal/lead zoho_id), newest first, READ-ONLY.
//
// Notes are sourced from ZOHO CRM (the Notes related-list on the Deal/Lead
// record), not from any local store. There is NO write path: notes are authored
// in Zoho; the cockpit only displays them.
//
// PRIVACY (NHRA, compliance-critical): a note body is case-manager working text
// that may contain patient detail, so the route is gated to viewers with
// sees_patient_names; a non-name-seer gets ForbiddenError. The note body, title,
// and any patient identity are never logged or placed in the audit payload (the
// audit row carries the COUNT only). The handler's global PII sweep is the
// backstop.
//
// ?module selects the CRM module ('Deals' | 'Leads'). When absent we try Deals
// first, then fall back to Leads, so the caller can omit it when the kind is
// unknown; an explicit param is always preferred.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { getAudit } from '@/lib/server/audit';
import {
  listForRecord,
  type CaseNote,
  type NoteModule,
} from '@/lib/server/services/zoho-notes';

// Node runtime: the Zoho read client pulls in the auth/token path.
export const runtime = 'nodejs';

/** Read the case [id] segment from /api/cockpit/case/<id>/notes (second to
 *  last). Mirrors the case-file route's path-segment convention. */
function caseIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../case/<id>/notes -> <id> is the segment before the trailing 'notes'.
  return decodeURIComponent(segments[segments.length - 2] ?? '');
}

/** Read an explicit ?module param, accepting only the two CRM modules that
 *  carry case notes. Anything else (including absence) yields null so the
 *  handler falls back to the Deals-then-Leads probe. */
function moduleFromUrl(url: string): NoteModule | null {
  const raw = new URL(url).searchParams.get('module');
  if (raw === 'Deals' || raw === 'Leads') return raw;
  return null;
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Notes can carry patient detail: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case notes.');
  }

  const zohoId = caseIdFromUrl(req.url);
  const explicit = moduleFromUrl(req.url);

  let notes: CaseNote[];
  if (explicit) {
    notes = await listForRecord(explicit, zohoId);
  } else {
    // No explicit module: try Deals, fall back to Leads when it has no notes.
    notes = await listForRecord('Deals', zohoId);
    if (notes.length === 0) {
      notes = await listForRecord('Leads', zohoId);
    }
  }

  // Audit the COUNT only; never the note title, body, or any patient identity.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.notes_view',
    entity_type: 'zoho_notes',
    entity_id: zohoId,
    context: { count: notes.length },
  });

  return withMeta(notes);
});

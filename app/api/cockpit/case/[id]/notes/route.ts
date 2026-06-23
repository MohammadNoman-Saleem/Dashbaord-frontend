// /api/cockpit/case/[id]/notes
//   GET  - active notes for the case [id] (a deal/lead zoho_id), newest first.
//   POST - add a note. Zod { body: string 1..4000 }, insert, audit
//          'cockpit.note.add', return the created note.
//
// PRIVACY (NHRA, compliance-critical): a note body is case-manager working text
// that may contain patient detail, so both methods are gated to viewers with
// sees_patient_names; a non-name-seer gets ForbiddenError. The note body is
// never logged or placed in the audit payload (only the note id and the zoho_id
// go to the audit row). The handler's global PII sweep is the backstop.
//
// Postgres-only write (no Zoho), audited via getAudit(), like /api/urgent.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { getAudit } from '@/lib/server/audit';
import { getCaseNotes } from '@/lib/server/services/case-notes';

// Node runtime: the service reaches pg through getPool().
export const runtime = 'nodejs';

// Re-expresses the spec: { body: string 1..4000 }.
const addNoteSchema = z.object({
  body: z.string().min(1).max(4000),
});

/** Read the case [id] segment from /api/cockpit/case/<id>/notes (second to
 *  last). Mirrors the case-file route's path-segment convention. */
function caseIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../case/<id>/notes -> <id> is the segment before the trailing 'notes'.
  return decodeURIComponent(segments[segments.length - 2] ?? '');
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Notes can carry patient detail: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case notes.');
  }
  const zohoId = caseIdFromUrl(req.url);
  const notes = await getCaseNotes().listForCase(zohoId, viewer);
  return withMeta(notes);
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case notes.');
  }
  const zohoId = caseIdFromUrl(req.url);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = addNoteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Enter between 1 and 4000 characters for the note.');
  }

  const note = await getCaseNotes().add({
    zohoId,
    authorKey: viewer.key,
    body: parsed.data.body.trim(),
  });

  // Audit the id + zoho_id only; never the note body (it may carry patient PII).
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.note.add',
    entity_type: 'case_notes',
    entity_id: note.id,
    after: { zoho_id: zohoId },
  });

  return withMeta(note);
});

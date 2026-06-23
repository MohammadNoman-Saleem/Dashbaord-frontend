// /api/cockpit/case/[id]/notes/[noteId]
//   DELETE - soft-delete a note. Author or a manager (admin/dept_head) only;
//            the service enforces this and throws ForbiddenError otherwise.
//            Audits 'cockpit.note.delete'.
//
// PRIVACY (NHRA, compliance-critical): gated to viewers with sees_patient_names
// like the collection route; a non-name-seer gets ForbiddenError. No note body
// is read back or logged here (the service deletes by id); the audit row
// carries the note id and zoho_id only.
//
// Postgres-only write (no Zoho), audited via getAudit().
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { getAudit } from '@/lib/server/audit';
import { getCaseNotes } from '@/lib/server/services/case-notes';

// Node runtime: the service reaches pg through getPool().
export const runtime = 'nodejs';

/** Read [id] (the case zoho_id) and [noteId] from
 *  /api/cockpit/case/<id>/notes/<noteId>. noteId is the trailing segment; id is
 *  three back (.../<id>/notes/<noteId>). */
function idsFromUrl(url: string): { zohoId: string; noteId: string } {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const noteId = decodeURIComponent(segments[segments.length - 1] ?? '');
  const zohoId = decodeURIComponent(segments[segments.length - 3] ?? '');
  return { zohoId, noteId };
}

export const DELETE = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Notes can carry patient detail: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case notes.');
  }
  const { zohoId, noteId } = idsFromUrl(req.url);

  // The service enforces author-or-manager; NotFoundError if it is already gone.
  const removed = await getCaseNotes().softDelete({ noteId, viewer });

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.note.delete',
    entity_type: 'case_notes',
    entity_id: removed.id,
    after: { zoho_id: zohoId, deleted: true },
  });

  return withMeta({ id: removed.id, deleted: true });
});

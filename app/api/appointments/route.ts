// GET /api/appointments -> today's consultations plus the recently completed
// ones, each with its fee state. Ported from the NestJS AppointmentsController.
// Thin: resolve the viewer, call the appointments service, return the
// { data, meta } envelope with merged source meta.
//
// Privacy (NHRA): each row carries a patient_ref (id plus initials). The
// per-field gate inside the service appends the patient name field only for a
// viewer holding sees_patient_names; the handler's global sweep is the backstop
// that deep-deletes any such field that slips through. The booking Email is a
// server-side join key only and never reaches this payload.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { appointmentsService } from '@/lib/server/services/appointments';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  const { data, parts } = await appointmentsService.board(viewer);
  return withMeta(data, mergeMeta(parts));
});

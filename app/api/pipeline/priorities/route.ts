// GET /api/pipeline/priorities?person=
// Fatima's priority queue: new leads, deals going quiet, follow-ups due.
// Ports the NestJS PipelineController.priorities. Thin: resolve the viewer
// (its sees_patient_names drives the per-field patient gate inside the
// service; ?as= is already resolved onto viewed_person), call the service,
// merge the source meta. The ?person= query the frontend sends is the
// react-query cache key only; name visibility follows the real session, not
// the viewed person (03 section 3), so the service reads it off the viewer.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineService } from '@/lib/server/services/pipeline';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  const { data, parts } = await getPipelineService().priorities(viewer);
  return withMeta(data, mergeMeta(parts));
});

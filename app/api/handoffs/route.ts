// GET /api/handoffs
// Aziz's handoffs panel: how many SLA-tracked deals are moving on time and
// the misses that are not. Ports the NestJS HandoffsController.board, which
// lives in the pipeline module because the numbers derive entirely from
// PipelineService's SLA rules. Misses are labelled by initials for patient
// deals inside the service; the route resolves the viewer for auth and the
// global sweep.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineService } from '@/lib/server/services/pipeline';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineService().handoffs();
  return withMeta(data, mergeMeta(parts));
});

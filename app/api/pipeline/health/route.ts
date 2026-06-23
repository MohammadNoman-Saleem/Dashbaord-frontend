// GET /api/pipeline/health
// The running-late list: open deals past their per-stage SLA, worst first.
// Ports the NestJS PipelineController.health. No patient names leave here
// (patient deals are labelled by initials inside the service), but the route
// still resolves the viewer so the request is authenticated and the global
// sweep runs with the real viewer.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineService } from '@/lib/server/services/pipeline';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineService().health();
  return withMeta(data, mergeMeta(parts));
});

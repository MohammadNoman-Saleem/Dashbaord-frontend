// GET /api/pipeline/momentum
// Per-pipeline month over month: new deals this month against last, with the
// open, won, lost, and value picture. Ports the NestJS
// PipelineAnalyticsController.momentum. Thin: resolve the viewer so the
// request is authenticated and the global sweep runs with the real viewer,
// call the service, merge the source meta. The payload is aggregate-only;
// no patient identity rows.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineAnalyticsService } from '@/lib/server/services/pipeline-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineAnalyticsService().momentum();
  return withMeta(data, mergeMeta(parts));
});

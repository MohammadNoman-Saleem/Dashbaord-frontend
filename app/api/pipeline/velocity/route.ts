// GET /api/pipeline/velocity
// Stage velocity per pipeline: how long open deals have sat in each stage
// (approximated by deal age) and actual created-to-close cycle times for won
// deals. Ports the NestJS PipelineAnalyticsController.velocity. Thin: resolve
// the viewer so the request is authenticated and the global sweep runs with
// the real viewer, call the service, merge the source meta. The payload is
// aggregate-only; no patient identity rows.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineAnalyticsService } from '@/lib/server/services/pipeline-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineAnalyticsService().velocity();
  return withMeta(data, mergeMeta(parts));
});

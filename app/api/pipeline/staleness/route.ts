// GET /api/pipeline/staleness
// Open deals bucketed by days since last update, plus the over-30-days chase
// list grouped by owner, one scope per pipeline plus All. Ports the NestJS
// PipelineAnalyticsController.staleness. Thin: resolve the viewer so the
// request is authenticated and the global sweep runs with the real viewer,
// call the service, merge the source meta. The payload is aggregate-only
// (counts, BHD sums, owner = team-member name); no patient identity rows.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineAnalyticsService } from '@/lib/server/services/pipeline-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineAnalyticsService().staleness();
  return withMeta(data, mergeMeta(parts));
});

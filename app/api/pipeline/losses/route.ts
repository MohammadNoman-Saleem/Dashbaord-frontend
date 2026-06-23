// GET /api/pipeline/losses
// Lost value over time, the owner breakdown, and the loss reason by lead
// source cross-tab. Ports the NestJS PipelineAnalyticsController.losses.
// Thin: resolve the viewer so the request is authenticated and the global
// sweep runs with the real viewer, call the service, merge the source meta.
// The payload is aggregate-only (counts, BHD sums, owner = team-member
// name, reasons, sources); no patient identity rows.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineAnalyticsService } from '@/lib/server/services/pipeline-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineAnalyticsService().losses();
  return withMeta(data, mergeMeta(parts));
});

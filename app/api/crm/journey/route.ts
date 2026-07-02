// GET /api/crm/journey
// Read-only treatment-journey breakdown by tag (Assisted, Navigation, Untagged)
// over the Treatment pipeline. No PII (counts, BHD values, and day averages).
// Stage-time is an approximation (days since created), not true time-in-stage.
// The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await crmAnalytics.journey();
  return withMeta(data, mergeMeta(parts));
});

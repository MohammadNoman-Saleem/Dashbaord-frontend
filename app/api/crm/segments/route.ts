// GET /api/crm/segments?metric=count|amount
// Read-only geographic (destination) and specialty breakdowns over customer
// deals, from the shared classification helpers. No PII (group labels and
// counts or BHD values only). The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';
import type { CrmSegmentMetric } from '@/lib/api/contract';

export const runtime = 'nodejs';

function readMetric(req: Request): CrmSegmentMetric {
  return new URL(req.url).searchParams.get('metric') === 'amount' ? 'amount' : 'count';
}

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await crmAnalytics.segments(readMetric(req));
  return withMeta(data, mergeMeta(parts));
});

// GET /api/crm/pipeline?period=all|mtd|ytd
// Read-only per-pipeline stage breakdown plus win, loss, open, value, and loss
// reasons. No PII (counts and BHD values only). Period defaults to all. The
// viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';
import type { CrmPipelinePeriod } from '@/lib/api/contract';

export const runtime = 'nodejs';

const PERIODS: readonly CrmPipelinePeriod[] = ['all', 'mtd', 'ytd'];

function readPeriod(req: Request): CrmPipelinePeriod {
  const raw = new URL(req.url).searchParams.get('period');
  return PERIODS.includes(raw as CrmPipelinePeriod) ? (raw as CrmPipelinePeriod) : 'all';
}

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await crmAnalytics.pipeline(readPeriod(req));
  return withMeta(data, mergeMeta(parts));
});

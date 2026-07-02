// GET /api/crm/funnel?period=mtd|ytd|all
// Read-only monthly Customers and Providers funnel (leads to deals to won),
// tallied from the cached Deals and Leads reads. Period defaults to all. No PII
// in the payload (counts only). The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';
import type { CrmFunnelPeriod } from '@/lib/api/contract';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

const PERIODS: readonly CrmFunnelPeriod[] = ['mtd', 'ytd', 'all'];

function readPeriod(req: Request): CrmFunnelPeriod {
  const raw = new URL(req.url).searchParams.get('period');
  return PERIODS.includes(raw as CrmFunnelPeriod) ? (raw as CrmFunnelPeriod) : 'all';
}

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const period = readPeriod(req);
  const { data, parts } = await crmAnalytics.funnel(period);
  return withMeta(data, mergeMeta(parts));
});

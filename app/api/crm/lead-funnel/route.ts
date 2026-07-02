// GET /api/crm/lead-funnel?period=all|ytd|mtd
// Read-only cumulative lead-stage funnel, overall and by segment (Customers and
// Providers by Layout). No PII (counts and rates only). Period defaults to all.
// The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';
import type { CrmLeadFunnelPeriod } from '@/lib/api/contract';

export const runtime = 'nodejs';

const PERIODS: readonly CrmLeadFunnelPeriod[] = ['all', 'ytd', 'mtd'];

function readPeriod(req: Request): CrmLeadFunnelPeriod {
  const raw = new URL(req.url).searchParams.get('period');
  return PERIODS.includes(raw as CrmLeadFunnelPeriod) ? (raw as CrmLeadFunnelPeriod) : 'all';
}

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await crmAnalytics.leadFunnel(readPeriod(req));
  return withMeta(data, mergeMeta(parts));
});

// GET /api/crm/lead-sources?period=all|ytd|mtd&segment=overall|Customers|Providers
// Read-only lead-source counts over the cached leads read, filtered by the same
// period and segment as the lead funnel. No PII (source labels and counts
// only). The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';
import type { CrmLeadFunnelPeriod } from '@/lib/api/contract';

export const runtime = 'nodejs';

const PERIODS: readonly CrmLeadFunnelPeriod[] = ['all', 'ytd', 'mtd'];

function readPeriod(raw: string | null): CrmLeadFunnelPeriod {
  return PERIODS.includes(raw as CrmLeadFunnelPeriod) ? (raw as CrmLeadFunnelPeriod) : 'all';
}

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const params = new URL(req.url).searchParams;
  const { data, parts } = await crmAnalytics.leadSources(
    readPeriod(params.get('period')),
    params.get('segment') ?? undefined,
  );
  return withMeta(data, mergeMeta(parts));
});

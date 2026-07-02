// GET /api/crm/metrics
// Read-only CRM overview metrics: overall lead and deal KPIs plus per-pipeline
// month over month, tallied from the cached Deals and Leads reads. No PII in
// the payload (counts and BHD values only). The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await crmAnalytics.metrics();
  return withMeta(data, mergeMeta(parts));
});

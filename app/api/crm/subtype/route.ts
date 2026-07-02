// GET /api/crm/subtype
// Read-only customer sub-type breakdown (Direct, Sponsored, Untagged) over the
// Telemedicine and Treatment pipelines, with a per-pipeline split. No PII
// (counts and BHD values only). The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await crmAnalytics.subtype();
  return withMeta(data, mergeMeta(parts));
});

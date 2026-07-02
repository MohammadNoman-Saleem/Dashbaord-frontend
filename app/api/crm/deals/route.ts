// GET /api/crm/deals?page=&page_size=&pipeline=
// Read-only all-deals table, newest first, paginated, with an optional pipeline
// filter. Rows are privacy-gated: customer-pipeline deals show the reference
// plus initials, provider and corporate deals show the business Deal_Name; no
// patient name, and there is no export. The viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const params = new URL(req.url).searchParams;
  const { data, parts } = await crmAnalytics.dealsTable(
    params.get('page') ?? undefined,
    params.get('page_size') ?? undefined,
    params.get('pipeline') ?? undefined,
  );
  return withMeta(data, mergeMeta(parts));
});

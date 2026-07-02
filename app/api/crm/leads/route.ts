// GET /api/crm/leads?page=&page_size=&status=
// Read-only all-leads table, newest first, paginated. Rows are privacy-gated to
// the Zoho reference plus initials; no name, email, or phone leaves the server,
// and there is no export, matching the CRM slice. Optional status filter. The
// viewer is required for auth.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { crmAnalytics } from '@/lib/server/services/crm-analytics';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const params = new URL(req.url).searchParams;
  const { data, parts } = await crmAnalytics.leads(
    params.get('page') ?? undefined,
    params.get('page_size') ?? undefined,
    params.get('status') ?? undefined,
  );
  return withMeta(data, mergeMeta(parts));
});

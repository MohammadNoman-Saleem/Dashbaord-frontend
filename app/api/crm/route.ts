// GET /api/crm?resource=&page=&page_size=
// "CRM, a closer look": a paginated raw-record slice (leads | treatment |
// providers) with server-driven columns. Ports the NestJS CrmController.slice.
// Thin: require the viewer (the per-field patient gate runs inside the service,
// which on this surface means initials only), parse the query, call the
// service, merge the source meta. The global privacy sweep in handler() is the
// backstop on every response. The { columns, rows, page, pages, total } payload
// matches CrmSliceData in lib/api/contract.ts so the UI renders unchanged.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getCrmSliceService } from '@/lib/server/services/crm-slice';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') ?? undefined;
  const page = searchParams.get('page') ?? undefined;
  const pageSize = searchParams.get('page_size') ?? undefined;

  const crm = getCrmSliceService();
  const { data, parts } = await crm.slice(
    crm.parseResource(resource ?? 'leads'),
    page,
    pageSize,
  );
  return withMeta(data, mergeMeta(parts));
});

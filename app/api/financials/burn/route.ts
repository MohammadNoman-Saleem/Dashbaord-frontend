// GET /api/financials/burn
// Monthly burn from Zoho Books expenses (trailing 12 months) joined with the
// completed-booking revenue series, plus the category breakdown and the
// this-vs-last-month figures. Ports the NestJS FinancialsController.burn. No
// patient data leaves here; the route still resolves the viewer so the request
// is authenticated and the global sweep runs with the real viewer.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getFinancialsService } from '@/lib/server/services/financials';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getFinancialsService().burn();
  return withMeta(data, mergeMeta(parts));
});

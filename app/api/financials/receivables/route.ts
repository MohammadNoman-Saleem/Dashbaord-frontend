// GET /api/financials/receivables
// Receivables aging by balance (days past due), the late-payer ranking by open
// balance, and the approximate DSO. Ports the NestJS
// FinancialsController.receivables. Invoice customers are partners and
// corporates, never patients; the route still resolves the viewer so the
// request is authenticated and the global sweep runs with the real viewer.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getFinancialsService } from '@/lib/server/services/financials';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getFinancialsService().receivables();
  return withMeta(data, mergeMeta(parts));
});

// GET /api/financials/forecast
// Pipeline-weighted revenue forecast: open deals bucketed by expected close
// month, amounts weighted by per-deal Zoho probability with the pipeline
// win-rate fallback. Ports the NestJS FinancialsController.forecast. No patient
// data leaves here; the route still resolves the viewer so the request is
// authenticated and the global sweep runs with the real viewer.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getFinancialsService } from '@/lib/server/services/financials';
import { assertFinancialsAccess } from '@/lib/server/auth/access';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  // Financials is restricted to its audience (admins, the CEO, and finance).
  assertFinancialsAccess(viewer);
  const { data, parts } = await getFinancialsService().forecast();
  return withMeta(data, mergeMeta(parts));
});

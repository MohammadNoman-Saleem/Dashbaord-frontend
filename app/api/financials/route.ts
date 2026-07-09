// GET /api/financials
// Platform revenue (completed CRM bookings), partnership invoices (Zoho Books),
// outstanding balance, and the still-pending payout figures. Ports the NestJS
// FinancialsController.overview. Customers here are partners and corporates,
// never patients; the route still resolves the viewer so the request is
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
  const { data, parts } = await getFinancialsService().overview();
  return withMeta(data, mergeMeta(parts));
});

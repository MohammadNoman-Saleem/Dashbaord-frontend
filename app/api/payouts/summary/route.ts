// GET /api/payouts/summary?cycle=YYYY-MM
// Cycle summary: gross (patient payments) and Saleem revenue (service charge
// plus commission) as two separate totals, provider payouts, and counts.
// Ported from the NestJS backend PayoutsController.summary. Visible to any
// signed-in viewer (and the MCP); the backend's global JwtAuthGuard gated every
// route, so the route requires a viewer.
//
// Thin: resolve the viewer, read the optional ?cycle, validate it (the backend
// CycleQueryDto required /^\d{4}-\d{2}$/), call the commission service, return
// the branded envelope withMeta(data, mergeMeta(parts)).
//
// PRIVACY (NHRA): the summary carries no patient identity (totals only). The
// handler's global sweep runs as the backstop.
//
// Node runtime: the service reaches pg (pool) and Zoho through getCrmRead().
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { getCommissionService } from '@/lib/server/services/payouts';
import { assertFinancialsAccess } from '@/lib/server/auth/access';

export const runtime = 'nodejs';

// Mirrors the backend CycleQueryDto: cycle is optional but, when present, must
// look like 2026-06.
function readCycle(req: Request): string | undefined {
  const raw = new URL(req.url).searchParams.get('cycle');
  if (raw == null) return undefined;
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new BadRequestError('cycle must look like 2026-06.');
  }
  return raw;
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Commission is part of Financials, restricted to the same audience.
  assertFinancialsAccess(viewer);
  const cycle = readCycle(req);
  const { data, parts } = await getCommissionService().summary(viewer, cycle);
  return withMeta(data, mergeMeta(parts));
});

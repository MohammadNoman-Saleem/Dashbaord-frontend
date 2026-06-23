// GET /api/kpi/team-summary?month=
// One paced row per person for the month: their first KPI target, with an
// ahead/behind/on_track state. Ports the NestJS KpiController.teamSummary.
//
// Thin: resolve the viewer, parse and validate the month, call the service.
// The payload is aggregate (per-person metric pacing, no patient identifiers),
// so there is no per-field patient gate here; the global sweep in handler() is
// the backstop. The { rows } shape matches the backend wrapper.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getKpiService } from '@/lib/server/services/kpi';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? undefined;

  const kpi = getKpiService();
  return withMeta({ rows: await kpi.teamSummary(kpi.validMonth(month)) });
});

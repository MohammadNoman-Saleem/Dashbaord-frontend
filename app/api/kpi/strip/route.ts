// GET /api/kpi/strip?person=&month=
// The compact KPI strip (up to four cards) for one person that month, paced
// against the day of the month. Ports the NestJS KpiController.strip.
//
// Thin: resolve the viewer (the person filter falls back to the viewer's
// viewed_person, the ?as= effective person, exactly as the backend did), parse
// the query, validate the month, call the service. The payload is aggregate
// (metric counts and pacing copy, no patient identifiers), so there is no
// per-field patient gate here; the global sweep in handler() is the backstop.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getKpiService } from '@/lib/server/services/kpi';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const { searchParams } = new URL(req.url);
  const person = searchParams.get('person') ?? undefined;
  const month = searchParams.get('month') ?? undefined;

  const kpi = getKpiService();
  const effective = person?.trim() || viewer.viewed_person;
  return withMeta(await kpi.strip(effective, kpi.validMonth(month)));
});

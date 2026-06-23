// GET /api/kpi/drill?metric_key=&month=
// The records behind an auto metric's number, reference-only (initials, never
// names, for every viewer). 400 for metrics with no record list. Ports the
// NestJS KpiController.drill.
//
// Thin: resolve the viewer, require a metric_key (plain 400 otherwise), validate
// the month, call the service, merge the per-source meta. Rows carry initials
// through the patient serializer inside the service (the per-field gate); the
// global sweep in handler() is the backstop. metric_key validity is enforced by
// the service (a non-drillable metric throws a plain 400).
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { getKpiService } from '@/lib/server/services/kpi';
import { getKpiDrillService } from '@/lib/server/services/kpi-drill';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const { searchParams } = new URL(req.url);
  const metricKey = searchParams.get('metric_key') ?? undefined;
  const month = searchParams.get('month') ?? undefined;

  const metric = metricKey?.trim();
  if (!metric) {
    throw new BadRequestError('Send a metric_key to drill into.');
  }
  const { data, parts } = await getKpiDrillService().drill(
    metric,
    getKpiService().validMonth(month),
  );
  return withMeta(data, mergeMeta(parts));
});

// GET /api/cases/summary
// The four KPI cards plus the service and locality split strings for the
// cases view, computed from live CRM deals in the two patient pipelines.
// Ports the NestJS CasesController.summary.
//
// The payload is aggregate: card counts, split labels, and the running-late
// note. No patient identifiers leave here (the running-late items are labelled
// by initials inside the pipeline service, and the cards carry only counts), so
// there is no per-field patient name/phone to gate at this route. The route
// still resolves the viewer so the request is authenticated and the global
// privacy sweep in handler() runs with the real viewer as the backstop.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getCasesService } from '@/lib/server/services/cases';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getCasesService().summary();
  return withMeta(data, mergeMeta(parts));
});

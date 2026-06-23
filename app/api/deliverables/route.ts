// GET /api/deliverables?month=YYYY-MM -> the kpi_deliverables rows for the
// month, each carrying a can_edit flag for the viewer.
// Ported from the NestJS DeliverablesController.list. Thin: resolve the viewer,
// read the month query (validMonth defaults it to the current month), call the
// service, return the envelope. No patient PII is involved; the handler's global
// sweep is the backstop.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { deliverablesService } from '@/lib/server/services/deliverables';

// Node runtime: the service reaches pg through getPool().
export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const month = new URL(req.url).searchParams.get('month') ?? undefined;
  return withMeta(
    await deliverablesService.list(
      deliverablesService.validMonth(month),
      viewer,
    ),
  );
});

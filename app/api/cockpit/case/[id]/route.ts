// GET /api/cockpit/case/:id -> the per-case file for a lead or deal Zoho id.
// Ported from the NestJS CockpitController.caseFile. Thin: resolve the viewer,
// read the dynamic id segment, call the service, return the envelope. A missing
// case resolves to data: null with merged source meta, matching the backend.
// The per-field patient gate (name, phone, WhatsApp message, raw concern) runs
// inside the service; the handler's global sweep is the backstop.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { cockpitService } from '@/lib/server/services/cockpit';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

// Next 16 passes the dynamic route params as a Promise on the second arg.
export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Pull the [id] segment from the path: /api/cockpit/case/<id>. Reading it from
  // the URL keeps the handler signature uniform with the other routes (the
  // wrapper passes (req, ctx) only).
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 1] ?? '');
  const { data, parts } = await cockpitService.caseFile(id, viewer);
  return withMeta(data, mergeMeta(parts));
});

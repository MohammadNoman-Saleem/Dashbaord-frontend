// GET /api/cockpit/queue?person= -> the SLA-sorted active queue plus tiles.
// Ported from the NestJS CockpitController.queue. Thin: resolve the viewer,
// resolve the effective person (the ?person= query, lower-cased, else the
// viewer's viewed_person), call the cockpit service, return the { data, meta }
// envelope with merged source meta. The per-field patient gate runs inside the
// service; the handler's global sweep is the backstop.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { cockpitService } from '@/lib/server/services/cockpit';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const url = new URL(req.url);
  const person =
    url.searchParams.get('person')?.trim().toLowerCase() ||
    viewer.viewed_person;
  const { data, parts } = await cockpitService.queue(person, viewer);
  return withMeta(data, mergeMeta(parts));
});

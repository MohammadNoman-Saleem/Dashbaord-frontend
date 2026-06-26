// GET /api/cockpit/queue?person= -> the SLA-sorted active queue plus tiles.
// Ported from the NestJS CockpitController.queue. Thin: resolve the viewer,
// resolve the effective person (the ?person= query, lower-cased, else 'all' so
// a case manager sees every active lead and deal regardless of owner), call the
// cockpit service, return the { data, meta } envelope with merged source meta.
// The per-field patient gate runs inside the service; the handler's global
// sweep is the backstop.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { cockpitService } from '@/lib/server/services/cockpit';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const url = new URL(req.url);
  // Default to 'all' (the whole pool), not the viewer's own person, so a case
  // manager sees every lead and deal no matter who owns it; an explicit
  // ?person= still narrows the view.
  const person =
    url.searchParams.get('person')?.trim().toLowerCase() || 'all';
  const { data, parts } = await cockpitService.queue(person, viewer);
  return withMeta(data, mergeMeta(parts));
});

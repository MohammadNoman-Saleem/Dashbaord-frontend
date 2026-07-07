// GET /api/cockpit/today?person= -> the unified "Today" list: one row per case,
// merging the SLA clock with that case's open messages and top suggestion. The
// cockpit home. Defaults person to 'all' (the whole pool), like the queue. The
// per-field patient gates run inside the underlying services; the handler's
// global sweep is the backstop.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { today } from '@/lib/server/services/cockpit-today';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const person =
    new URL(req.url).searchParams.get('person')?.trim().toLowerCase() || 'all';
  const { data, parts } = await today(viewer, person);
  return withMeta(data, mergeMeta(parts));
});

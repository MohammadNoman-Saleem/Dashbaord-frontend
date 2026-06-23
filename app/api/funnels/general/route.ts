// GET /api/funnels/general - the General behaviour tab. Ported from the NestJS
// FunnelsController.general. Thin: resolve the viewer, resolve the throttled
// ?refresh=1 cache bypass (once per viewer per route every ten minutes; over
// the limit the flag is silently ignored and cache is served), call the
// FunnelsService, return the { data, meta } envelope with merged source meta.
//
// No patient data flows through this domain. The handler's global PII sweep is
// the backstop only. The FunnelGeneralData shape (lib/api/contract.ts) is
// preserved VERBATIM so the existing frontend keeps working unchanged.
//
// Node runtime: the service touches pg and the Mixpanel client.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getRefreshThrottle } from '@/lib/server/cache';
import { getFunnelsService } from '@/lib/server/services/funnels';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const refresh = new URL(req.url).searchParams.get('refresh') ?? undefined;
  // ?refresh=1 bypasses cache freshness, throttled per viewer per route to
  // once every ten minutes. Over the limit it silently serves cache.
  const bypass =
    refresh === '1' &&
    getRefreshThrottle().allow(viewer.key, 'funnels.general');
  const { data, parts } = await getFunnelsService().general(bypass);
  return withMeta(data, mergeMeta(parts));
});

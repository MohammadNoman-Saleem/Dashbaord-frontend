// GET /api/funnels/scheduled - the Saleem Direct scheduled flow benchmark tab.
// Ported from the NestJS FunnelsController.scheduled. Thin: resolve the viewer,
// resolve the throttled ?refresh=1 cache bypass, call the FunnelsService,
// return the { data, meta } envelope with merged source meta.
//
// No patient data flows through this domain. The handler's global PII sweep is
// the backstop only. The FunnelScheduledData shape (lib/api/contract.ts) is
// preserved VERBATIM so the existing frontend keeps working unchanged.
//
// Node runtime: the service touches pg and the Mixpanel client.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getRefreshThrottle } from '@/lib/server/cache';
import {
  getFunnelsService,
  parseFunnelPeriod,
} from '@/lib/server/services/funnels';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const params = new URL(req.url).searchParams;
  const refresh = params.get('refresh') ?? undefined;
  const period = parseFunnelPeriod(params.get('period'));
  // ?refresh=1 bypasses cache freshness, throttled per viewer per route to
  // once every ten minutes; the period rides the key so each window has its
  // own bypass allowance. Over the limit it silently serves cache.
  const bypass =
    refresh === '1' &&
    getRefreshThrottle().allow(viewer.key, `funnels.scheduled.${period}`);
  const { data, parts } = await getFunnelsService().scheduled(period, bypass);
  return withMeta(data, mergeMeta(parts));
});

// GET /api/funnels/novo - the Novo channel tab (landing, CTAs, BMI categories,
// the four Novo saved funnels and the data-quality mismatch flag). Ported from
// the NestJS FunnelsController.novo. Thin: resolve the viewer, resolve the
// throttled ?refresh=1 cache bypass, call the FunnelsService, return the
// { data, meta } envelope with merged source meta.
//
// PDPL: the service segments BMI on the coarse bmi_category bucket only; the
// raw bmi_value is never queried. No patient data flows through this domain.
// The handler's global PII sweep is the backstop only. The FunnelNovoData shape
// (lib/api/contract.ts) is preserved VERBATIM so the existing frontend keeps
// working unchanged.
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
    refresh === '1' && getRefreshThrottle().allow(viewer.key, 'funnels.novo');
  const { data, parts } = await getFunnelsService().novo(bypass);
  return withMeta(data, mergeMeta(parts));
});

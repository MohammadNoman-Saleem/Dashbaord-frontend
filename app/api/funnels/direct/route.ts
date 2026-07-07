// GET /api/funnels/direct?variant=full|instant - the Direct Appointment tab.
// Ported from the NestJS FunnelsController.direct. Thin: resolve the viewer,
// resolve the variant (anything other than 'instant' falls back to 'full',
// matching the backend), resolve the throttled ?refresh=1 cache bypass keyed
// per resolved variant, call the FunnelsService, return the { data, meta }
// envelope with merged source meta.
//
// No patient data flows through this domain. The handler's global PII sweep is
// the backstop only. The FunnelDirectData shape (lib/api/contract.ts) is
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
  const variant = params.get('variant') ?? undefined;
  const refresh = params.get('refresh') ?? undefined;
  const period = parseFunnelPeriod(params.get('period'));
  const resolved: 'full' | 'instant' =
    variant === 'instant' ? 'instant' : 'full';
  // ?refresh=1 bypasses cache freshness, throttled per viewer per route to
  // once every ten minutes; the period rides the key so each window has its
  // own bypass allowance. Over the limit it silently serves cache.
  const bypass =
    refresh === '1' &&
    getRefreshThrottle().allow(
      viewer.key,
      `funnels.direct.${resolved}.${period}`,
    );
  const { data, parts } = await getFunnelsService().direct(
    resolved,
    period,
    bypass,
  );
  return withMeta(data, mergeMeta(parts));
});

// GET /api/growth/engagement?refresh=1
// DAU/MAU with a 30-day trend, top events, and traffic with a device split.
// Ports the NestJS GrowthController.engagement. Thin: resolve the viewer (the
// backend's global JwtAuthGuard gated every route), apply the per-viewer,
// per-route forced-refresh throttle (?refresh=1 bypasses cache freshness, once
// every ten minutes per viewer per route; over the limit it silently serves
// cache), call the ported GrowthService, and return the merged { data, meta }
// envelope. handler() runs the global patient-PII sweep automatically; the
// payload carries only aggregates (no email, id, or name), so there is no
// per-field gate to apply here.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { getRefreshThrottle } from '@/lib/server/cache';
import { getGrowthService } from '@/lib/server/services/growth';

// Node runtime: the service reaches pg/Zoho via getCrmRead() and node:crypto
// via getMixpanel().
export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const refresh = new URL(req.url).searchParams.get('refresh') ?? undefined;
  const bypass =
    refresh === '1' &&
    getRefreshThrottle().allow(viewer.key, 'growth.engagement');
  const { data, parts } = await getGrowthService().engagement(bypass);
  return withMeta(data, mergeMeta(parts));
});

// GET /api/growth/retention?refresh=1
// Mixpanel weekly behaviour retention matrices plus two CRM-identity reads:
// lead-to-booking conversion and velocity by source, and repeat-booking month
// cohorts. Ports the NestJS GrowthController.retention. Thin: resolve the
// viewer (the backend's global JwtAuthGuard gated every route), apply the
// per-viewer, per-route forced-refresh throttle (?refresh=1 bypasses cache
// freshness, once every ten minutes per viewer per route; over the limit it
// silently serves cache), call the ported GrowthService, and return the merged
// { data, meta } envelope. handler() runs the global patient-PII sweep
// automatically; payloads carry only aggregates labelled by source name or
// month (emails and patient ids are server-side join keys only), so there is
// no per-field gate to apply here.
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
    getRefreshThrottle().allow(viewer.key, 'growth.retention');
  const { data, parts } = await getGrowthService().retention(bypass);
  return withMeta(data, mergeMeta(parts));
});

// GET /api/social/ga4?period= - GA4 website analytics for the Social view.
// Ported from the NestJS backend src/social/social.controller.ts (@Get('ga4')).
// The controller validated ?period against the allowed set (defaulting to 28d),
// called the service, and when GA4 was not configured returned a null payload
// with an explicit meta.error so the panel's hard-error state shows the
// configuration gap in plain words. That behaviour is preserved verbatim.
//
// The backend's global JwtAuthGuard gated every route, so this requires a
// viewer. The SocialGa4Dto shape is preserved VERBATIM so the existing frontend
// (lib/api/contract.ts SocialGa4Data) keeps working unchanged. handler() runs
// the global patient-PII sweep automatically (no patient data here either way).
//
// Node runtime: the service touches pg (cache) and GA4 via the integration.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getSocialRead, type Ga4Period } from '@/lib/server/services/social';

export const runtime = 'nodejs';

const PERIODS: ReadonlySet<string> = new Set(['7d', '28d', '90d', 'mtd']);

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const period = new URL(req.url).searchParams.get('period') ?? undefined;
  const resolved: Ga4Period =
    period && PERIODS.has(period) ? (period as Ga4Period) : '28d';
  const { data, parts } = await getSocialRead().ga4(resolved);
  if (data === null) {
    // Not configured: a clear error in meta so the panel's hard-error state
    // shows the configuration gap in plain words.
    const reason = parts[0]?.reasons?.[0];
    return withMeta(null, {
      ...mergeMeta(parts),
      error: {
        message_plain:
          reason?.text ?? 'Google Analytics is not configured on saleem-api.',
      },
    });
  }
  return withMeta(data, mergeMeta(parts));
});

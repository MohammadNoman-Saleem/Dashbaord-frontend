// GET /api/marketing
// Leads by channel from this month's CRM leads, the lead-quality split off the
// server-side classifier, and the leads tile with Afaf's monthly KPI target.
// Paid-media tiles (cpl, whatsapp_reply_pct, ig_reach) and channel spend are
// null with the authored Meta-connector-pending reason until that source lands.
// Ports the NestJS MarketingController.overview. No patient names leave here,
// but the route still resolves the viewer so the request is authenticated and
// the global sweep runs with the real viewer.
//
// ?refresh=1 is accepted for uniformity with the funnels routes but is
// currently a no-op here: the only upstream is the CRM leads read, whose ten
// minute cache is short enough that a manual bypass adds nothing.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getMarketingService } from '@/lib/server/services/marketing';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getMarketingService().overview();
  return withMeta(data, mergeMeta(parts));
});

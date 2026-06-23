// GET /api/cockpit/sla-policy -> the authored SLA policy tables, served
// verbatim with no upstream. Ported from the NestJS CockpitController.slaPolicy.
// Synchronous policy: the service returns the static authored content and no
// source meta, so the envelope carries fresh meta. The viewer is required to
// match the rest of the cockpit's authenticated surface (the old Nest route sat
// behind the same global auth guard); the policy itself carries no patient data.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { cockpitService } from '@/lib/server/services/cockpit';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = cockpitService.slaPolicy();
  return withMeta(data, mergeMeta(parts));
});

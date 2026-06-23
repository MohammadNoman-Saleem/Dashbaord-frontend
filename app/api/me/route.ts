// GET /api/me - the signed-in user's identity, capabilities, theme, and (when
// the viewer can_view_as) the person list for the view-as picker. Ported from
// the NestJS backend src/auth/me.controller.ts (@Controller('me') @Get()). The
// controller was thin and stays thin here: resolve the viewer (the backend's
// global JwtAuthGuard gated this route), then call the ported service and
// return the branded envelope. The ?as= resolution already lives in
// requireViewer(), surfaced as viewer.viewed_person. handler() runs the global
// patient-PII sweep automatically.
//
// The MeDto shape is preserved VERBATIM from the backend so the frontend is
// unchanged.
//
// Node runtime: the service touches pg (users via the pool).
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getMe } from '@/lib/server/services/me';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  return withMeta(await getMe(viewer));
});

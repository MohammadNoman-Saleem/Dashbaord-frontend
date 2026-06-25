// GET /api/brief/latest -> the latest compiled weekly brief (highlights plus
// sections). Ported from the NestJS BriefController.latest (@Get('latest')).
// Thin: resolve the viewer, call the brief service, return the { data, meta }
// envelope. A missing or unreadable brief throws NotFoundError inside the
// service, which the handler turns into a 404 error envelope.
//
// No patient data: the brief is an aggregate ops summary, so no per-field
// patient gate is needed here; the handler's global sweep still runs.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getBriefRead } from '@/lib/server/services/brief';

// Node runtime: the service reaches pg through getPool().
export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  return withMeta(await getBriefRead().latest());
});

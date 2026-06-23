// GET /api/tasks - the top open tasks across the two tracked Zoho projects,
// due soonest first. Ported from the NestJS backend src/tasks/tasks.controller
// .ts (@Controller('tasks') @Get()). The controller was thin
// (return withMeta(data, mergeMeta(parts))) and stays thin: it requires a
// viewer (the backend's global JwtAuthGuard gated every route), then calls the
// ported TasksService and returns the branded envelope. handler() runs the
// global patient-PII sweep automatically.
//
// The TasksDto shape ({ rows: [{ title, owner, status, due_display }] }) is
// preserved VERBATIM so the existing frontend keeps working unchanged.
//
// Node runtime: the service reads Zoho Projects through getZohoProjectsRead().
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { getTasks } from '@/lib/server/services/board';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getTasks().board();
  return withMeta(data, mergeMeta(parts));
});

// GET /api/board/assignable-users - the assignable owners for the board's owner
// picker and assignee filter. Ported from the NestJS backend
// src/board/board.controller.ts (@Get('assignable-users') getAssignableUsers).
// A read, open to every signed-in viewer and the MCP service key; the thin
// route requires a viewer, calls the ported BoardService.assignableUsers()
// (Postgres users with a Zoho zpuid, admin row excluded), and returns the
// envelope. handler() runs the global patient-PII sweep automatically.
//
// The AssignableUserDto shape ({ key, name, zpuid }) is preserved VERBATIM so
// the frontend is unchanged.
//
// Node runtime: the service reads the users table through pg.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getBoard } from '@/lib/server/services/board';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const users = await getBoard().assignableUsers();
  return withMeta(users);
});

// GET /api/board/projects - the tab/project/tasklist catalog backing the
// board's two selectors. Ported from the NestJS backend
// src/board/board.controller.ts (@Get('projects') getCatalog). Reads are open
// to every signed-in viewer and the MCP service key (the backend's global
// JwtAuthGuard admitted the service key on reads); the thin route requires a
// viewer, calls the ported BoardService.catalog(), and returns the branded
// envelope. handler() runs the global patient-PII sweep automatically.
//
// The BoardCatalogDto shape ({ tabs: [{ key, label, projects: [...] }] }) is
// preserved VERBATIM so the existing frontend keeps working unchanged.
//
// Node runtime: the service reads Zoho Projects through getZohoProjectsRead().
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { getBoard } from '@/lib/server/services/board';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getBoard().catalog();
  return withMeta(data, mergeMeta(parts));
});

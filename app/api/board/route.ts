// GET /api/board?tab=&project=&tasklist= - the kanban over Zoho Projects for a
// selected tab/project/tasklist. Ported from the NestJS backend
// src/board/board.controller.ts (@Get() getBoard). Reads are open to every
// signed-in viewer and the MCP service key; the route requires a viewer, then
// reproduces the controller's selection logic VERBATIM: default the tab to
// 'cross', default the project to the tab's first, draw the whole project when
// no tasklist is given, and 404 a project/tasklist that is not under the tab.
//
// The query params mirror the backend BoardQueryDto (class-validator) as a zod
// schema at the route boundary: tab is one of the tab keys, project/tasklist
// are Zoho ids. The BoardDto shape is preserved VERBATIM so the frontend is
// unchanged.
//
// Node runtime: the service reads Zoho Projects through getZohoProjectsRead().
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { BadRequestError, NotFoundError } from '@/lib/server/errors';
import { getBoard, isTabKey } from '@/lib/server/services/board';
import { TAB_KEYS } from '@/lib/server/services/board-config';

export const runtime = 'nodejs';

const ZOHO_ID = /^\d{5,25}$/;

// Mirrors the backend BoardQueryDto: tab optional (one of the tab keys),
// project/tasklist optional Zoho ids. Empty strings are treated as absent.
const QuerySchema = z.object({
  tab: z.enum(TAB_KEYS).optional(),
  project: z
    .string()
    .regex(ZOHO_ID, 'project must be a Zoho project id.')
    .optional(),
  tasklist: z
    .string()
    .regex(ZOHO_ID, 'tasklist must be a Zoho tasklist id.')
    .optional(),
});

function param(url: URL, key: string): string | undefined {
  const raw = url.searchParams.get(key);
  return raw && raw.length > 0 ? raw : undefined;
}

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    tab: param(url, 'tab'),
    project: param(url, 'project'),
    tasklist: param(url, 'tasklist'),
  });
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues[0]?.message ?? 'Invalid board query.',
    );
  }
  const query = parsed.data;

  const board = getBoard();
  const tab = query.tab ?? 'cross';
  if (!isTabKey(tab)) throw new NotFoundError('Unknown board tab.');

  // No project given: default to the first project of the tab (Cross-Dept
  // and IT have exactly one; Other defaults to its first discovered
  // project). No tasklist given: the whole project draws.
  const { projects } = await board.projectsForTab(tab);
  const projectId = query.project ?? projects[0]?.id;
  if (!projectId) {
    throw new NotFoundError('No projects under this tab.');
  }
  const selection = await board.resolveSelection(
    tab,
    projectId,
    query.tasklist ?? null,
  );
  if (!selection) {
    throw new NotFoundError(
      'That project or tasklist is not under this tab.',
    );
  }
  const { data, parts } = await board.board(
    tab,
    selection.project,
    selection.tasklist,
  );
  return withMeta(data, mergeMeta(parts));
});

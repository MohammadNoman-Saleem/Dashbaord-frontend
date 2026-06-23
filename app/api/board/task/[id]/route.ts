// GET /api/board/task/:id?project=<zohoProjectId> - the full task detail for
// the card panel: fields, recent comments, and the assignable users. Ported
// from the NestJS backend src/board/board.controller.ts (@Get('task/:id')
// getTaskDetail). A read, open to every signed-in viewer and the MCP service
// key; the route requires a viewer, validates the id and the ?project query as
// the backend did, and calls the ported BoardService.taskDetail(). The service
// 404s when the task is not on the given project, so a forged project id can
// never reach an unrelated task.
//
// DEFERRED and NOT ported on this path: the Zoho WRITE routes the backend
// mounted on the same segment - PATCH /board/task/:id (status/owner/priority
// move) and POST /board/task/:id/comment. Those are board task writes, bundled
// under one sign-off (Khalid/Al Saeed) and route through the
// personal-ops-assistant skill when activated; only the GET read lands here.
//
// The TaskDetailDto shape is preserved VERBATIM so the frontend is unchanged.
//
// Node runtime: the service reads Zoho Projects and the users table.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { BadRequestError, NotFoundError } from '@/lib/server/errors';
import { getBoard } from '@/lib/server/services/board';

export const runtime = 'nodejs';

const ZOHO_ID = /^\d{5,25}$/;

// Mirrors the backend TaskDetailQueryDto: project is a required Zoho id.
const QuerySchema = z.object({
  project: z.string().regex(ZOHO_ID, 'project must be a Zoho project id.'),
});

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();

  const url = new URL(req.url);
  // Pull the [id] segment from the path: /api/board/task/<id>.
  const segments = url.pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 1] ?? '');
  if (!ZOHO_ID.test(id)) {
    throw new NotFoundError('That task id does not look like a Zoho id.');
  }

  const parsed = QuerySchema.safeParse({
    project: url.searchParams.get('project') ?? undefined,
  });
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues[0]?.message ?? 'Invalid task query.',
    );
  }

  const { data, parts } = await getBoard().taskDetail(parsed.data.project, id);
  return withMeta(data, mergeMeta(parts));
});

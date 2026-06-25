// POST /api/board/task/:id/comment - adds a comment to a board task. Ported
// from the NestJS backend src/board/board.controller.ts (@Post('task/:id/
// comment') addComment). This is the path the UI's TaskDetailModal posts to
// (mutateEnvelope('POST', `/board/task/${taskId}/comment`, { project, content
// })); the backend route had not been ported, which is the 404 the user hit.
//
// A Zoho WRITE: gated behind WRITE_GATE_ENABLED (refuses outright when off),
// refuses the MCP service viewer (is_service -> ForbiddenError), evaluates the
// REAL signed-in person, and audits. The audit row carries a short comment
// preview only (board comments are operational task notes, never patient
// content); no patient values or names are logged.
//
// The body is { project, content }, zod-validated at the boundary (the backend
// CommentBodyDto: @Matches(ZOHO_ID) project, @IsString @MinLength(1)
// @MaxLength(8000) content). Returns { added: true }.
//
// Node runtime: the service reads and writes Zoho Projects and the users table.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/server/errors';
import { getEnv } from '@/lib/server/env';
import { getAudit } from '@/lib/server/audit';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { getBoard } from '@/lib/server/services/board';

export const runtime = 'nodejs';

const ZOHO_ID = /^\d{5,25}$/;

// Mirrors the backend CommentBodyDto.
const CommentSchema = z.object({
  project: z.string().regex(ZOHO_ID, 'project must be a Zoho project id.'),
  content: z.string().min(1).max(8000),
});

/** Zoho writes act for a person. The service key reads the board but can never
 *  raise a comment as "MCP service". Inlined from the backend assertPerson. */
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key reads the board but cannot change tasks.',
    );
  }
}

/** The hard cutover switch: board writes refuse outright while it is off. */
function assertWritesEnabled(): void {
  if (!getEnv().WRITE_GATE_ENABLED) {
    throw new ForbiddenError(
      'Writes are turned off right now. The comment was not added.',
    );
  }
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  assertWritesEnabled();

  const url = new URL(req.url);
  // Path is /api/board/task/<id>/comment: the id is the second-to-last segment.
  const segments = url.pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] ?? '');
  if (!ZOHO_ID.test(id)) {
    throw new NotFoundError('That task id does not look like a Zoho id.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = CommentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues[0]?.message ?? 'Invalid comment.',
    );
  }

  const content = parsed.data.content.trim();
  if (!content) {
    throw new BadRequestError('A comment cannot be empty.');
  }

  // The service 404s before the write if the task is not on the given project.
  await getBoard().addComment(parsed.data.project, id, content);

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'board_task.comment',
    entity_type: 'zoho_tasks',
    entity_id: id,
    after: { comment_preview: content.slice(0, 200) },
    context: { project_id: parsed.data.project },
  });

  return withMeta({ added: true });
});

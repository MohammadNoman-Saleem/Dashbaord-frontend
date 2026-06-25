// GET /api/board/task/:id?project=<zohoProjectId> - the full task detail for
// the card panel: fields, recent comments, and the assignable users. Ported
// from the NestJS backend src/board/board.controller.ts (@Get('task/:id')
// getTaskDetail). A read, open to every signed-in viewer and the MCP service
// key; the route requires a viewer, validates the id and the ?project query as
// the backend did, and calls the ported BoardService.taskDetail(). The service
// 404s when the task is not on the given project, so a forged project id can
// never reach an unrelated task.
//
// ALSO on this segment: PATCH /board/task/:id, the unified task update the
// backend mounted as @Patch('task/:id'). Any subset of status/owner_zpuid/
// priority; each provided field is one separate, audited Zoho write, run in a
// stable order (owner, priority, status). A Zoho WRITE: gated behind
// WRITE_GATE_ENABLED, refuses the MCP service viewer, evaluates the REAL
// signed-in person, and lands every field change in audit_log with before and
// after (keys/context only, never patient values).
//
// The TaskDetailDto / BoardCardDto shapes are preserved VERBATIM so the
// frontend is unchanged. The UI (BoardView, TaskDetailModal) sends the body
// { project, status?, owner_zpuid?, priority? } as JSON; project is read from
// the body, falling back to the ?project query for parity with the GET.
//
// Node runtime: the service reads and writes Zoho Projects and the users table.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/server/errors';
import { getEnv } from '@/lib/server/env';
import { getAudit } from '@/lib/server/audit';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { getBoard, type BoardCardData } from '@/lib/server/services/board';

export const runtime = 'nodejs';

const ZOHO_ID = /^\d{5,25}$/;
const PRIORITIES = ['None', 'Low', 'Medium', 'High'] as const;

// Mirrors the backend TaskDetailQueryDto: project is a required Zoho id.
const QuerySchema = z.object({
  project: z.string().regex(ZOHO_ID, 'project must be a Zoho project id.'),
});

// Mirrors the backend PatchTaskDto: project required; status/owner_zpuid/
// priority each optional. The controller rejects an empty body.
const PatchSchema = z.object({
  project: z.string().regex(ZOHO_ID, 'project must be a Zoho project id.'),
  status: z.string().min(1).max(100).optional(),
  owner_zpuid: z
    .string()
    .regex(ZOHO_ID, 'owner_zpuid must be a Zoho user id.')
    .optional(),
  priority: z.enum(PRIORITIES).optional(),
});

/** Zoho writes act for a person. The service key reads the board but can never
 *  move a task. Inlined from the backend controller's assertPerson. */
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key reads the board but cannot change tasks.',
    );
  }
}

/** The hard cutover switch: board writes refuse outright while it is off, the
 *  same pattern as the write-gate commit. */
function assertWritesEnabled(): void {
  if (!getEnv().WRITE_GATE_ENABLED) {
    throw new ForbiddenError(
      'Writes are turned off right now. The board change was not applied.',
    );
  }
}

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

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  assertWritesEnabled();

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 1] ?? '');
  if (!ZOHO_ID.test(id)) {
    throw new NotFoundError('That task id does not look like a Zoho id.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  // project falls back to the ?project query for parity with the GET, though
  // the UI sends it in the body.
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as Record<string, unknown>).project === undefined
  ) {
    const q = url.searchParams.get('project');
    if (q) (raw as Record<string, unknown>).project = q;
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues[0]?.message ?? 'Invalid task update.',
    );
  }
  const body = parsed.data;

  const hasStatus = body.status !== undefined && body.status !== null;
  const hasOwner = body.owner_zpuid !== undefined && body.owner_zpuid !== null;
  const hasPriority = body.priority !== undefined && body.priority !== null;
  if (!hasStatus && !hasOwner && !hasPriority) {
    throw new BadRequestError(
      'Provide at least one of status, owner_zpuid, or priority.',
    );
  }

  const board = getBoard();
  const audit = getAudit();

  // Each field is one independent Zoho write with its own audit row, in a
  // stable order (owner, priority, status). The service 404s before any write
  // if the task is not on the given project, so a forged project id cannot
  // reach an unrelated task. Audit carries keys/context only, never patient
  // values or names.
  if (hasOwner) {
    const { before, after } = await board.updateTaskOwner(
      body.project,
      id,
      body.owner_zpuid as string,
    );
    await audit.log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'board_task.reassign',
      entity_type: 'zoho_tasks',
      entity_id: id,
      before,
      after,
      context: { project_id: body.project },
    });
  }

  if (hasPriority) {
    const { before, after } = await board.updateTaskPriority(
      body.project,
      id,
      body.priority as string,
    );
    await audit.log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'board_task.priority',
      entity_type: 'zoho_tasks',
      entity_id: id,
      before,
      after,
      context: { project_id: body.project },
    });
  }

  if (hasStatus) {
    const { before, after } = await board.updateTaskStatus(
      body.project,
      id,
      body.status as string,
    );
    await audit.log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'board_task.status',
      entity_type: 'zoho_tasks',
      entity_id: id,
      before,
      after,
      context: { project_id: body.project },
    });
  }

  // Return the fresh card from Zoho so the optimistic UI can reconcile.
  const { data } = await board.taskDetail(body.project, id);
  const card: BoardCardData = {
    id: data.id,
    title: data.name,
    owner: data.owner ?? 'Unassigned',
    owner_zpuid: data.owner_zpuid ?? null,
    due_display: data.due_display,
    priority: data.priority,
    tasklist: null,
    status: data.status ?? 'Open',
  };
  return withMeta(card);
});

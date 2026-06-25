// POST /api/board/task - creates a board task. Ported from the NestJS backend
// src/board/board.controller.ts (@Post('task') createTask). This is the path
// the UI's AddTaskModal posts to (mutateEnvelope('POST', '/board/task', body)),
// the create form's collection POST; the task id is in the path only for the
// per-task PATCH/comment routes, never for create.
//
// A Zoho WRITE: gated behind WRITE_GATE_ENABLED (refuses outright when off),
// refuses the MCP service viewer (is_service -> ForbiddenError), evaluates the
// REAL signed-in person, and audits. The audit row carries the task NAME plus
// the chosen owner/priority/due/tasklist (operational task fields, never
// patient values or names); board tasks are internal work items.
//
// The body is { project, tasklist_id, name, description?, owner_zpuid?,
// priority?, due_date? }, zod-validated at the boundary (the backend
// CreateTaskBodyDto). Returns { task_id }.
//
// Node runtime: the service reads and writes Zoho Projects and the users table.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getEnv } from '@/lib/server/env';
import { getAudit } from '@/lib/server/audit';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { getBoard } from '@/lib/server/services/board';

export const runtime = 'nodejs';

const ZOHO_ID = /^\d{5,25}$/;
const PRIORITIES = ['None', 'Low', 'Medium', 'High'] as const;

// Mirrors the backend CreateTaskBodyDto.
const CreateTaskSchema = z.object({
  project: z.string().regex(ZOHO_ID, 'project must be a Zoho project id.'),
  tasklist_id: z
    .string()
    .regex(ZOHO_ID, 'tasklist_id must be a Zoho tasklist id.'),
  name: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  owner_zpuid: z
    .string()
    .regex(ZOHO_ID, 'owner_zpuid must be a Zoho user id.')
    .optional(),
  priority: z.enum(PRIORITIES).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD.')
    .optional(),
});

/** Zoho writes act for a person. The service key reads the board but can never
 *  create a task as "MCP service". Inlined from the backend assertPerson. */
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
      'Writes are turned off right now. The task was not created.',
    );
  }
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  assertWritesEnabled();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = CreateTaskSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      parsed.error.issues[0]?.message ?? 'Invalid task.',
    );
  }
  const body = parsed.data;

  const { taskId, ownerName } = await getBoard().createTask({
    projectId: body.project,
    tasklistId: body.tasklist_id,
    name: body.name.trim(),
    description: body.description?.trim(),
    ownerZpuid: body.owner_zpuid ?? null,
    priority: body.priority ?? null,
    dueDate: body.due_date ?? null,
  });

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'board_task.create',
    entity_type: 'zoho_tasks',
    entity_id: taskId ?? '(unknown)',
    after: {
      name: body.name.trim(),
      priority: body.priority ?? null,
      owner: ownerName,
      owner_zpuid: body.owner_zpuid ?? null,
      due_date: body.due_date ?? null,
      tasklist_id: body.tasklist_id,
    },
    context: { project_id: body.project },
  });

  return withMeta({ task_id: taskId });
});

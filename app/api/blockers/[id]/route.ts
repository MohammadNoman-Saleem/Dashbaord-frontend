// PATCH /api/blockers/:id -> unblock, withdraw, or flag_root_cause a blocker.
// Ports the NestJS BlockersController.patch write leg (Postgres-only, audited).
//
// Permission matrix (verbatim from the backend controller):
//   unblock          admin, or the operations department (07 says "role
//                    operations"; the users table has no such role, so the
//                    operations department carries it; Aziz is operations)
//   withdraw         the raiser, while the blocker is still open
//   flag_root_cause  admin or operations
// The MCP service key reads but never writes: rows reference a real users(key)
// and the service viewer is not a person.
//
// Thin route: resolve the viewer, enforce the person-only check, validate the
// :id as a UUID (the backend used ParseUUIDPipe) and the body with a zod schema
// re-expressing the class-validator PatchBlockerDto, run the same action/role
// branch, write the same audit row, return withMeta(item).
//
// Patient privacy: blocker payloads carry no patient PII field; the per-field
// gate has nothing to append, the global sweep in handler() is the backstop.
// Audit before/after carry only status / resolution / root-cause structural
// fields, never patient identifiers.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getBlockersService } from '@/lib/server/services/blockers';
import { getAudit } from '@/lib/server/audit';
import type { RequestViewer } from '@/lib/server/auth/viewer';

// Node runtime: the service reaches Postgres through getPool().
export const runtime = 'nodejs';

// Re-express the backend PatchBlockerDto (class-validator):
//   action          @IsIn(['unblock','withdraw','flag_root_cause'])
//   resolution_note @IsOptional @IsString @MaxLength(500)
//   value           @IsOptional @IsBoolean  (for flag_root_cause)
const PatchBlockerSchema = z.object({
  action: z.enum(['unblock', 'withdraw', 'flag_root_cause']),
  resolution_note: z.string().max(500).optional(),
  value: z.boolean().optional(),
});

// Mirror of Nest's ParseUUIDPipe (v4 is the default version it accepts; the
// blockers table issues gen_random_uuid() v4 ids). A bad id is a 400, matching
// the pipe's BadRequest.
const UuidSchema = z.string().uuid();

function canResolve(viewer: RequestViewer): boolean {
  return (
    viewer.role === 'admin' ||
    (viewer.department ?? '').toLowerCase() === 'operations'
  );
}

function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key reads blockers but cannot raise or resolve them.',
    );
  }
}

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  // Pull the [id] segment from the path: /api/blockers/<id>. Reading it from
  // the URL keeps the handler signature uniform with the other routes.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const rawId = decodeURIComponent(segments[segments.length - 1] ?? '');
  const idParsed = UuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    throw new BadRequestError('That blocker id is not valid.');
  }
  const id = idParsed.data;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Send a JSON body.');
  }
  const parsed = PatchBlockerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      'action must be unblock, withdraw, or flag_root_cause.',
    );
  }
  const body = parsed.data;

  const blockers = getBlockersService();
  const before = await blockers.byId(id);

  let item;
  if (body.action === 'unblock') {
    if (!canResolve(viewer)) {
      throw new ForbiddenError('Unblocking is for operations or an admin.');
    }
    item = await blockers.resolve(
      id,
      'unblocked',
      viewer.key,
      body.resolution_note?.trim() || null,
    );
  } else if (body.action === 'withdraw') {
    if (!before || before.raised_by !== viewer.key) {
      throw new ForbiddenError(
        'Only the person who raised a blocker can withdraw it.',
      );
    }
    item = await blockers.resolve(
      id,
      'withdrawn',
      viewer.key,
      body.resolution_note?.trim() || null,
    );
  } else {
    if (!canResolve(viewer)) {
      throw new ForbiddenError(
        'The root cause flag is for operations or an admin.',
      );
    }
    item = await blockers.setRootCauseFlag(id, body.value === true);
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: `blockers.${body.action}`,
    entity_type: 'blockers',
    entity_id: item.id,
    before: before
      ? {
          status: before.status,
          resolved_at: before.resolved_at,
          root_cause_flag: before.root_cause_flag,
        }
      : null,
    after: {
      status: item.status,
      resolved_at: item.resolved_at,
      resolved_by: item.resolved_by,
      resolution_note: item.resolution_note,
      root_cause_flag: item.root_cause_flag,
    },
  });
  return withMeta(item);
});

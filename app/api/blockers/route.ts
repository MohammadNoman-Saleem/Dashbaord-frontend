// /api/blockers: GET the board (open + last-7-days resolved) and POST to raise
// a blocker. Ports the read and the plain-blocker write legs of the NestJS
// BlockersController (board, add). The Ops-type "Raise" dual write
// (POST /api/blockers/ops, the OpsRaiseService Zoho leg) is DEFERRED and is not
// ported here.
//
// Permission matrix (verbatim from the backend controller):
//   raise   any signed-in person; the MCP service key reads but never writes
//           (rows reference a real users(key) and the service viewer is not a
//           person).
//
// Thin route: resolve the viewer, enforce the same person-only check, validate
// the body with a zod schema re-expressing the class-validator AddBlockerDto,
// call the service, write the same audit row, return withMeta(item).
//
// Patient privacy: blocker payloads carry no patient identifier fields (name,
// phone, or WhatsApp message), so the per-field gate has nothing to append
// here; the global sweep in handler() is the backstop. Audit before/after carry
// only the blocker text and structural fields, never patient identifiers.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getBlockersService } from '@/lib/server/services/blockers';
import { getAudit } from '@/lib/server/audit';
import type { RequestViewer } from '@/lib/server/auth/viewer';

// Node runtime: the service reaches Postgres through getPool().
export const runtime = 'nodejs';

// Re-express the backend AddBlockerDto (class-validator):
//   text       @IsString @MinLength(3) @MaxLength(500)
//   waiting_on @IsOptional @IsString @MaxLength(200)
const AddBlockerSchema = z.object({
  text: z.string().min(3).max(500),
  waiting_on: z.string().max(200).optional(),
});

// The service key reads blockers but cannot raise or resolve them: rows
// reference a real users(key) and the service viewer is not a person.
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key reads blockers but cannot raise or resolve them.',
    );
  }
}

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  return withMeta(await getBlockersService().board());
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Send a JSON body.');
  }
  const parsed = AddBlockerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Add a blocker of 3 to 500 characters.');
  }
  const body = parsed.data;

  const item = await getBlockersService().create(
    body.text.trim(),
    body.waiting_on?.trim() || null,
    viewer.key,
  );
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'blockers.add',
    entity_type: 'blockers',
    entity_id: item.id,
    after: {
      text: item.text,
      waiting_on: item.waiting_on,
      repeat_of: item.repeat_of,
      root_cause_flag: item.root_cause_flag,
    },
  });
  return withMeta(item);
});

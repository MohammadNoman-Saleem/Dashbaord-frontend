// /api/urgent: GET the open + resolved board, POST a new urgent item.
// Ported from the NestJS UrgentController.board (GET) and .add (POST).
//
// GET is a pure read: resolve the viewer, call the service, return the
// { open, resolved } board. POST is a Postgres write: any signed-in PERSON may
// add (the MCP service viewer is rejected by assertPerson, mirroring the other
// write controllers), the body is validated at the boundary with a zod schema
// re-expressing the backend AddUrgentDto (string, 3..500), the text is trimmed
// before insert exactly as the backend did, and the write is audited via
// getAudit() with the same action/entity/after shape (urgent.add).
//
// urgent_items carries no patient PII; the handler's global sweep is the
// backstop. Node runtime: the service reaches pg through getPool().
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getUrgentService } from '@/lib/server/services/urgent';
import type { RequestViewer } from '@/lib/server/auth/viewer';

export const runtime = 'nodejs';

// Rejects the MCP service viewer: urgent writes are made by a signed-in person.
// Mirrors assertPerson in the backend write-gate controller (and the board,
// kpi, documents, blockers write controllers).
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot make cockpit writes; they are confirmed by a person in the cockpit.',
    );
  }
}

// Re-expresses the backend AddUrgentDto: @IsString @MinLength(3) @MaxLength(500).
const addUrgentSchema = z.object({
  text: z.string().min(3).max(500),
});

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  return withMeta(await getUrgentService().board());
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = addUrgentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      'Enter between 3 and 500 characters for the urgent item.',
    );
  }

  const item = await getUrgentService().add(parsed.data.text.trim(), viewer.key);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'urgent.add',
    entity_type: 'urgent_items',
    entity_id: item.id,
    after: { text: item.text },
  });
  return withMeta(item);
});

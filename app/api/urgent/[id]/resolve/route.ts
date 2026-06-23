// PATCH /api/urgent/:id/resolve -> mark an urgent item resolved.
// Ported from the NestJS UrgentController.resolve. A Postgres write: any
// signed-in PERSON may resolve (the MCP service viewer is rejected by
// assertPerson, mirroring the other write controllers), the :id segment is
// validated as a UUID at the boundary (re-expressing the backend ParseUUIDPipe)
// with a zod schema, the before/after state is captured the same way the
// backend did, and the write is audited via getAudit() with the same
// action/entity/before/after shape (urgent.resolve).
//
// A missing item makes the service throw NotFoundError (404), exactly as the
// backend's NotFoundException. urgent_items carries no patient PII; the
// handler's global sweep is the backstop. Node runtime: the service reaches pg
// through getPool().
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getUrgentService } from '@/lib/server/services/urgent';
import type { RequestViewer } from '@/lib/server/auth/viewer';

export const runtime = 'nodejs';

// Rejects the MCP service viewer: urgent writes are made by a signed-in person.
// Mirrors assertPerson in the backend write-gate controller.
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot make cockpit writes; they are confirmed by a person in the cockpit.',
    );
  }
}

// Re-expresses the backend ParseUUIDPipe on the :id route param.
const idSchema = z.uuid();

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  // Pull the :id from the path: /api/urgent/<id>/resolve. The id is the
  // second-to-last segment (the last is the literal "resolve").
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const rawId = decodeURIComponent(segments[segments.length - 2] ?? '');
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    throw new BadRequestError('That urgent item id is not valid.');
  }
  const id = parsedId.data;

  const before = await getUrgentService().openItem(id);
  const item = await getUrgentService().resolve(id, viewer.key);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'urgent.resolve',
    entity_type: 'urgent_items',
    entity_id: item.id,
    before: before ? { resolved_at: before.resolved_at } : null,
    after: { resolved_at: item.resolved_at, resolved_by: item.resolved_by },
  });
  return withMeta(item);
});

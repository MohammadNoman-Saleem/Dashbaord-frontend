// DELETE /api/provider-board/:id -> remove a patient card from a hospital column
// (a soft delete; the same patient can be re-added later). Person-only and
// name-seer-gated like the board route; the id is validated as a UUID and the
// removal is audited (id only, no patient data).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { getProviderBoardService } from '@/lib/server/services/provider-board';
import type { RequestViewer } from '@/lib/server/auth/viewer';

export const runtime = 'nodejs';

function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError('The service key cannot edit the provider board.');
  }
}

function assertNameSeer(viewer: RequestViewer): void {
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to the provider board.');
  }
}

// provider_referrals ids are gen_random_uuid() v4, like the blockers route.
const UuidSchema = z.string().uuid();

export const DELETE = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  assertNameSeer(viewer);

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const rawId = decodeURIComponent(segments[segments.length - 1] ?? '');
  const idParsed = UuidSchema.safeParse(rawId);
  if (!idParsed.success) {
    throw new BadRequestError('That board card id is not valid.');
  }

  const result = await getProviderBoardService().removeReferral(idParsed.data);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'provider_board.remove',
    entity_type: 'provider_referrals',
    entity_id: result.id,
    after: null,
  });
  return withMeta(result);
});

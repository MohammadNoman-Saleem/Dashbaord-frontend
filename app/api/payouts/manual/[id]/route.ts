// PATCH /api/payouts/manual/:id
// Edit an existing manual free-appointment ledger row. Ported from the NestJS
// backend PayoutsController.patchManual. WRITE path:
//   - capability gate: can_edit_payout_rules only, else 403 with the backend's
//     message. The MCP service key 403s here.
//   - zod-validated body re-expressing the backend ManualEntryDto (same shape as
//     the POST), reused from the create route.
//   - controller input shaping preserved verbatim (product/provider_label
//     trimmed, collected_by defaulted to null).
//   - Postgres UPDATE on the manual row in the service (a missing or non-manual
//     row -> 404 with the backend's message).
//   - audited via getAudit() exactly as the backend: action payouts.manual.patch,
//     entity_type bookings_ledger, before/after = product/provider_label/
//     saleem_share/collected_by.
// Returns the updated row (the backend's patchManual returns withMeta(after)).
//
// PRIVACY (NHRA): manual rows carry no patient identity; the audit payload carries
// no patient values. The handler's global sweep is the backstop.
//
// Node runtime: pg (pool) + audit insert.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getManualLedgerService } from '@/lib/server/services/payouts';
import { assertFinancialsAccess } from '@/lib/server/auth/access';
import { ManualEntrySchema } from '../route';

export const runtime = 'nodejs';

/** Pull the :id segment (a string manual key). */
function readId(req: Request): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? '');
}

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Commission is part of Financials, restricted to the same audience.
  assertFinancialsAccess(viewer);
  if (!viewer.can_edit_payout_rules) {
    throw new ForbiddenError('Editing payout rules is for Khalid or Isa.');
  }

  const id = readId(req);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Invalid JSON body.');
  }
  const parsed = ManualEntrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Bad request.');
  }
  const body = parsed.data;

  const { before, after } = await getManualLedgerService().update(id, {
    product: body.product.trim(),
    provider_label: body.provider_label?.trim() || null,
    saleem_share: body.saleem_share,
    collected_by: body.collected_by ?? null,
    booked_at: body.booked_at,
  });
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'payouts.manual.patch',
    entity_type: 'bookings_ledger',
    entity_id: after.id,
    before: {
      product: before.product,
      provider_label: before.provider_label,
      saleem_share: before.saleem_share,
      collected_by: before.collected_by,
    },
    after: {
      product: after.product,
      provider_label: after.provider_label,
      saleem_share: after.saleem_share,
      collected_by: after.collected_by,
    },
  });

  return withMeta(after);
});

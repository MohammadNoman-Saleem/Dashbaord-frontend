// POST /api/payouts/manual
// Add a manual free-appointment ledger row (patient pays nothing; the team
// records what Saleem covers or earns). Ported from the NestJS backend
// PayoutsController.addManual. WRITE path:
//   - capability gate: can_edit_payout_rules only, else 403 with the backend's
//     message. The MCP service key 403s here.
//   - zod-validated body re-expressing the backend ManualEntryDto (product
//     required string <=120; provider_label optional string <=120; saleem_share
//     required number, signed; collected_by optional enum saleem|provider;
//     booked_at optional, starts YYYY-MM-DD).
//   - the controller's input shaping is preserved verbatim: product trimmed,
//     provider_label trimmed or null, collected_by defaulted to null.
//   - Postgres INSERT into bookings_ledger (manual = true) in the service.
//   - audited via getAudit() exactly as the backend: action payouts.manual.add,
//     entity_type bookings_ledger, after = product/provider_label/saleem_share/
//     collected_by/cycle.
//
// NOTE: the backend used @HttpCode(201); the foundation handler() returns 200 on
// success for every route. The frontend reads the { data, meta } envelope body,
// not the status code, so the contract is unchanged.
//
// PRIVACY (NHRA): manual rows carry no patient identity (the synthetic middot
// ref); the audit payload carries no patient values. The handler's global sweep
// is the backstop.
//
// Node runtime: pg (pool) + audit insert.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getManualLedgerService } from '@/lib/server/services/payouts';

export const runtime = 'nodejs';

// Re-expresses the backend ManualEntryDto (class-validator) with its messages.
export const ManualEntrySchema = z
  .object({
    product: z.string().max(120),
    provider_label: z.string().max(120).optional(),
    saleem_share: z.number(),
    collected_by: z.enum(['saleem', 'provider']).optional(),
    booked_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, {
        message: 'booked_at must start YYYY-MM-DD.',
      })
      .optional(),
  })
  .strict();

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  if (!viewer.can_edit_payout_rules) {
    throw new ForbiddenError('Editing payout rules is for Khalid or Isa.');
  }

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

  // Controller input shaping, verbatim.
  const entry = await getManualLedgerService().create({
    product: body.product.trim(),
    provider_label: body.provider_label?.trim() || null,
    saleem_share: body.saleem_share,
    collected_by: body.collected_by ?? null,
    booked_at: body.booked_at,
  });
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'payouts.manual.add',
    entity_type: 'bookings_ledger',
    entity_id: entry.id,
    after: {
      product: entry.product,
      provider_label: entry.provider_label,
      saleem_share: entry.saleem_share,
      collected_by: entry.collected_by,
      cycle: entry.cycle,
    },
  });

  return withMeta(entry);
});

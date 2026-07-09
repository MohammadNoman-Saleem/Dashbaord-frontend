// PATCH /api/payouts/rules/:id
// Edit the editable numeric params of one payout rule. Ported from the NestJS
// backend PayoutsController.patchRule. WRITE path:
//   - capability gate: can_edit_payout_rules only, else 403 with the backend's
//     plain-language message ("Editing payout rules is for Khalid or Isa."). The
//     MCP service key carries can_edit_payout_rules false, so it 403s here.
//   - zod-validated body re-expressing the backend PatchRuleDto (each of
//     service_charge_bhd / commission_bhd / commission_pct optional, a number,
//     min 0).
//   - id parsed as an integer (the backend ParseIntPipe), 400 otherwise.
//   - Postgres UPDATE in the service (params jsonb merge, updated_by/_at stamp).
//   - audited via getAudit() exactly as the backend: action payouts.rule.patch,
//     entity_type payout_rules, before/after = { params }.
// Returns the full rules list (the backend's patchRule returns rulesList).
//
// PRIVACY (NHRA): rules carry no patient identity; the before/after audit payload
// is params only, no patient values. The handler's global sweep is the backstop.
//
// Node runtime: pg (pool) + audit insert.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import {
  getPayoutRulesService,
  rulesList,
  type EditableParamKey,
} from '@/lib/server/services/payouts';
import { assertFinancialsAccess } from '@/lib/server/auth/access';

export const runtime = 'nodejs';

// Re-expresses the backend PatchRuleDto (class-validator): each param optional,
// IsNumber, Min(0). strict() rejects unknown keys; the backend's whitelist
// validation pipe stripped them, but rejecting is the safer server boundary.
const PatchRuleSchema = z
  .object({
    service_charge_bhd: z.number().min(0).optional(),
    commission_bhd: z.number().min(0).optional(),
    commission_pct: z.number().min(0).optional(),
  })
  .strict();

/** Pull the :id segment and parse it as an integer, mirroring the backend
 *  ParseIntPipe (a non-integer id is a 400). */
function readId(req: Request): number {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const raw = decodeURIComponent(segments[segments.length - 1] ?? '');
  if (!/^-?\d+$/.test(raw)) {
    throw new BadRequestError('Validation failed (numeric string is expected)');
  }
  return Number.parseInt(raw, 10);
}

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Commission is part of Financials, restricted to the same audience, checked
  // before the payout-rule edit capability.
  assertFinancialsAccess(viewer);
  // Capability gate, verbatim message from the backend assertCanEdit.
  if (!viewer.can_edit_payout_rules) {
    throw new ForbiddenError('Editing payout rules is for Khalid or Isa.');
  }

  const id = readId(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BadRequestError('Invalid JSON body.');
  }
  const parsed = PatchRuleSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Bad request.');
  }

  // Mirror the backend's selective param assembly: only defined keys flow in.
  const params: Partial<Record<EditableParamKey, number>> = {};
  if (parsed.data.service_charge_bhd !== undefined)
    params.service_charge_bhd = parsed.data.service_charge_bhd;
  if (parsed.data.commission_bhd !== undefined)
    params.commission_bhd = parsed.data.commission_bhd;
  if (parsed.data.commission_pct !== undefined)
    params.commission_pct = parsed.data.commission_pct;

  const { before, after } = await getPayoutRulesService().patchParams(
    id,
    params,
    viewer.key,
  );
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'payouts.rule.patch',
    entity_type: 'payout_rules',
    entity_id: after.id,
    before: { params: before.params },
    after: { params: after.params },
  });

  return withMeta(await rulesList(viewer));
});

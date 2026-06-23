// GET /api/payouts/rules
// The editable payout rules with their display lines, editable keys, and the
// viewer's can_edit flag. Ported from the NestJS backend
// PayoutsController.rulesList. Reads are open to any signed-in viewer (and the
// MCP); the can_edit flag reflects the real viewer's can_edit_payout_rules and
// drives whether the UI offers the edit affordance (the PATCH path enforces it
// server-side regardless).
//
// Thin: resolve the viewer, build the rules-list payload in the service (shared
// with the PATCH response), return the branded envelope. No source meta to merge
// (Postgres-only read), so freshMeta via withMeta is correct.
//
// PRIVACY (NHRA): rules carry no patient identity. The handler's global sweep
// runs as the backstop.
//
// Node runtime: the service reaches pg (pool).
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { rulesList } from '@/lib/server/services/payouts';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  return withMeta(await rulesList(viewer));
});

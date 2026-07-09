// GET /api/ai-costs
//
// Exact, real-time USD spent on Amazon Nova (self-metered from bedrock_usage),
// with per-day and per-model breakdowns. Restricted: only the named leadership
// keys may see it (cost visibility for the three of them), everyone else 403s.
//
// SERVER ONLY: runtime 'nodejs' (reads Postgres).
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { ForbiddenError } from '@/lib/server/errors';
import { aiCosts } from '@/lib/server/services/ai-costs';

export const runtime = 'nodejs';

// Who may see AI costs. The user keys of the three leaders who track spend.
const COST_VIEWERS = new Set(['khalid', 'noman', 'alsaeed']);

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  if (!COST_VIEWERS.has(viewer.key)) {
    throw new ForbiddenError('You do not have access to AI costs.');
  }
  return withMeta(await aiCosts());
});

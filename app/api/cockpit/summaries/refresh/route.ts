// POST /api/cockpit/summaries/refresh
//
// Recompute proactive AI summaries + suggestions for the active cockpit cases
// whose state changed since last time (bounded per call; click again to finish
// a backlog). Writes to our own case_summaries table + calls Nova; no Zoho
// write, so it is NOT WRITE_GATE gated. Name-seer + person only (a summary can
// phrase patient case detail; the service key cannot drive it).
//
// SERVER ONLY: runtime 'nodejs' (reaches pg/Zoho/Bedrock). maxDuration is raised
// so a first-run batch can finish under Vercel's function limit.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { refreshSummaries } from '@/lib/server/services/case-summary';

export const runtime = 'nodejs';
export const maxDuration = 60;

function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError('The service key cannot refresh summaries.');
  }
}

export const POST = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to case summaries.');
  }
  return withMeta(await refreshSummaries(viewer));
});

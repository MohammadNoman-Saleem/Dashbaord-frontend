// POST /api/events/resolve  { ids: string[], action: 'done' | 'dismiss' }
//
// Resolve one or more open inbox events in a single call (a group card clears
// several at once). 'done' marks them actioned, 'dismiss' marks them dismissed.
// Only open events flip, so a re-submission is a no-op.
//
// SERVER ONLY: runtime 'nodejs'.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { resolveEvents } from '@/lib/server/services/channel-events';

export const runtime = 'nodejs';

const ResolveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['done', 'dismiss']),
});

function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError('The service key cannot resolve inbox events.');
  }
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = ResolveSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');

  const resolved = await resolveEvents(
    viewer,
    parsed.data.ids,
    parsed.data.action,
  );
  return withMeta({ resolved });
});

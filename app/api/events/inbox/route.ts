// GET /api/events/inbox
//
// The reactive "needs action" inbox: open channel events grouped per matched
// case (or per sender phone when unmatched), triaged, newest/most-urgent first.
// Any signed-in viewer may read it (an initials-only inbox is useful to
// non-name-seers, like the queue); the per-field patient gates run inside the
// service and the handler's global sweep is the backstop.
//
// PRIVACY (NHRA): message snippets are patient content, so the read audits
// counts only, like the notes GET.
//
// SERVER ONLY: runtime 'nodejs'.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getAudit } from '@/lib/server/audit';
import { inbox } from '@/lib/server/services/channel-events';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  const data = await inbox(viewer);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'events.inbox_view',
    entity_type: 'channel_events',
    context: { groups: data.groups.length, events: data.counts.open },
  });
  return withMeta(data);
});

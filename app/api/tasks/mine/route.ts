// GET /api/tasks/mine - the signed-in person's own open Zoho Projects tasks,
// due soonest first, for the p-my-tasks home panel. Thin: resolve the viewer,
// map their effective person to a Zoho user id, call the tasks service, and
// return the { data, meta } envelope.
//
// Identity is derived server-side. The effective person (viewed_person, which
// reflects an admin's ?as=) is mapped to its Zoho zpuid via the users table;
// the client never passes an identity. A person with no Zoho user resolves to
// an empty list rather than an error, so the card simply reads empty for them.
//
// Node runtime: the service reaches Zoho Projects and pg (users) at runtime.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { getTasks } from '@/lib/server/services/board';
import { assignableUsers } from '@/lib/server/users';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  const people = await assignableUsers();
  const me = people.find((u) => u.key === viewer.viewed_person);
  const { data, parts } = await getTasks().mine(me?.zpuid ?? '');
  return withMeta(data, mergeMeta(parts));
});

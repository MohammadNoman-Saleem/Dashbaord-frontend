// GET /api/attention?person=
// The per-person attention engine: at most three plain-language items off the
// same cached reads the panels use. Ports the NestJS AttentionController.items.
// Thin: resolve the viewer (its viewed_person is the ?as= resolution and the
// default when ?person= is absent), pick the effective person the same way the
// backend did, call the service, merge the source meta.
//
// The ?person= query lets a viewer read another person's attention list (the
// home grid fetches each colleague's items); when absent it falls back to the
// viewer's own viewed_person. Items carry no patient PII fields, so the
// per-field gate has nothing to append; the global sweep in handler() is the
// backstop.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getAttentionService } from '@/lib/server/services/attention';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const person = new URL(req.url).searchParams.get('person') ?? undefined;
  const effective = person?.trim().toLowerCase() || viewer.viewed_person;
  const { data, parts } = await getAttentionService().itemsFor(effective);
  return withMeta(data, mergeMeta(parts));
});

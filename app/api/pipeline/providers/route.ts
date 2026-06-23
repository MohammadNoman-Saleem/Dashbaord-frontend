// GET /api/pipeline/providers
// Provider onboarding scoped local / international / all, with the
// awaiting-sign-off list. Ports the NestJS PipelineController.providers.
// Provider deal names are business names, not patient data, so no per-field
// patient gate applies here; the route still resolves the viewer for auth and
// the global sweep.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getPipelineService } from '@/lib/server/services/pipeline';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getPipelineService().providers();
  return withMeta(data, mergeMeta(parts));
});

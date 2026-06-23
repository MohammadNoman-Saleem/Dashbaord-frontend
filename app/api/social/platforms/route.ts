// GET /api/social/platforms - the four social platform reads (LinkedIn, TikTok,
// Instagram, Zoho Social) for the Social view. Ported from the NestJS backend
// src/social/social.controller.ts (@Get('platforms')). The controller was thin
// (return withMeta(data, mergeMeta(parts))) and stays thin here: each platform
// block is null when its source is unwired or its token expired, and
// meta.reasons carries the authored reason whose key starts with the platform
// name so the card renders the honest not-connected treatment.
//
// The backend's global JwtAuthGuard gated every route, so this requires a
// viewer. The SocialPlatformsDto shape is preserved VERBATIM so the existing
// frontend (lib/api/contract.ts SocialPlatformsData) keeps working unchanged.
// handler() runs the global patient-PII sweep automatically (public social
// metrics only, no patient data).
//
// Node runtime: the service touches pg (cache, the TikTok token row) and the
// platform/Zoho integrations.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getSocialRead } from '@/lib/server/services/social';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const { data, parts } = await getSocialRead().platforms();
  return withMeta(data, mergeMeta(parts));
});

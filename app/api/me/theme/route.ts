// PATCH /api/me/theme - persist the signed-in user's light/dark theme. Ported
// from the NestJS backend src/auth/me.controller.ts (@Controller('me')
// @Patch('theme')). The class-validator ThemeDto (@IsIn(['light','dark'])) is
// re-expressed as a zod schema validated at this route boundary; an invalid
// body yields a 400 error envelope. The viewer is resolved (the backend's
// global JwtAuthGuard gated this route) and the service rejects service
// sessions. The backend wrote no audit row for a theme change, so neither does
// this route. Returns { theme } VERBATIM so the frontend is unchanged.
//
// Node runtime: the service touches pg (users via the pool).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { updateTheme } from '@/lib/server/services/me';

export const runtime = 'nodejs';

const ThemeSchema = z.object({
  theme: z.enum(['light', 'dark']),
});

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = ThemeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Bad request.');
  }

  return withMeta(await updateTheme(viewer, parsed.data.theme));
});

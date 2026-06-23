// GET /api/blockers/saturday?week=2026-W24 -> open blockers grouped by raiser
// for one ISO week, consumed by the Saturday 19:30 brief job and the weekly
// update draft. Ports the NestJS BlockersController.saturday read. Thin: resolve
// the viewer, validate the optional ?week= query against the same ISO-week
// shape the backend's SaturdayQueryDto enforced, default to the current Bahrain
// ISO week when absent, call the service, return withMeta(result).
//
// Patient privacy: grouped blocker rows carry no patient PII field; the global
// sweep in handler() is the backstop.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { getBlockersService, isoWeekKey } from '@/lib/server/services/blockers';

// Node runtime: the service reaches Postgres through getPool().
export const runtime = 'nodejs';

// Re-express the backend SaturdayQueryDto (class-validator):
//   week @IsOptional @Matches(/^\d{4}-W\d{2}$/)
const WeekSchema = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'week must look like 2026-W24 (an ISO week).');

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const raw = new URL(req.url).searchParams.get('week') ?? undefined;
  let week: string;
  if (raw === undefined) {
    week = isoWeekKey(new Date());
  } else {
    const parsed = WeekSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestError('week must look like 2026-W24 (an ISO week).');
    }
    week = parsed.data;
  }
  return withMeta(await getBlockersService().saturday(week));
});

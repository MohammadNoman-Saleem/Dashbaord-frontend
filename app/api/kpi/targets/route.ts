// GET  /api/kpi/targets?month=  -> every KPI target row for the month
// POST /api/kpi/targets         -> create one target row (Postgres write)
// Ports the NestJS KpiController.targets and KpiController.createTarget.
//
// GET is a pure read: resolve the viewer, validate the month, return the rows
// (can_edit/drillable are derived per viewer inside the service). The payload is
// aggregate (no patient identifiers), so the global sweep in handler() is the
// only patient backstop needed.
//
// POST is a Postgres-only write, scope-checked and audited:
//   1. Validate the body at the boundary with a zod schema that re-expresses the
//      backend CreateKpiTargetDto (class-validator). Same field rules: person_key
//      2-40 chars; metric_key optional snake_case key; label optional 2-120;
//      month YYYY-MM; target a number >= 0; direction/unit/source optional enums.
//   2. The backend's controller-level rule: at least one of metric_key or label.
//   3. Enforce the same scope as PATCH and DELETE via assertCanEditPerson:
//      admins any person, dept heads only their own team, everyone else refused
//      (throws ForbiddenError -> 403).
//   4. Create the row, then write the audit image exactly as the backend did
//      (action kpi_target.create, entity_type kpi_targets, after = the created
//      row's fields). No patient identifiers are in the audit payload.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getKpiService } from '@/lib/server/services/kpi';

export const runtime = 'nodejs';

// Re-expresses the backend CreateKpiTargetDto class-validator decorators. The
// regex messages mirror the backend's @Matches messages so the client copy is
// unchanged. .strip() drops unknown keys rather than rejecting, matching Nest's
// default whitelist-free body handling for this controller.
const createTargetSchema = z
  .object({
    person_key: z.string().min(2).max(40),
    metric_key: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_]{1,79}$/, {
        message:
          'metric_key uses lowercase letters, numbers, and underscores only.',
      })
      .optional(),
    label: z.string().min(2).max(120).optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: 'month is YYYY-MM, e.g. 2026-06.',
    }),
    target: z.number().min(0),
    direction: z.enum(['at_least', 'at_most']).optional(),
    unit: z.enum(['count', 'bhd', 'pct']).optional(),
    source: z.enum(['auto', 'manual']).optional(),
  })
  .strip();

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') ?? undefined;

  const kpi = getKpiService();
  return withMeta(await kpi.targets(kpi.validMonth(month), viewer));
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  const parsed = createTargetSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new BadRequestError(firstZodMessage(parsed.error));
  }
  const body = parsed.data;

  if (!body.metric_key && !body.label) {
    throw new BadRequestError('Send a metric_key or a label.');
  }

  const kpi = getKpiService();
  // Same scope rule as PATCH and DELETE: admin any, dept head own team.
  await kpi.assertCanEditPerson(body.person_key, viewer);

  const created = await kpi.createTarget(body, viewer);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'kpi_target.create',
    entity_type: 'kpi_targets',
    entity_id: created.id,
    after: {
      person: created.person_key,
      metric: created.metric_key,
      label: created.label,
      target_value: created.target,
      period: created.month,
      direction: created.direction,
      unit: created.unit,
      source: created.source,
      auto_feed: created.auto_feed,
    },
  });
  return withMeta(created);
});

/** Parse the JSON body, surfacing a malformed body as a plain 400 rather than
 *  letting the SyntaxError fall through to a 500. */
async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequestError('Send a JSON body.');
  }
}

/** The first zod issue message, so the client sees the same plain wording the
 *  backend's validation pipe surfaced. */
function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Bad request.';
}

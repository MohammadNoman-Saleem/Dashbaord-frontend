// PATCH  /api/kpi/targets/:id -> change a target's label or value (Postgres)
// DELETE /api/kpi/targets/:id -> remove a target (Postgres)
// Ports the NestJS KpiController.updateTarget and KpiController.deleteTarget.
//
// Both are Postgres-only writes, scope-checked and audited. The :id segment is
// read from the path (the handler wrapper passes (req, ctx) only) and validated
// as a UUID with zod, replacing the backend's ParseUUIDPipe (a non-UUID is a
// plain 400, matching the pipe's reject). Authz is the same assertCanEdit as
// POST: admins any row, dept heads only rows whose person resolves into their
// team, everyone else refused (403). A missing row is a plain 404.
//
// PATCH validates the body against a zod schema re-expressing UpdateKpiTargetDto
// (label optional 2-120, target optional number >= 0), then enforces the
// controller rule that at least one of label or target is present. The audit
// before/after images are written exactly as the backend did; no patient
// identifiers appear in them.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, NotFoundError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getKpiService, type TargetRow } from '@/lib/server/services/kpi';

export const runtime = 'nodejs';

// Re-expresses the backend UpdateKpiTargetDto class-validator decorators.
const updateTargetSchema = z
  .object({
    label: z.string().min(2).max(120).optional(),
    target: z.number().min(0).optional(),
  })
  .strip();

// The :id segment must be a UUID, replacing ParseUUIDPipe at the boundary.
const idSchema = z.string().uuid();

/** The audit images for kpi_targets writes: the raw row, trimmed to the
 *  fields a write can touch plus enough context to read the log alone. */
function auditImage(row: TargetRow) {
  return {
    person: row.person,
    metric: row.metric,
    label: row.label,
    target_value: row.target_value,
    source: row.source,
    auto_feed: row.auto_feed,
  };
}

/** Pull and validate the [id] segment from /api/kpi/targets/<id>. */
function targetId(req: Request): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const raw = decodeURIComponent(segments[segments.length - 1] ?? '');
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('That target id is not valid.');
  }
  return parsed.data;
}

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const id = targetId(req);

  const parsed = updateTargetSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Bad request.');
  }
  const body = parsed.data;
  if (body.label === undefined && body.target === undefined) {
    throw new BadRequestError('Send a label or a target to change.');
  }

  const kpi = getKpiService();
  const before = await kpi.getTarget(id);
  if (!before) {
    throw new NotFoundError('That target no longer exists.');
  }
  await kpi.assertCanEdit(before, viewer);

  const updated = await kpi.updateTarget(before, body, viewer);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'kpi_target.update',
    entity_type: 'kpi_targets',
    entity_id: id,
    before: auditImage(before),
    after: {
      person: before.person,
      metric: updated.metric_key,
      label: updated.label,
      target_value: updated.target,
      source: updated.source,
      auto_feed: updated.auto_feed,
    },
  });
  return withMeta(updated);
});

export const DELETE = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const id = targetId(req);

  const kpi = getKpiService();
  const before = await kpi.getTarget(id);
  if (!before) {
    throw new NotFoundError('That target no longer exists.');
  }
  await kpi.assertCanEdit(before, viewer);

  await kpi.deleteTarget(id);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'kpi_target.delete',
    entity_type: 'kpi_targets',
    entity_id: id,
    before: auditImage(before),
  });
  return withMeta({ deleted: true });
});

/** Parse the JSON body, surfacing a malformed body as a plain 400. */
async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequestError('Send a JSON body.');
  }
}

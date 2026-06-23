// PATCH /api/deliverables/:id -> apply a status change (contract vocabulary,
// mapped to legacy) and an optional progress note to a kpi_deliverables row.
// Ported from the NestJS DeliverablesController.update. Postgres-only write,
// audited, zod-validated at the boundary.
//
// Thin route, mirroring the backend exactly:
//   1. Validate the [id] segment as a UUID (Nest's ParseUUIDPipe -> 400).
//   2. Validate the body against the re-expressed UpdateDeliverableDto
//      (class-validator IsIn/IsOptional/IsString/MaxLength(500) -> 400).
//   3. Load the row; 404 in plain words when it no longer exists.
//   4. assertCanEdit enforces the same role/team scope (admins any row, a
//      dept head only their team, everyone else refused) -> 403.
//   5. Apply the update, then write the audit_log row with the same before/
//      after images the backend wrote.
//
// No patient PII is involved; the handler's global sweep is the backstop.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, NotFoundError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import {
  deliverablesService,
  STATUS_WRITE_MAP,
  type DeliverableRow,
} from '@/lib/server/services/deliverables';

// Node runtime: the service reaches pg through getPool(), and getAudit() writes
// the audit_log row over the same pool.
export const runtime = 'nodejs';

// Re-expression of the backend ParseUUIDPipe on the :id route param.
const ID_SCHEMA = z.string().uuid();

// Re-expression of the backend UpdateDeliverableDto (class-validator):
//   status       @IsIn(['done','in_progress','in_review','needs_start'])
//   progress_note  @IsOptional() @IsString() @MaxLength(500)
// on_track is computed, not settable: it has no legacy state behind it.
const UPDATE_SCHEMA = z.object({
  status: z.enum(['done', 'in_progress', 'in_review', 'needs_start']),
  progress_note: z.string().max(500).optional(),
});

/** The audit images for kpi_deliverables writes: the fields a write can
 *  touch plus enough context to read the log alone. Verbatim from the backend
 *  controller's auditImage(). */
function auditImage(row: DeliverableRow) {
  return {
    name: row.name,
    owner: row.owner,
    status: row.status,
    notes: row.notes,
    period: row.period,
  };
}

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  // Pull the [id] segment from the path: /api/deliverables/<id>. Reading it from
  // the URL keeps the handler signature uniform with the other routes.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const rawId = decodeURIComponent(segments[segments.length - 1] ?? '');
  const idResult = ID_SCHEMA.safeParse(rawId);
  if (!idResult.success) {
    throw new BadRequestError('Validation failed (uuid is expected)');
  }
  const id = idResult.data;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = UPDATE_SCHEMA.safeParse(json);
  if (!parsed.success) {
    throw new BadRequestError('Bad request.');
  }
  const body = parsed.data;

  const before = await deliverablesService.getById(id);
  if (!before) {
    throw new NotFoundError('That deliverable no longer exists.');
  }
  await deliverablesService.assertCanEdit(before, viewer);

  const updated = await deliverablesService.update(
    before,
    {
      legacyStatus: STATUS_WRITE_MAP[body.status],
      progressNote: body.progress_note,
    },
    viewer,
  );
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'kpi_deliverable.update',
    entity_type: 'kpi_deliverables',
    entity_id: id,
    before: auditImage(before),
    after: {
      name: before.name,
      owner: before.owner,
      status: STATUS_WRITE_MAP[body.status],
      notes: body.progress_note?.trim() || before.notes,
      period: before.period,
    },
  });
  return withMeta(updated);
});

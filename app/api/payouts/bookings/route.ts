// GET /api/payouts/bookings?cycle=YYYY-MM
// Per-booking ledger for a cycle: gross vs Saleem revenue, the rule applied,
// patient initials, plus manual free-appointment rows. Ported from the NestJS
// backend PayoutsController.bookings. Visible to any signed-in viewer (and the
// MCP).
//
// Thin: resolve the viewer, read and validate the optional ?cycle (backend
// CycleQueryDto), call the commission service, return the branded envelope.
//
// PRIVACY (NHRA): each CRM-derived row carries patient_ref (Zoho id + initials)
// always, and the patient name field only when the REAL viewer holds
// sees_patient_names, gated per-field inside the service via
// patientSerializer.withName. Manual rows carry no patient identity. The
// handler's global sweepPatientPii is the backstop.
//
// Node runtime: the service reaches pg (pool) and Zoho through getCrmRead().
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { getCommissionService } from '@/lib/server/services/payouts';

export const runtime = 'nodejs';

// Mirrors the backend CycleQueryDto: cycle is optional but, when present, must
// look like 2026-06.
function readCycle(req: Request): string | undefined {
  const raw = new URL(req.url).searchParams.get('cycle');
  if (raw == null) return undefined;
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new BadRequestError('cycle must look like 2026-06.');
  }
  return raw;
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const cycle = readCycle(req);
  const { data, parts } = await getCommissionService().bookings(viewer, cycle);
  return withMeta(data, mergeMeta(parts));
});

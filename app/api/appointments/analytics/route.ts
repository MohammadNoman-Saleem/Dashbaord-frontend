// GET /api/appointments/analytics?period=mtd|qtd|ytd|all[&month=YYYY-MM]
// Read-only analytics over the Appointment_Bookings module: period-filtered
// metrics, the fixed-order stage breakdown, per-doctor activity, and the full
// filtered row list. Thin: resolve the viewer, read and validate the period,
// call the appointments service, return the { data, meta } envelope with merged
// source meta. Reuses the same cached bookings read as /api/appointments.
//
// Privacy (NHRA): each row carries a patient_ref (id plus initials). The
// per-field gate inside the service appends the patient name field only for a
// viewer holding sees_patient_names; the handler's global sweep is the backstop
// that deep-deletes any such field that slips through. The booking Email is a
// server-side join key only and never reaches this payload.
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { appointmentsService } from '@/lib/server/services/appointments';
import type { AppointmentsPeriod } from '@/lib/api/contract';

// Node runtime: the service reaches pg/Zoho through getCrmRead().
export const runtime = 'nodejs';

const PERIODS: readonly AppointmentsPeriod[] = ['mtd', 'qtd', 'ytd', 'all'];

function readPeriod(req: Request): AppointmentsPeriod {
  const raw = new URL(req.url).searchParams.get('period');
  return PERIODS.includes(raw as AppointmentsPeriod)
    ? (raw as AppointmentsPeriod)
    : 'mtd';
}

// A specific calendar month as YYYY-MM, when the caller wants one month rather
// than a rolling period. Anything not shaped YYYY-MM is ignored so the period
// keyword applies instead.
function readMonth(req: Request): string | undefined {
  const raw = new URL(req.url).searchParams.get('month');
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : undefined;
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  const period = readPeriod(req);
  const month = readMonth(req);
  const { data, parts } = await appointmentsService.analytics(
    period,
    viewer,
    month,
  );
  return withMeta(data, mergeMeta(parts));
});

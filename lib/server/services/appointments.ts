// Today's consultations plus recently completed ones, from the
// Appointment_Bookings custom module. Times render in Asia/Bahrain. Fee
// state mapping follows the booking Status vocabulary: payment pending is
// a hold, a confirmed or in-session consult is paid, Done is done. Test
// bookings (Rate <= 1) are excluded, matching the legacy routes.
//
// Ported from the NestJS backend src/appointments/appointments.service.ts. The
// @Injectable AppointmentsService with its CrmReadService and PatientSerializer
// constructor injections becomes a plain exported object whose methods read the
// foundation singletons: getCrmRead() for the cached bookings read and the
// shared patientSerializer for the per-field patient gate. Every time, fee and
// label rule is unchanged; only the DI seam moved.
//
// Privacy (NHRA, compliance-critical): each appointment row carries a
// patient_ref (id plus initials) from the patientSerializer. patient_name is
// appended only for viewers who hold sees_patient_names (Fatima, Razan), via
// patientSerializer.withName, and the handler's global sweep removes any
// patient_name that slips through. The booking Email field is a server-side
// join key ONLY: it is never read into a row here, never serialized, never
// logged. Patient values are never logged in this service.
//
// SERVER ONLY. Node runtime (it reaches pg/Zoho through getCrmRead()).
import { getCrmRead, type BookingRecord } from '../crm-read';
import { patientSerializer, type PatientRef } from '../privacy';
import type { SourceMeta } from '../envelope';
import type { RequestViewer } from '../auth/viewer';

export interface AppointmentRowData {
  time: string;
  doctor: string;
  patient_ref: PatientRef;
  patient_name?: string;
  product: string;
  fee_bhd: number;
  fee_state: 'paid' | 'hold' | 'done';
}

export interface AppointmentsPayload {
  today: AppointmentRowData[];
  recent_done: AppointmentRowData[];
}

const BAHRAIN_TZ = 'Asia/Bahrain';
const RECENT_DONE_SHOWN = 3;

function bahrainDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ });
}

function bahrainTime(iso: string | null): string {
  if (!iso) return '·';
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: BAHRAIN_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function feeState(status: string | null): 'paid' | 'hold' | 'done' {
  if (status === 'Done') return 'done';
  if (
    status === 'Confirmed' ||
    status === 'Session Started' ||
    status === 'Awaiting Review'
  ) {
    return 'paid';
  }
  return 'hold';
}

function doctorName(booking: BookingRecord): string {
  if (typeof booking.Doctor === 'string') return booking.Doctor;
  return booking.Doctor?.name ?? 'Unassigned';
}

function relativeDay(iso: string | null): string {
  if (!iso) return '·';
  const day = bahrainDay(iso);
  const now = new Date();
  if (day === bahrainDay(now.toISOString())) return 'Today';
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day === bahrainDay(yesterday.toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: BAHRAIN_TZ,
    month: 'short',
    day: 'numeric',
  });
}

// Build one appointment row. The patient reference (record id plus initials)
// is built for everyone; patientSerializer.withName then appends patient_name
// only for a viewer holding sees_patient_names. The booking Email is never
// touched here: it is a join key, not a payload field.
function toRow(
  booking: BookingRecord,
  viewer: RequestViewer,
  done: boolean,
): AppointmentRowData {
  const when = booking.From ?? booking.Created_At;
  const dayLabel = done ? relativeDay(when) : 'Today';
  const row: AppointmentRowData = {
    time: `${dayLabel} ${bahrainTime(when)}`.trim(),
    doctor: doctorName(booking),
    patient_ref: patientSerializer.ref(
      booking.Patient?.id ?? booking.id,
      booking.Patient?.name,
    ),
    product: booking.Type ?? 'Consult',
    fee_bhd: booking.Rate ?? 0,
    fee_state: feeState(booking.Status),
  };
  return patientSerializer.withName(row, booking.Patient?.name, viewer);
}

async function board(
  viewer: RequestViewer,
): Promise<{ data: AppointmentsPayload; parts: SourceMeta[] }> {
  const read = await getCrmRead().bookings();
  const real = read.data.filter((b) => (b.Rate ?? 0) > 1);
  const today = bahrainDay(new Date().toISOString());

  const todays = real
    .filter(
      (b) =>
        bahrainDay(b.From ?? b.Created_At) === today && b.Status !== 'Done',
    )
    .sort((a, b) => (a.From ?? '').localeCompare(b.From ?? ''))
    .map((b) => toRow(b, viewer, false));

  const recentDone = real
    .filter((b) => b.Status === 'Done')
    .sort((a, b) =>
      (b.From ?? b.Created_At ?? '').localeCompare(
        a.From ?? a.Created_At ?? '',
      ),
    )
    .slice(0, RECENT_DONE_SHOWN)
    .map((b) => toRow(b, viewer, true));

  return {
    data: { today: todays, recent_done: recentDone },
    parts: [read.meta],
  };
}

// The appointments service as a plain object, replacing the @Injectable
// AppointmentsService. The route handler calls board() exactly as the Nest
// controller called the injected service.
export const appointmentsService = {
  board,
};

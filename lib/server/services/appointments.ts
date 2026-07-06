// Today's consultations plus recently completed ones, from the
// Appointment_Bookings custom module. Times render in Asia/Bahrain. Each row
// carries the raw booking Status; the client styles it with
// appointmentStatusVariant to match the appointments page. Test bookings
// (Rate <= 1) are excluded, matching the legacy routes.
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
import {
  computeBookingSplit,
  getManualLedgerService,
  getPayoutRulesService,
  pickRules,
  segmentOf,
} from './payouts';
import { patientSerializer, type PatientRef } from '../privacy';
import type { SourceMeta } from '../envelope';
import type { RequestViewer } from '../auth/viewer';
import type {
  AppointmentsAnalyticsData,
  AppointmentsAnalyticsRow,
  AppointmentsDoctorRow,
  AppointmentsPeriod,
  AppointmentsStageCount,
  AppointmentsStatusCount,
  AppointmentsTypeCount,
} from '@/lib/api/contract';

export interface AppointmentRowData {
  id: string;
  time: string;
  doctor: string;
  patient_ref: PatientRef;
  patient_name?: string;
  product: string;
  fee_bhd: number;
  status: string;
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

function doctorName(booking: BookingRecord): string {
  if (typeof booking.Doctor === 'string') return booking.Doctor;
  return booking.Doctor?.name ?? 'Unassigned';
}

// The booking Doctor lookup's Zoho id, mirroring resolveLookup in payouts.ts:
// an id exists only when the field is an object, never for a bare string.
function doctorId(booking: BookingRecord): string | null {
  const field = booking.Doctor;
  if (field && typeof field === 'object') {
    return field.id != null ? String(field.id) : null;
  }
  return null;
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
    id: booking.id,
    time: `${dayLabel} ${bahrainTime(when)}`.trim(),
    doctor: doctorName(booking),
    patient_ref: patientSerializer.ref(
      booking.Patient?.id ?? booking.id,
      booking.Patient?.name,
    ),
    product: booking.Type ?? 'Consult',
    fee_bhd: booking.Rate ?? 0,
    status: booking.Status ?? '·',
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

// The six booking stages, in the fixed funnel order the page renders. Counts
// fall only into an exact Status match; any other status is ignored, matching
// the legacy analytics route.
const STAGE_ORDER = [
  'Pending Payment',
  'Pending',
  'Confirmed',
  'Session Started',
  'Awaiting Review',
  'Done',
] as const;

// Start of the period in Bahrain civil time, returned as the Bahrain calendar
// day string (YYYY-MM-DD) a booking's own Bahrain day is compared against. mtd
// is the first of the current month, qtd the first of the current quarter, ytd
// January 1, all has no start (null). Computing the boundary from the Bahrain
// day parts keeps the comparison entirely in Bahrain time, never the server's.
function periodStartDay(period: AppointmentsPeriod): string | null {
  if (period === 'all') return null;
  const parts = new Date().toLocaleDateString('en-CA', {
    timeZone: BAHRAIN_TZ,
  });
  const [year, month] = parts.split('-').map((n) => Number(n));
  if (period === 'ytd') return `${year}-01-01`;
  if (period === 'qtd') {
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return `${year}-${String(quarterMonth).padStart(2, '0')}-01`;
  }
  // mtd
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

// The [start, end) Bahrain-day bounds of a calendar month given as YYYY-MM, so
// a month filter is closed at both ends. end is the first day of the next month
// (exclusive), rolling the year at December. Returns null for a value that is
// not a real YYYY-MM, so the caller falls back to the period keyword.
function monthWindow(month: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const start = `${year}-${String(mon).padStart(2, '0')}-01`;
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  const end = `${nextYear}-${String(nextMon).padStart(2, '0')}-01`;
  return { start, end };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Normalized Type for classification and the diagnostic: trimmed, internal
// whitespace collapsed, lowercased. The raw field is free text and inconsistent
// ("Novo Instant", "obesity ", "Obesity Awareness"), so the distinct-value
// count and any future Novo-set match run on this form, never the raw string.
function normalizeType(t: string | null | undefined): string {
  return (t ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Build one analytics row. The patient reference (record id plus initials) is
// built for everyone through the same serializer board() uses; patient_name is
// appended only for a viewer holding sees_patient_names, via withName. The raw
// patient name is never assigned to the row outside that allowlisted path, and
// the booking Email is never touched here.
function toAnalyticsRow(
  booking: BookingRecord,
  viewer: RequestViewer,
): AppointmentsAnalyticsRow {
  const row: AppointmentsAnalyticsRow = {
    id: booking.id,
    name: booking.Name ?? '·',
    patient_ref: patientSerializer.ref(
      booking.Patient?.id ?? booking.id,
      booking.Patient?.name,
    ),
    doctor: doctorName(booking),
    status: booking.Status ?? '·',
    type: booking.Type ?? null,
    fee_bhd: booking.Rate != null ? booking.Rate : 0,
    date: booking.From ?? booking.Created_At ?? null,
  };
  return patientSerializer.withName(row, booking.Patient?.name, viewer);
}

// Analytics over the bookings module: period-filtered metrics, the fixed-order
// stage breakdown, per-doctor activity, and the full filtered row list. Reuses
// the same cached read, test-booking filter (Rate > 1), and patient gate as
// board(). Ported from the legacy /api/zoho/appointments route, with the period
// comparison moved to Bahrain civil time.
async function analytics(
  period: AppointmentsPeriod,
  viewer: RequestViewer,
  month?: string,
): Promise<{ data: AppointmentsAnalyticsData; parts: SourceMeta[] }> {
  const [read, ruleRows, doctorsRead, hospitalsRead, manualRead] =
    await Promise.all([
      getCrmRead().bookings(),
      getPayoutRulesService()
        .all()
        .then((rows) => ({ ok: true as const, rows }))
        .catch(() => ({ ok: false as const, rows: [] })),
      getCrmRead()
        .doctors()
        .then((r) => ({ ok: true as const, data: r.data }))
        .catch(() => ({ ok: false as const, data: [] })),
      getCrmRead()
        .hospitals()
        .then((r) => ({ ok: true as const, data: r.data }))
        .catch(() => ({ ok: false as const, data: [] })),
      getManualLedgerService()
        .all()
        .then((rows) => ({ ok: true as const, rows }))
        .catch(() => ({ ok: false as const, rows: [] })),
    ]);
  let real = read.data.filter((b) => (b.Rate ?? 0) > 1);

  // The reporting window as Bahrain-day bounds, [start, end). A specific month
  // (YYYY-MM) takes precedence and bounds both ends, so "June" means June only.
  // Otherwise the period keyword sets an open-ended start (end null); "all" has
  // neither bound. One inWindow test then covers bookings and manual rows alike.
  const win = month ? monthWindow(month) : null;
  const windowStart = win ? win.start : periodStartDay(period);
  const windowEnd = win ? win.end : null;
  const inWindow = (iso: string | null): boolean => {
    const day = bahrainDay(iso);
    if (day === '') return false;
    if (windowStart && day < windowStart) return false;
    if (windowEnd && day >= windowEnd) return false;
    return true;
  };
  real = real.filter((b) => inWindow(b.From ?? b.Created_At));

  const total = real.length;
  // Completed basis per the revenue spec: Done or Awaiting Review. Awaiting
  // Review means the call finished and the fee is already deducted, so it
  // counts. This one set drives the completed volume, gross, and Saleem income,
  // and matches the Commission tab so the two reconcile.
  const completedRows = real.filter(
    (b) => b.Status === 'Done' || b.Status === 'Awaiting Review',
  );
  const completed = completedRows.length;
  const revenue = round2(
    completedRows.reduce((sum, b) => sum + (b.Rate ?? 0), 0),
  );
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  const stageCounts = new Map<string, number>(STAGE_ORDER.map((s) => [s, 0]));
  for (const b of real) {
    const s = b.Status ?? '';
    if (stageCounts.has(s)) stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
  }
  const stage_breakdown: AppointmentsStageCount[] = STAGE_ORDER.map((name) => ({
    name,
    count: stageCounts.get(name) ?? 0,
  }));

  const doctorMap = new Map<string, AppointmentsDoctorRow>();
  for (const b of real) {
    const name = doctorName(b);
    let entry = doctorMap.get(name);
    if (!entry) {
      entry = { name, count: 0, done: 0, revenue_bhd: 0 };
      doctorMap.set(name, entry);
    }
    entry.count += 1;
    if (b.Status === 'Done' || b.Status === 'Awaiting Review') {
      entry.done += 1;
      entry.revenue_bhd = round2(entry.revenue_bhd + (b.Rate ?? 0));
    }
  }
  const by_doctor = [...doctorMap.values()].sort((a, b) => b.done - a.done);

  // Gross income (sum of Rate over completed consults plus any free-appointment
  // patient payments) and Saleem income (the commission-engine split plus the
  // free-appointment shares) over the completed set the doctor loop counts.
  // Reuses the shared engine and folds in the manual ledger so the figures match
  // the Commission tab, which uses the same Done or Awaiting Review basis and
  // counts free appointments too. splitByBooking carries each completed
  // consult's split out to its recent-table row. If the rules, doctors, or
  // hospitals read failed, the income fields stay undefined and the rest of the
  // payload still returns.
  const splitByBooking = new Map<
    string,
    { saleem_bhd: number; provider_payout_bhd: number; rule_label: string }
  >();
  let grossIncome: number | undefined;
  let saleemIncome: number | undefined;
  let commissionUnset: number | undefined;
  if (ruleRows.ok && doctorsRead.ok && hospitalsRead.ok) {
    const ruleSet = pickRules(ruleRows.rows);

    const docPctMap = new Map<string, number | null>();
    const docHospitalMap = new Map<string, string | null>();
    for (const d of doctorsRead.data) {
      const hosp =
        d.Parent_Account && typeof d.Parent_Account === 'object'
          ? d.Parent_Account.id != null
            ? String(d.Parent_Account.id)
            : null
          : null;
      docPctMap.set(String(d.id), d.Commission_Percentage ?? null);
      docHospitalMap.set(String(d.id), hosp);
    }

    const hospPctMap = new Map<string, number | null>();
    for (const h of hospitalsRead.data) {
      hospPctMap.set(String(h.id), h.Commission_Percentage ?? null);
    }

    let gross = 0;
    let saleem = 0;
    let unset = 0;
    for (const b of completedRows) {
      const id = doctorId(b);
      const docPct = id != null ? docPctMap.get(id) ?? null : null;
      const hospId = id != null ? docHospitalMap.get(id) ?? null : null;
      const hospPct = hospId != null ? hospPctMap.get(hospId) ?? null : null;
      const segment = segmentOf(b.Type);
      const rate = b.Rate ?? 0;
      gross = round2(gross + rate);
      const split = computeBookingSplit(
        segment,
        rate,
        docPct,
        hospPct,
        ruleSet,
        id,
      );
      saleem = round2(saleem + split.saleemRevenue);
      splitByBooking.set(b.id, {
        saleem_bhd: split.saleemRevenue,
        provider_payout_bhd: split.providerPayout,
        rule_label: split.ruleLabel,
      });
      const entry = doctorMap.get(doctorName(b));
      if (entry) {
        entry.saleem_income_bhd = round2(
          (entry.saleem_income_bhd ?? 0) + split.saleemRevenue,
        );
        // Diagnostic: the commission rate the engine resolved for this doctor,
        // their own first, then the hospital. Null means neither was set and the
        // booking used the rule default (often 0), which is where a wrong or
        // missing per-doctor percentage shows up.
        entry.commission_pct = docPct ?? hospPct;
      }
      // A standard booking that resolved no doctor or hospital percent fell to
      // the default. commissionSet is false exactly in that case (a zero
      // cascades like a blank), so reuse it rather than re-testing the inputs.
      if (!split.commissionSet) {
        unset += 1;
      }
    }
    // Fold in free-appointment (manual ledger) entries within the same window so
    // the totals reconcile with the Commission tab. Patient payments add to
    // gross (usually zero for free appointments); a positive Saleem share adds
    // to Saleem income, a negative share is a cost Saleem covers and adds
    // nothing here. These rows are not tied to a Zoho doctor, so they stay out
    // of the per-doctor breakdown.
    if (manualRead.ok) {
      for (const m of manualRead.rows) {
        if (!inWindow(m.booked_at)) continue;
        gross = round2(gross + m.patient_paid);
        if (m.saleem_share > 0) saleem = round2(saleem + m.saleem_share);
      }
    }
    grossIncome = gross;
    saleemIncome = saleem;
    commissionUnset = unset;
  }

  const recent = [...real]
    .sort((a, b) =>
      (b.From ?? b.Created_At ?? '').localeCompare(
        a.From ?? a.Created_At ?? '',
      ),
    )
    .map((b) => {
      const row = toAnalyticsRow(b, viewer);
      const split = splitByBooking.get(b.id);
      if (split) {
        row.saleem_bhd = split.saleem_bhd;
        row.provider_payout_bhd = split.provider_payout_bhd;
        row.rule_label = split.rule_label;
      }
      return row;
    });

  // Reconciliation diagnostic (revenue spec, step 1), over the same windowed,
  // real (Rate > 1) set the metrics use. status_breakdown shows the completed
  // basis gap (which statuses carry gross); type_distribution surfaces every
  // raw Type spelling with its normalized form and current track, so the Novo
  // set can be built from what the data actually contains.
  const statusAgg = new Map<string, { count: number; gross: number }>();
  for (const b of real) {
    const s = b.Status && b.Status.trim() ? b.Status : '(none)';
    const e = statusAgg.get(s) ?? { count: 0, gross: 0 };
    e.count += 1;
    e.gross = round2(e.gross + (b.Rate ?? 0));
    statusAgg.set(s, e);
  }
  const status_breakdown: AppointmentsStatusCount[] = [...statusAgg.entries()]
    .map(([status, v]) => ({ status, count: v.count, gross_bhd: v.gross }))
    .sort((a, b) => b.gross_bhd - a.gross_bhd);

  const typeAgg = new Map<string, number>();
  for (const b of real) {
    const raw = b.Type && b.Type.trim() ? b.Type : '(none)';
    typeAgg.set(raw, (typeAgg.get(raw) ?? 0) + 1);
  }
  const type_distribution: AppointmentsTypeCount[] = [...typeAgg.entries()]
    .map(([type_raw, count]) => {
      const isNone = type_raw === '(none)';
      const seg = segmentOf(isNone ? null : type_raw);
      return {
        type_raw,
        type_normalized: isNone ? '(none)' : normalizeType(type_raw),
        count,
        track: seg === 'novo' ? ('novo' as const) : ('standard' as const),
      };
    })
    .sort((a, b) => b.count - a.count);

  const data: AppointmentsAnalyticsData = {
    period,
    metrics: {
      total,
      completed,
      revenue_bhd: revenue,
      completion_rate_pct: completionRate,
      gross_income_bhd: grossIncome,
      saleem_income_bhd: saleemIncome,
      commission_unset: commissionUnset,
    },
    stage_breakdown,
    by_doctor,
    status_breakdown,
    type_distribution,
    recent,
  };

  return { data, parts: [read.meta] };
}

// The appointments service as a plain object, replacing the @Injectable
// AppointmentsService. The route handler calls board() exactly as the Nest
// controller called the injected service.
export const appointmentsService = {
  board,
  analytics,
};

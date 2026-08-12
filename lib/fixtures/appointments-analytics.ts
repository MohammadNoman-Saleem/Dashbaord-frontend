// Fixture for GET /api/appointments/analytics. A small fictional booking set
// shaped into the analytics payload: period-filtered metrics, the fixed-order
// stage breakdown, per-doctor activity, and the recent row list. All data is
// fictional. The period is read from params (default mtd) and echoed back; the
// row set itself is not re-filtered here, matching how the other fixtures hold
// one representative snapshot.
//
// Privacy: fictional patient names appear only when params.viewer simulates a
// Fatima or Razan session; the default variant carries the reference only,
// mirroring lib/fixtures/appointments.ts.
import type {
  AppointmentsAnalyticsData,
  AppointmentsAnalyticsRow,
  AppointmentsPeriod,
} from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const PERIODS: readonly AppointmentsPeriod[] = ['mtd', 'qtd', 'ytd', 'all']

const RECENT = [
  {
    id: 'apt-3001',
    saleem_id: 'SLM-APP-FX001A',
    admin_id: '1501',
    patient_ref: { zoho_id: 'C-206', initials: 'L' },
    doctor: 'Dr. Layla H.',
    status: 'Done',
    type: 'novo_instant',
    fee_bhd: 9.9,
    service_charge_bhd: 3,
    date: '2026-06-10T16:30:00+03:00',
    ends_at: '2026-06-10T16:45:00+03:00',
    duration_min: 15,
    patient_link: 'https://tellsaleem.com/appointment-pat/pat-FX0001A',
    doctor_link: 'https://doctor.tellsaleem.com/appointments/1501',
    guest_link: 'https://hospital.tellsaleem.com/appointment/SLM-APP-FX001A',
  },
  {
    id: 'apt-3000',
    saleem_id: 'SLM-APP-FX002B',
    admin_id: '1500',
    patient_ref: { zoho_id: 'C-205', initials: 'K' },
    doctor: 'Dr. S. Kareem',
    status: 'Confirmed',
    type: 'standard',
    fee_bhd: 18.0,
    service_charge_bhd: 5,
    date: '2026-06-10T12:00:00+03:00',
    ends_at: '2026-06-10T12:15:00+03:00',
    duration_min: 15,
    patient_link: 'https://tellsaleem.com/appointment-pat/pat-FX0002B',
    doctor_link: 'https://doctor.tellsaleem.com/appointments/1500',
    guest_link: 'https://hospital.tellsaleem.com/appointment/SLM-APP-FX002B',
  },
  {
    id: 'apt-2999',
    saleem_id: 'SLM-APP-FX003C',
    admin_id: '1499',
    patient_ref: { zoho_id: '0427', initials: 'G' },
    doctor: 'Dr. Aysha A.',
    status: 'Done',
    type: 'novo_scheduled',
    fee_bhd: 26.0,
    service_charge_bhd: 5,
    date: '2026-06-09T10:30:00+03:00',
    ends_at: '2026-06-09T10:45:00+03:00',
    duration_min: 15,
    patient_link: 'https://tellsaleem.com/appointment-pat/pat-FX0003C',
    doctor_link: 'https://doctor.tellsaleem.com/appointments/1499',
    guest_link: 'https://hospital.tellsaleem.com/appointment/SLM-APP-FX003C',
  },
  // A fully discounted consult: completed, counted, but no fee and therefore no
  // commission split, so the Saleem, provider and rule cells read as a dash.
  {
    id: 'apt-2997',
    saleem_id: 'SLM-APP-FX004D',
    admin_id: '1498',
    patient_ref: { zoho_id: 'C-203', initials: 'S' },
    doctor: 'Dr. Aysha A.',
    status: 'Done',
    type: 'novo_scheduled',
    fee_bhd: 0,
    service_charge_bhd: 0,
    date: '2026-06-09T09:00:00+03:00',
    ends_at: '2026-06-09T09:15:00+03:00',
    duration_min: 15,
    patient_link: 'https://tellsaleem.com/appointment-pat/pat-FX0004D',
    doctor_link: 'https://doctor.tellsaleem.com/appointments/1498',
    guest_link: 'https://hospital.tellsaleem.com/appointment/SLM-APP-FX004D',
  },
  // A cancelled booking, so the fixture exercises the terminal stages the funnel
  // now renders. Abandoned and cancelled rows can carry no reference and no
  // links, which is what the calm-dash cells are for.
  {
    id: 'apt-2998',
    saleem_id: null,
    admin_id: null,
    patient_ref: { zoho_id: 'C-204', initials: 'N' },
    doctor: 'Dr. Layla H.',
    status: 'Cancelled',
    type: 'standard',
    fee_bhd: 25.0,
    service_charge_bhd: 5,
    date: '2026-06-08T14:00:00+03:00',
    ends_at: null,
    duration_min: null,
    patient_link: null,
    doctor_link: null,
    guest_link: null,
  },
] satisfies AppointmentsAnalyticsRow[]

// Fictional names, keyed by Zoho reference.
const FICTIONAL_NAMES: Record<string, string> = {
  'C-206': 'Latifa Buali',
  'C-205': 'Khadija Rashed',
  '0427': 'Ghada Salman',
}

function withNames(rows: AppointmentsAnalyticsRow[]): AppointmentsAnalyticsRow[] {
  return rows.map((row) => {
    const name = FICTIONAL_NAMES[row.patient_ref.zoho_id]
    return name ? { ...row, patient_name: name } : row
  })
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const rawPeriod = String(params?.period ?? 'mtd')
  const period: AppointmentsPeriod = PERIODS.includes(rawPeriod as AppointmentsPeriod)
    ? (rawPeriod as AppointmentsPeriod)
    : 'mtd'

  const viewer = String(params?.viewer ?? '')
  const named = viewer === 'fatima' || viewer === 'razan'
  const recent = named ? withNames(RECENT) : RECENT

  const data = {
    period,
    metrics: {
      total: 5,
      completed: 3,
      cancelled: 1,
      no_show: 0,
      free: 1,
      // Unchanged by the free consult: it completes, but its fee is zero.
      revenue_bhd: 35.9,
      completion_rate_pct: 60,
      gross_income_bhd: 35.9,
      saleem_income_bhd: 10.4,
    },
    stage_breakdown: [
      { name: 'Pending Payment', count: 0 },
      { name: 'Pending', count: 0 },
      { name: 'Confirmed', count: 1 },
      { name: 'Session Started', count: 0 },
      { name: 'Awaiting Review', count: 0 },
      { name: 'Done', count: 3 },
      { name: 'Cancelled', count: 1 },
      { name: 'No Show', count: 0 },
    ],
    by_doctor: [
      { name: 'Dr. Layla H.', count: 1, done: 1, revenue_bhd: 9.9, saleem_income_bhd: 3.9 },
      { name: 'Dr. Aysha A.', count: 1, done: 1, revenue_bhd: 26.0, saleem_income_bhd: 6.5 },
      { name: 'Dr. S. Kareem', count: 1, done: 0, revenue_bhd: 0, saleem_income_bhd: 0 },
    ],
    status_breakdown: [
      { status: 'Done', count: 3, gross_bhd: 35.9 },
      { status: 'Cancelled', count: 1, gross_bhd: 25.0 },
      { status: 'Confirmed', count: 1, gross_bhd: 18.0 },
    ],
    // Raw spellings match the live Zoho vocabulary (snake_case machine values),
    // not the human-readable strings this fixture used to carry.
    type_distribution: [
      { type_raw: 'standard', type_normalized: 'standard', count: 2, track: 'standard' },
      { type_raw: 'novo_instant', type_normalized: 'novo_instant', count: 1, track: 'novo' },
      { type_raw: 'novo_scheduled', type_normalized: 'novo_scheduled', count: 2, track: 'novo' },
    ],
    recent,
  } satisfies AppointmentsAnalyticsData

  return { data, meta: meta() }
}

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
    name: 'Consult Now, dermatology',
    patient_ref: { zoho_id: 'C-206', initials: 'L' },
    doctor: 'Dr. Layla H.',
    status: 'Done',
    fee_bhd: 9.9,
    date: '2026-06-10T16:30:00+03:00',
  },
  {
    id: 'apt-3000',
    name: 'Scheduled, endocrinology',
    patient_ref: { zoho_id: 'C-205', initials: 'K' },
    doctor: 'Dr. S. Kareem',
    status: 'Confirmed',
    fee_bhd: 18.0,
    date: '2026-06-10T12:00:00+03:00',
  },
  {
    id: 'apt-2999',
    name: 'Novo track, family medicine',
    patient_ref: { zoho_id: '0427', initials: 'G' },
    doctor: 'Dr. Aysha A.',
    status: 'Done',
    fee_bhd: 26.0,
    date: '2026-06-09T10:30:00+03:00',
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
    metrics: { total: 3, completed: 2, revenue_bhd: 35.9, completion_rate_pct: 67 },
    stage_breakdown: [
      { name: 'Pending Payment', count: 0 },
      { name: 'Pending', count: 0 },
      { name: 'Confirmed', count: 1 },
      { name: 'Session Started', count: 0 },
      { name: 'Awaiting Review', count: 0 },
      { name: 'Done', count: 2 },
    ],
    by_doctor: [
      { name: 'Dr. Layla H.', count: 1, done: 1, revenue_bhd: 9.9 },
      { name: 'Dr. Aysha A.', count: 1, done: 1, revenue_bhd: 26.0 },
      { name: 'Dr. S. Kareem', count: 1, done: 0, revenue_bhd: 0 },
    ],
    recent,
  } satisfies AppointmentsAnalyticsData

  return { data, meta: meta() }
}

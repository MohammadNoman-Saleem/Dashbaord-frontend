// Fixture for GET /api/appointments. Today's rows plus the most recent done
// row from the approved mockup's appointments list. Fee states: paid, hold,
// done. The mockup's "Tomorrow 09:00" row is omitted because the contract
// shape carries only today and recent_done.
//
// Privacy: fictional patient names appear only when params.viewer simulates a
// Fatima or Razan session; the default variant carries the reference only.
import type { AppointmentRow, AppointmentsData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const TODAY = [
  {
    time: '10:30 AM',
    doctor: 'Dr. Aysha A.',
    patient_ref: { zoho_id: '0427', initials: 'G' },
    product: 'Novo track, family medicine',
    fee_bhd: 5.0,
    fee_state: 'paid',
  },
  {
    time: '12:00 PM',
    doctor: 'Dr. S. Kareem',
    patient_ref: { zoho_id: 'C-205', initials: 'K' },
    product: 'Scheduled, endocrinology',
    fee_bhd: 18.0,
    fee_state: 'hold',
  },
  {
    time: '4:30 PM',
    doctor: 'Dr. Layla H.',
    patient_ref: { zoho_id: 'C-206', initials: 'L' },
    product: 'Consult Now, dermatology',
    fee_bhd: 9.9,
    fee_state: 'hold',
  },
] satisfies AppointmentRow[]

const RECENT_DONE = [
  {
    time: 'Yesterday',
    doctor: 'Dr. R. Almannai',
    patient_ref: { zoho_id: 'C-198', initials: 'M' },
    product: 'Scheduled, cardiology',
    fee_bhd: 26.0,
    fee_state: 'done',
  },
] satisfies AppointmentRow[]

// Fictional names, keyed by Zoho reference.
const FICTIONAL_NAMES: Record<string, string> = {
  '0427': 'Ghada Salman',
  'C-205': 'Khadija Rashed',
  'C-206': 'Latifa Buali',
  'C-198': 'Maryam Darwish',
}

function withNames(rows: AppointmentRow[]): AppointmentRow[] {
  return rows.map((row) => {
    const name = FICTIONAL_NAMES[row.patient_ref.zoho_id]
    return name ? { ...row, patient_name: name } : row
  })
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const viewer = String(params?.viewer ?? '')
  const named = viewer === 'fatima' || viewer === 'razan'

  const data = {
    today: named ? withNames(TODAY) : TODAY,
    recent_done: named ? withNames(RECENT_DONE) : RECENT_DONE,
  } satisfies AppointmentsData

  return { data, meta: meta() }
}

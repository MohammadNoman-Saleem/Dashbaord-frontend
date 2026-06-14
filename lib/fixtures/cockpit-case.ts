// Fixture for GET /api/cockpit/case/:id. The fully detailed case is L01, lifted
// from the V4 mockup case file (lines 742-806). Other ids resolve to a smaller
// honest case built from the queue row so selecting any queue item works in
// fixture mode. All patient data is FICTIONAL.
//
// Privacy: patient_name is appended only when params.viewer simulates a Fatima
// or Razan session, mirroring the server rule (cockpit-sla-spec.md). It is
// rendered only by PatientRef. Provider clocks have no Zoho backing, so the
// partner chase note and the next-action approx flag carry the honest wording
// rather than a fabricated time.
import type { CockpitCaseData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-14T08:10:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const STEP_LABELS: Array<{ key: string; label: string }> = [
  { key: 'first_contact', label: 'First contact' },
  { key: 'info_collected', label: 'Info collected' },
  { key: 'partner_quotes', label: 'Partner quotes' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'decision', label: 'Decision' },
  { key: 'treatment', label: 'Treatment' },
]

// The current step per queue id, so any selected row resolves a coherent
// stepper. Defaults to first_contact for ids the fixture has no entry for.
const CURRENT_STEP: Record<string, string> = {
  L26: 'first_contact',
  L19: 'info_collected',
  L01: 'quotation',
  L22: 'partner_quotes',
  L20: 'info_collected',
  L13: 'decision',
  L24: 'decision',
  L29: 'info_collected',
}

const REF: Record<string, { initials: string; route: string; condition: string }> = {
  L26: { initials: 'A.H.', route: 'Bahrain -> Czech Republic', condition: 'Disc surgery' },
  L19: { initials: 'M.S.', route: 'Oman -> India', condition: 'Pediatric neurosurgery' },
  L01: { initials: 'S.A.', route: 'Saudi Arabia -> India', condition: 'Stroke' },
  L22: { initials: 'R.K.', route: 'Saudi Arabia -> India', condition: 'Stroke rehab' },
  L20: { initials: 'H.A.', route: 'Bahrain -> Jordan', condition: 'Autoimmune disease' },
  L13: { initials: 'N.F.', route: 'Bahrain -> Flexible', condition: 'Breast reduction' },
  L24: { initials: 'D.M.', route: 'Saudi Arabia -> No preference', condition: 'Dental implants' },
  L29: { initials: 'F.Q.', route: 'Saudi Arabia -> Czech Republic', condition: 'Multiple sclerosis' },
}

// Fictional names, served only to a Fatima or Razan session.
const NAMES: Record<string, string> = {
  L26: 'Aisha Hamad',
  L19: 'Maryam Saleh',
  L01: 'Sara Abdulla',
  L22: 'Rania Kamal',
  L20: 'Hessa Ali',
  L13: 'Noor Fadel',
  L24: 'Dalal Mansoor',
  L29: 'Fatin Qassim',
}

function steps(current: string): CockpitCaseData['steps'] {
  const idx = STEP_LABELS.findIndex((s) => s.key === current)
  return STEP_LABELS.map((s, i) => ({
    key: s.key,
    label: s.label,
    state: i < idx ? 'done' : i === idx ? 'cur' : 'todo',
  }))
}

// The full L01 case from the mockup.
function l01(): CockpitCaseData {
  return {
    lead_ref: { zoho_id: 'L01', initials: 'S.A.' },
    route: 'Saudi Arabia -> India',
    condition: 'Stroke',
    source: 'Meta lead form',
    in_funnel_days: 11,
    step_current: 'quotation',
    steps: steps('quotation'),
    next_action: {
      label: 'Follow up on quotation Q-2031',
      due_label: 'due in 18h',
      sla_rule: 'the 24h follow-up rule',
      // No quotation-sent field in Zoho; this clock runs off the proxy.
      approx: true,
      draft_message: null,
    },
    details: [
      { k: 'Condition', v: 'Ischemic stroke, rehab candidate' },
      { k: 'Budget band', v: 'BHD 4,000 to 6,000' },
      { k: 'Destination', v: 'India, Apollo preferred' },
      { k: 'Language', v: 'Arabic' },
      { k: 'Origin', v: 'Saudi Arabia (dialing code)' },
      { k: 'Travel window', v: 'July' },
    ],
    checklist: [
      { label: 'Medical reports', done: true, date: 'Jun 6' },
      { label: 'Imaging (MRI)', done: true, date: 'Jun 8' },
      { label: 'Passport copy', done: true, date: null },
      { label: 'Consent to share', done: true, date: null },
    ],
    notes: [
      {
        title: 'Call with patient, Jun 5, 14 min, AI notes confirmed by Fatima',
        body: 'Right-side weakness since March, six weeks of physio in Riyadh, wants a rehab-focused program. Auto-filled on confirm: condition, budget band, travel window.',
        source: 'ai',
      },
      {
        title: 'WhatsApp thread summary, updated 2h ago',
        body: 'Patient asked whether the quotation covers physiotherapy sessions. A suggested reply is ready in the composer.',
        source: 'ai',
      },
    ],
    partners: [
      {
        label: 'Apollo Hospitals, quote received Jun 10',
        detail: '1 request sent, 1 received. Partner price stays internal and is never shown to the patient.',
        state: 'good',
      },
    ],
    documents: [
      {
        label: 'Referral summary R-1042',
        detail: 'Generated from the case file, anonymized, consent on file, sent to Apollo Jun 7',
        status: 'Sent',
      },
      { label: 'Apollo quote', detail: 'Received Jun 10, internal only', status: 'Received' },
      {
        label: 'Saleem quotation Q-2031',
        detail: 'Generated from the Apollo quote, patient price set by Fatima, BHD 4,720, attached to the WhatsApp thread Jun 11',
        status: 'Sent',
      },
    ],
    activity: [
      {
        label: 'Quotation sent on WhatsApp, auto-logged',
        detail: 'Jun 11, 16:02, 24h follow-up clock started',
      },
      { label: 'Quote received from Apollo', detail: 'Jun 10, partner clock closed at day 3' },
      { label: 'Referral sent to Apollo', detail: 'Jun 7, 3-day partner clock started' },
    ],
  }
}

// A lean case for any other queue id, honest about the thinner Zoho backing.
function other(id: string): CockpitCaseData {
  const ref = REF[id] ?? { initials: id, route: 'Origin not set -> Destination not set', condition: 'Not set' }
  const current = CURRENT_STEP[id] ?? 'first_contact'
  return {
    lead_ref: { zoho_id: id, initials: ref.initials },
    route: ref.route,
    condition: ref.condition,
    source: 'Meta lead form',
    in_funnel_days: 4,
    step_current: current,
    steps: steps(current),
    next_action: {
      label: 'Open the case to see the next step',
      due_label: 'approximate',
      sla_rule: 'governing clock for this step',
      approx: true,
      draft_message: null,
    },
    details: [
      { k: 'Condition', v: ref.condition },
      { k: 'Destination', v: ref.route.split(' -> ')[1] ?? 'Not set' },
      { k: 'Origin', v: ref.route.split(' -> ')[0] ?? 'Origin not set' },
    ],
    checklist: [
      { label: 'Medical reports', done: false, date: null },
      { label: 'Consent to share', done: false, date: null },
    ],
    notes: [
      {
        title: 'Lead created',
        body: 'Came in through the Meta lead form. No call notes yet.',
        source: 'system',
      },
    ],
    partners: [],
    documents: [],
    activity: [{ label: 'Lead created', detail: 'From the Meta lead form' }],
  }
}

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const id = String(params?.id ?? 'L01')
  const viewer = String(params?.viewer ?? '')
  const withName = viewer === 'fatima' || viewer === 'razan'

  const base = id === 'L01' ? l01() : other(id)
  const name = NAMES[id]
  const data: CockpitCaseData = withName && name ? { ...base, patient_name: name } : base
  return { data, meta: meta() }
}

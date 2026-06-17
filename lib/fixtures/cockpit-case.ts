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

// The fixture keys by the INTERNAL Zoho record id (the case-file lookup key the
// queue row carries in lead_ref.zoho_id), matching the live contract where the
// human ref is for display only and the internal id is the navigation key.
const L01_ID = '7064208000011120001'

// The current step per queue id, so any selected row resolves a coherent
// stepper. Defaults to first_contact for ids the fixture has no entry for.
const CURRENT_STEP: Record<string, string> = {
  '7064208000011120026': 'first_contact',
  '7064208000011120019': 'info_collected',
  '7064208000011120001': 'quotation',
  '7064208000011120022': 'partner_quotes',
  '7064208000011120020': 'info_collected',
  '7064208000011120013': 'decision',
  '7064208000011120024': 'decision',
  '7064208000011120029': 'info_collected',
}

const REF: Record<string, { initials: string; ref: string; route: string; condition: string }> = {
  '7064208000011120026': { initials: 'A.H.', ref: 'L26', route: 'Bahrain -> Czech Republic', condition: 'Disc surgery' },
  '7064208000011120019': { initials: 'M.S.', ref: 'L19', route: 'Oman -> India', condition: 'Pediatric neurosurgery' },
  '7064208000011120001': { initials: 'S.A.', ref: 'L01', route: 'Saudi Arabia -> India', condition: 'Stroke' },
  '7064208000011120022': { initials: 'R.K.', ref: 'L22', route: 'Saudi Arabia -> India', condition: 'Stroke rehab' },
  '7064208000011120020': { initials: 'H.A.', ref: 'L20', route: 'Bahrain -> Jordan', condition: 'Autoimmune disease' },
  '7064208000011120013': { initials: 'N.F.', ref: 'L13', route: 'Bahrain -> Flexible', condition: 'Breast reduction' },
  '7064208000011120024': { initials: 'D.M.', ref: 'L24', route: 'Saudi Arabia -> No preference', condition: 'Dental implants' },
  '7064208000011120029': { initials: 'F.Q.', ref: 'L29', route: 'Saudi Arabia -> Czech Republic', condition: 'Multiple sclerosis' },
}

// Fictional names, served only to a Fatima or Razan session.
const NAMES: Record<string, string> = {
  '7064208000011120026': 'Aisha Hamad',
  '7064208000011120019': 'Maryam Saleh',
  '7064208000011120001': 'Sara Abdulla',
  '7064208000011120022': 'Rania Kamal',
  '7064208000011120020': 'Hessa Ali',
  '7064208000011120013': 'Noor Fadel',
  '7064208000011120024': 'Dalal Mansoor',
  '7064208000011120029': 'Fatin Qassim',
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
    lead_ref: { zoho_id: L01_ID, initials: 'S.A.', ref: 'L01', ref_is_fallback: false },
    route: 'Saudi Arabia -> India',
    condition: 'Stroke',
    source: 'Meta lead form',
    record_type: 'deal',
    next_follow_up: '2026-06-20',
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
  const ref = REF[id] ?? { initials: '·', ref: id, route: 'Origin not set -> Destination not set', condition: 'Not set' }
  const current = CURRENT_STEP[id] ?? 'first_contact'
  // No Zoho_ID known for an unmapped id, so ref falls back to the record id and
  // the fallback marker says so, mirroring the live honesty rule.
  const isFallback = REF[id] == null
  return {
    lead_ref: { zoho_id: id, initials: ref.initials, ref: ref.ref, ref_is_fallback: isFallback },
    route: ref.route,
    condition: ref.condition,
    source: 'Meta lead form',
    // Lead-stage cases are unconverted leads; later steps are deals. The
    // set-follow-up control shows for deals only.
    record_type:
      current === 'first_contact' || current === 'info_collected'
        ? 'lead'
        : 'deal',
    next_follow_up: null,
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
  const id = String(params?.id ?? L01_ID)
  const viewer = String(params?.viewer ?? '')
  const withName = viewer === 'fatima' || viewer === 'razan'

  const base = id === L01_ID ? l01() : other(id)
  const name = NAMES[id]
  const data: CockpitCaseData = withName && name ? { ...base, patient_name: name } : base
  return { data, meta: meta() }
}

// Fixture for GET /api/cockpit/sla-policy. Static authored content with no
// upstream: the patient and provider SLA rule tables verbatim from
// cockpit-sla-spec.md, so the cockpit can display the rules in the UI. The
// build lead asked for the SLA details to live in the cockpit.
import type { CockpitSlaPolicyData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-14T08:10:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const PATIENT = [
  {
    key: 'first_contact',
    rule: 'First contact',
    threshold: '24h',
    counting: 'business',
    anchor_field: 'Intro_Call_Date_Time (stop)',
    proxy_fallback: 'Lead Created_Time start; not yet contacted if status is New or Intro Call Scheduled',
    applies_in: 'First contact',
  },
  {
    key: 'post_intro_followup',
    rule: 'Follow up after the intro message',
    threshold: '48h',
    counting: 'elapsed',
    anchor_field: 'Welcome_Message_Sent_Date',
    proxy_fallback: 'Last_Activity_Time',
    applies_in: 'Info collected',
  },
  {
    key: 'reports_window',
    rule: 'Waiting for medical reports',
    threshold: '7 to 10 days',
    counting: 'elapsed',
    anchor_field: 'Stage_Entry_Date',
    proxy_fallback: 'Last_Activity_Time. Nothing due before day 7, overdue past day 10',
    applies_in: 'Info collected and Partner quotes',
  },
  {
    key: 'post_quote_followup',
    rule: 'Follow up after the quotation',
    threshold: '24h',
    counting: 'elapsed',
    anchor_field: 'No quotation-sent field',
    proxy_fallback: 'Stage_Entry_Date into the Quote stage, else Last_Activity_Time',
    applies_in: 'Quotation',
  },
  {
    key: 'final_response',
    rule: 'Final response after the last follow-up',
    threshold: '48h',
    counting: 'elapsed',
    anchor_field: 'Last_Patient_Comm_Date',
    proxy_fallback: 'Last_Activity_Time',
    applies_in: 'Decision',
  },
  {
    key: 'not_qualified',
    rule: 'Park if quiet, or on refusal',
    threshold: '36h',
    counting: 'business',
    anchor_field: 'Reason_Not_Qualified set means refused now',
    proxy_fallback: 'Created_Time for the 36h timer',
    applies_in: 'Any active step. Drives the park if quiet suggestion',
  },
] satisfies CockpitSlaPolicyData['patient']

const PROVIDER = [
  {
    key: 'provider_quote_followup',
    rule: 'Follow up after requesting the partner quote',
    threshold: '3 days',
    backing: 'Not tracked in Zoho yet. If a deal is in the Partner quotes step, an approximate clock off Stage_Entry_Date may be shown, clearly marked approximate.',
  },
  {
    key: 'provider_more_time_followup',
    rule: 'Follow up if the partner needs more time',
    threshold: '1 week',
    backing: 'Not tracked in Zoho yet.',
  },
] satisfies CockpitSlaPolicyData['provider']

const BUSINESS_DAY_NOTE =
  'Working week is Sunday to Thursday, Asia/Bahrain. Friday and Saturday are non-working. Business-hours counting applies only to first contact (24h) and park if quiet (36h); all other clocks use plain elapsed time.'

export function fixture(): Envelope<unknown> {
  const data = {
    patient: PATIENT,
    provider: PROVIDER,
    business_day_note: BUSINESS_DAY_NOTE,
  } satisfies CockpitSlaPolicyData
  return { data, meta: meta() }
}

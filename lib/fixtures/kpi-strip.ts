// Fixture for GET /api/kpi/strip?person=. Four cards per person for all 8
// people, metric keys and treatments per 02_Frontend_Spec section 8.1, values
// from the approved mockup's per-person home configuration.
import type { KpiStripCard } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const REVENUE_SPARK = [29, 30, 32, 31, 35, 34, 38, 40, 42]

const STRIPS = {
  khalid: [
    {
      metric_key: 'completed_cases_june',
      label: 'Completed cases, June',
      value_display: '14',
      small: 'of 20',
      bar_pct: 70,
      note: 'On pace for Jun 28',
      dot: 'good',
    },
    {
      metric_key: 'platform_revenue',
      label: 'Platform revenue',
      value_display: 'BHD 4,180',
      small: '+22% vs May',
      spark: REVENUE_SPARK,
      note: 'Verified, admin panel',
      dot: 'good',
    },
    {
      metric_key: 'leads_june',
      label: 'Leads, June',
      value_display: '41',
      small: 'of 60',
      bar_pct: 68,
      note: 'CPL BHD 7.2, under the cap',
      dot: 'good',
    },
    {
      metric_key: 'providers_live',
      label: 'Providers live',
      value_display: '12',
      small: 'target 10',
      bar_pct: 100,
      bar_state: 'good',
      note: 'Ahead of target',
      dot: 'good',
    },
  ],
  fatima: [
    {
      metric_key: 'new_leads_to_contact',
      label: 'New leads to contact',
      value_display: '5',
      note: '2 still inside the 2-hour window',
      dot: 'good',
    },
    {
      metric_key: 'overdue_replies',
      label: 'Overdue replies',
      value_display: '2',
      note: 'Oldest is Lead 0395, 6 days quiet',
      dot: 'warn',
    },
    {
      metric_key: 'followups_due_today',
      label: 'Follow-ups due today',
      value_display: '6',
      note: '3 are quick WhatsApp sends',
      dot: 'good',
    },
    {
      metric_key: 'consults_today',
      label: 'Consults today',
      value_display: '3',
      note: 'First at 10:30 AM with Dr. Aysha A.',
      dot: 'good',
    },
  ],
  afaf: [
    {
      metric_key: 'leads_june',
      label: 'Leads, June',
      value_display: '41',
      small: 'of 60',
      bar_pct: 68,
      note: 'On pace for the 28th',
      dot: 'good',
    },
    {
      metric_key: 'cpl',
      label: 'Cost per lead',
      value_display: 'BHD 7.2',
      small: 'cap 8.0',
      bar_pct: 90,
      bar_state: 'good',
      note: 'Two weeks over the cap pauses the campaign',
      dot: 'good',
    },
    {
      metric_key: 'whatsapp_reply_rate',
      label: 'WhatsApp reply rate',
      value_display: '18%',
      small: 'target 15',
      bar_pct: 100,
      bar_state: 'good',
      note: 'Sunday send, opted-in only',
      dot: 'good',
    },
    {
      metric_key: 'ig_reach',
      label: 'Instagram reach',
      value_display: '96k',
      small: '+12%',
      spark: [60, 64, 62, 70, 74, 78, 82, 88, 96],
      note: 'Organic, May to June',
      dot: 'good',
    },
  ],
  razan: [
    {
      metric_key: 'consults_today',
      label: 'Consults today',
      value_display: '3',
      note: 'All confirmed, fees on hold',
      dot: 'good',
    },
    {
      metric_key: 'providers_awaiting_signoff',
      label: 'Awaiting your sign-off',
      value_display: '2',
      small: 'providers',
      note: 'Dr. M. and Alnoor Clinic, checklist passed',
      dot: 'warn',
    },
    {
      metric_key: 'treatment_in_progress',
      label: 'Treatment in progress',
      value_display: '4',
      small: 'patients',
      note: 'All replied within the last 24 hours',
      dot: 'good',
    },
    {
      metric_key: 'checkins_due',
      label: 'Check-ins due',
      value_display: '2',
      small: 'today',
      note: 'Patient E. asked for after 4 PM',
      dot: 'good',
    },
  ],
  aziz: [
    {
      metric_key: 'handoffs_on_time_pct',
      label: 'Handoffs on time',
      value_display: '92%',
      small: 'target 95',
      bar_pct: 97,
      bar_state: 'warn',
      note: '3 misses, all Thursday evening',
      dot: 'warn',
    },
    {
      metric_key: 'handoffs_count',
      label: 'On-time handoffs',
      value_display: '31',
      small: 'of 34',
      note: 'Leads logged, bugs routed, releases announced',
      dot: 'good',
    },
    {
      metric_key: 'saturday_updates_in',
      label: 'Saturday updates in',
      value_display: '7',
      small: 'of 8',
      note: 'Chase the last one by noon',
      dot: 'warn',
    },
    {
      metric_key: 'open_urgent',
      label: 'Open urgent items',
      value_display: '3',
      note: 'Oldest is 1 day, the portal bug',
      dot: 'good',
    },
  ],
  noman: [
    {
      metric_key: 'sources_steady',
      label: 'Data sources steady',
      value_display: '5',
      small: 'of 7',
      note: 'Mixpanel limited, one agent stalled',
      dot: 'warn',
    },
    {
      metric_key: 'paid_conversion',
      label: 'Paid conversion',
      value_display: '6.8%',
      small: 'verified',
      note: 'Full booking, end to end',
      dot: 'good',
    },
    {
      metric_key: 'agents_healthy',
      label: 'Agents healthy',
      value_display: '5',
      small: 'of 6',
      note: 'Corporate list builder stalled',
      dot: 'warn',
    },
    {
      metric_key: 'funnel_reports',
      label: 'Funnel report',
      value_display: '1',
      small: 'of 2',
      bar_pct: 50,
      note: 'Next one due Friday',
      dot: 'good',
    },
  ],
  alsaeed: [
    {
      metric_key: 'uptime_30d',
      label: 'Uptime, 30 days',
      value_display: '99.9%',
      note: 'No patient-facing incidents',
      dot: 'good',
    },
    {
      metric_key: 'open_bugs',
      label: 'Open bugs',
      value_display: '7',
      small: '2 patient-facing',
      note: 'Photo upload is the oldest',
      dot: 'warn',
    },
    {
      metric_key: 'sprint_progress',
      label: 'Sprint progress',
      value_display: '14',
      small: 'of 22',
      bar_pct: 64,
      note: 'On pace for the Jun 18 release',
      dot: 'good',
    },
    {
      metric_key: 'agents_stalled',
      label: 'Agents stalled',
      value_display: '1',
      small: 'of 6',
      note: 'Corporate list builder, since Monday',
      dot: 'warn',
    },
  ],
  isa: [
    {
      metric_key: 'outstanding_to_us',
      label: 'Outstanding to us',
      value_display: 'BHD 3,750',
      note: 'Partner invoice, due Jun 20',
      dot: 'warn',
    },
    {
      metric_key: 'platform_revenue',
      label: 'Platform revenue',
      value_display: 'BHD 4,180',
      small: '+22%',
      spark: REVENUE_SPARK,
      note: 'Verified, admin panel',
      dot: 'good',
    },
    {
      metric_key: 'provider_payouts_cycle',
      label: 'Provider payouts',
      value_display: 'BHD 2,610',
      note: 'Cycle closes Jun 15',
      dot: 'good',
    },
    {
      metric_key: 'investor_update_status',
      label: 'Investor update',
      value_display: 'Sent',
      small: 'Jun 5',
      note: 'Next one compiles Jul 3',
      dot: 'good',
    },
  ],
} satisfies Record<string, KpiStripCard[]>

type PersonKey = keyof typeof STRIPS

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const requested = String(params?.person ?? 'khalid')
  const key = (requested in STRIPS ? requested : 'khalid') as PersonKey
  return { data: STRIPS[key], meta: meta() }
}

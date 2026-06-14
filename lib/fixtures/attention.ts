// Fixture for GET /api/attention?person=. Two to three items per person per
// the launch rule set in 02_Frontend_Spec section 8.1, copy from the approved
// mockup. The mockup's "9:14 AM" rate-limit time is shifted to 7:14 AM so the
// copy stays consistent with the fixed 7:42 AM fixture timeline.
import type { AttentionItem } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const ITEMS = {
  khalid: [
    {
      icon: 'alert',
      warn: true,
      title: 'Novo funnel numbers look off. The fix is in review, due Jun 12.',
      text: 'Trust the verified 86 consults, not the funnel zero.',
      link: { view: 'funnels', tab: 'novo' },
    },
    {
      icon: 'flag',
      warn: true,
      title: '2 corporate deals are waiting on your pricing approval.',
      text: 'Alpha Insurance and a logistics firm, both in Agreement.',
      link: { view: 'cases' },
    },
    {
      icon: 'clock',
      warn: false,
      title: 'Novo renewal proposal has not started. 20 days to month end.',
      text: 'The highest-leverage move for the November gap.',
      link: { view: 'kpis' },
    },
  ],
  fatima: [
    {
      icon: 'clock',
      warn: true,
      title: 'Patient E. asked for a call before 5 PM.',
      text: 'She prefers after 4. Book the slot now.',
      link: { view: 'cases' },
    },
    {
      icon: 'alert',
      warn: true,
      title: 'Two payment links expire tonight.',
      text: 'Patient D. and Patient H. Resend if unpaid by 6 PM.',
      link: { view: 'cases' },
    },
    {
      icon: 'cal',
      warn: false,
      title: 'The Novo slot for Patient G. needs confirming with Dr. Kareem.',
      text: 'New lead, 50 minutes old.',
      link: { view: 'cases' },
    },
  ],
  afaf: [
    {
      icon: 'alert',
      warn: true,
      title: 'The Meta creative is tiring at day 9.',
      text: 'Clicks up, leads flat. The new cut goes live Thursday.',
      link: { view: 'marketing' },
    },
    {
      icon: 'mega',
      warn: false,
      title: "Sunday's WhatsApp send is waiting on your approval.",
      text: 'Drafted and audited. One tap to schedule.',
      link: { view: 'marketing' },
    },
    {
      icon: 'user',
      warn: false,
      title: '2 ad leads arrived without a phone number.',
      text: 'Check the lead form before the next flight.',
      link: { view: 'marketing' },
    },
  ],
  razan: [
    {
      icon: 'check',
      warn: true,
      title: '2 providers passed the checklist. Your sign-off is the last step.',
      text: 'Dr. M., cardiology, and Alnoor Clinic.',
      link: { view: 'cases' },
    },
    {
      icon: 'clock',
      warn: false,
      title: "Patient E.'s 72-hour check-in is due today.",
      text: 'Treatment finished Jun 7. She prefers a call after 4.',
      link: { view: 'cases' },
    },
    {
      icon: 'alert',
      warn: false,
      title: "Dr. M.'s documents are 4 days late.",
      text: 'A nudge from you usually lands better than ours.',
      link: { view: 'cases' },
    },
  ],
  aziz: [
    {
      icon: 'alert',
      warn: true,
      title: 'A website lead sat 5 hours before logging on Thursday.',
      text: 'Root cause started. Evening coverage looks like the gap.',
      link: { view: 'cases' },
    },
    {
      icon: 'clock',
      warn: true,
      title: '1 Saturday update is still missing.',
      text: 'Chase it by noon so the weekly compile is complete.',
      link: { view: 'kpis' },
    },
    {
      icon: 'cases',
      warn: false,
      title: 'Both SLA breaches trace to evening coverage.',
      text: 'Worth proposing a rota tweak at the Sunday meeting.',
      link: { view: 'cases' },
    },
  ],
  noman: [
    {
      icon: 'funnel',
      warn: true,
      title: 'Your Novo funnel fix is in review, due Jun 12.',
      text: 'Until it ships, the Novo tab carries a do-not-trust note.',
      link: { view: 'funnels', tab: 'novo' },
    },
    {
      icon: 'clock',
      warn: false,
      title: 'Mixpanel hit its request limit at 7:14 AM.',
      text: 'Saved numbers are showing. It resets within the hour.',
      link: { view: 'funnels', focus: 'refresh' },
    },
    {
      icon: 'alert',
      warn: false,
      title: 'Rage clicks on Pay during gateway timeouts.',
      text: 'Pair with Mehran on a clear waiting state.',
      link: { view: 'funnels', tab: 'uiux' },
    },
  ],
  alsaeed: [
    {
      icon: 'cpu',
      warn: true,
      title: 'The corporate list builder has been stalled since Monday.',
      text: 'Model service error. Restart it or reassign the run.',
      link: { view: 'agents', focus: 'agent-corporate-list' },
    },
    {
      icon: 'alert',
      warn: true,
      title: 'Doctor portal photo upload is failing for one provider.',
      text: 'Mehran is on it, due tomorrow.',
      link: { view: 'agents' },
    },
    {
      icon: 'check',
      warn: false,
      title: 'The Novo definition fix unblocks marketing reporting.',
      text: 'In review. A quick look today keeps it on schedule.',
      link: { view: 'agents' },
    },
  ],
  isa: [
    {
      icon: 'wallet',
      warn: true,
      title: 'Confirm receipt of the partner invoice before Thursday.',
      text: 'BHD 3,750, due Jun 20. A quick note keeps it moving.',
      link: { view: 'financials' },
    },
    {
      icon: 'cal',
      warn: false,
      title: 'June actuals are ready for the cashflow model.',
      text: "Drop them in before Friday's review.",
      link: { view: 'financials' },
    },
    {
      icon: 'split',
      warn: false,
      title: 'The payout cycle closes Jun 15.',
      text: 'Review the computed splits, one campaign booking flagged.',
      link: { view: 'financials', tab: 'commission' },
    },
  ],
} satisfies Record<string, AttentionItem[]>

type PersonKey = keyof typeof ITEMS

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const requested = String(params?.person ?? 'khalid')
  const key = (requested in ITEMS ? requested : 'khalid') as PersonKey
  return { data: ITEMS[key], meta: meta() }
}

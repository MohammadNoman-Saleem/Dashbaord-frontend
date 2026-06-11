// Fixture for GET /api/marketing.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Marketing view). All data is fictional.
//
// The mockup shows no explicit WhatsApp reply-rate target; 15 is assumed so
// the 18% value reads as above target. The Instagram reach spark is invented
// (the mockup tile has no chart), rising about 12% over May to land on 96k.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { MarketingData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const MARKETING = {
  tiles: {
    leads: { value: 41, target: 60 },
    cpl: { value_bhd: 7.2, cap_bhd: 8.0 },
    whatsapp_reply_pct: { value: 18, target: 15 },
    ig_reach: { value: 96000, spark: [78000, 81000, 84500, 88000, 92000, 96000] },
  },
  channels: [
    {
      channel: 'Meta ads · medical travel video',
      leads: 19,
      spend_bhd: 138,
      cpl_display: '7.3',
      read: 'Creative tiring, day 9',
    },
    { channel: 'Google Search', leads: 9, spend_bhd: 81, cpl_display: '9.0', read: 'Watch CPL' },
    { channel: 'WhatsApp campaign', leads: 6, spend_bhd: 0, cpl_display: '·', read: 'Best converter' },
    { channel: 'TikTok boost', leads: 4, spend_bhd: 30, cpl_display: '7.5', read: 'Small test' },
    { channel: 'Instagram organic', leads: 3, spend_bhd: 0, cpl_display: '·', read: 'Steady' },
  ],
  moves: [
    {
      title: 'Refresh the medical travel creative',
      text: 'Day 9 fatigue: clicks up, leads flat. New cut Thursday.',
    },
    {
      title: 'Sunday WhatsApp send awaits approval',
      text: 'Drafted, audited, with Afaf for sign-off.',
    },
    {
      title: 'Content split holding at 50/30/20',
      text: 'Lead, trust, awareness. Non-negotiable mix.',
    },
    {
      title: '2 ad leads logged without a phone number',
      text: 'Check the lead form fields before the next flight.',
    },
  ],
} satisfies MarketingData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [
    {
      key: 'meta_connector_pending',
      title: 'Meta detail connects soon',
      text: 'Until then these numbers come from Mixpanel and the CRM.',
    },
  ],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: MARKETING, meta: META }
}

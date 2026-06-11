// Fixture for GET /api/brief/latest
// Values from the approved mockup: the home "Weekly brief" panel supplies the
// three highlights, the Agents view "Weekly brief, in full" card supplies the
// four department sections. Compiled Saturday 7:48 PM (Jun 6, 2026).
//
// Shape note: the third highlight is neutral in the mockup (steady icon, not
// a check or a warning); the contract only has a boolean `good`, so it is
// marked good: true.

import type { BriefData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const META = {
  updated_at: '2026-06-11T07:42:00+03:00',
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

const DATA = {
  compiled_at: '2026-06-06T19:48:00+03:00',
  highlights: [
    {
      title: '14 cases completed, 70% of the June target',
      text: 'Treatment mix is holding above the BHD 3,000 floor.',
      good: true,
    },
    {
      title: 'Lead response slipped twice last week',
      text: 'Both on Thursday evening. Aziz is on the root cause.',
      good: false,
    },
    {
      title: 'Novo consults steady at 11 per week',
      text: 'Renewal conversation is the lever for November.',
      good: true,
    },
  ],
  sections: [
    {
      title: 'Operations',
      content:
        '14 cases completed, 70% of target. Two SLA breaches, both Thursday evening, root cause underway. Treatment mix holds above the BHD 3,000 floor.',
      ran_at: '2026-06-06T19:31:00+03:00',
    },
    {
      title: 'Marketing',
      content:
        '41 leads at BHD 7.2 each. Meta creative tiring at day 9, refresh Thursday. WhatsApp remains the best converter.',
      ran_at: '2026-06-06T19:34:00+03:00',
    },
    {
      title: 'Finance',
      content:
        'BHD 3,750 outstanding from the partner invoice, due Jun 20. Platform revenue up 22% on May.',
      ran_at: '2026-06-06T19:38:00+03:00',
    },
    {
      title: 'Product',
      content:
        'Sprint 64% through. Novo funnel fix in review. Photo upload bug is the oldest open item.',
      ran_at: '2026-06-06T19:41:00+03:00',
    },
  ],
} satisfies BriefData

export function fixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  void params
  return { data: DATA, meta: META }
}

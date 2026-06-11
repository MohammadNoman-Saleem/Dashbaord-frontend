// Fixture for GET /api/kpi/team-summary?month=
// Values from the approved mockup, home view, "Team targets, June" panel
// (MiniBars). Warn state when behind, recovery state when ahead, per
// 02_Frontend_Spec.md section 8.1 (p-team-kpis).
//
// Shape note: the contract has no separate metric-label field, so `name`
// carries the mockup row label ("Cases · Fatima") rather than the bare
// person name.

import type { TeamSummaryData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const META = {
  updated_at: '2026-06-11T07:42:00+03:00',
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

const DATA = {
  rows: [
    {
      person_key: 'fatima',
      name: 'Cases · Fatima',
      pct: 70,
      state: 'on_track',
      summary_display: '14 / 20',
    },
    {
      person_key: 'afaf',
      name: 'Leads · Afaf',
      pct: 68,
      state: 'on_track',
      summary_display: '41 / 60',
    },
    {
      person_key: 'aziz',
      name: 'SLA · Aziz',
      pct: 92,
      state: 'behind',
      summary_display: '92 / 95%',
    },
    {
      person_key: 'razan',
      name: 'Providers · Razan',
      pct: 100,
      state: 'ahead',
      summary_display: '12 / 10',
    },
    {
      person_key: 'noman',
      name: 'Funnel report · Noman',
      pct: 50,
      state: 'on_track',
      summary_display: '1 / 2',
    },
  ],
} satisfies TeamSummaryData

export function fixture(
  params?: Record<string, string | number | undefined>
): Envelope<unknown> {
  // June 2026 is the only month seeded; any other month value falls back to it.
  void params
  return { data: DATA, meta: META }
}

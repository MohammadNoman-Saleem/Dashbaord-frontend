// Fixture for GET /api/cases/summary: the four KPI cards on the Cases view.
// Values from the approved mockup cases section. All data is fictional.
import type { CasesSummaryData } from '@/lib/api/contract'
import type { Envelope, Meta } from '@/lib/api/envelope'

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const DATA = {
  cards: [
    {
      metric_key: 'cases_active_deals',
      label: 'Active deals',
      value_display: '38',
      note: 'Across both patient pipelines',
      dot: 'good',
    },
    {
      metric_key: 'cases_new_this_week',
      label: 'New this week',
      value_display: '9',
      note: 'All logged within 4 hours',
      dot: 'good',
    },
    {
      metric_key: 'cases_running_late',
      label: 'Running late',
      value_display: '5',
      note: 'Worst is 4 days over',
      dot: 'warn',
    },
    {
      metric_key: 'cases_won_this_month',
      label: 'Won in June',
      value_display: '14',
      note: 'Target 20 by Jun 30',
      dot: 'good',
    },
  ],
} satisfies CasesSummaryData

export function fixture(
  _params?: Record<string, string | number | undefined>,
): Envelope<unknown> {
  return { data: DATA, meta: meta() }
}

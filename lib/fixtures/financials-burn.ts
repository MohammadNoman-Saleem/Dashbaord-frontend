// Fixture for GET /api/financials/burn.
// All data is fictional. Twelve months of burn joined with platform revenue
// (the same definition as the platform revenue card), plus the category
// breakdown from Zoho Books expense accounts.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FinancialsBurnData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const MONTHS = [
  { key: '2025-07', label: 'Jul 2025', burn_bhd: 3050, revenue_bhd: 980 },
  { key: '2025-08', label: 'Aug 2025', burn_bhd: 3210, revenue_bhd: 1250 },
  { key: '2025-09', label: 'Sep 2025', burn_bhd: 2890, revenue_bhd: 1120 },
  { key: '2025-10', label: 'Oct 2025', burn_bhd: 3340, revenue_bhd: 1810 },
  { key: '2025-11', label: 'Nov 2025', burn_bhd: 3120, revenue_bhd: 2090 },
  { key: '2025-12', label: 'Dec 2025', burn_bhd: 3580, revenue_bhd: 2510 },
  { key: '2026-01', label: 'Jan 2026', burn_bhd: 3410, revenue_bhd: 2780 },
  { key: '2026-02', label: 'Feb 2026', burn_bhd: 3260, revenue_bhd: 3070 },
  { key: '2026-03', label: 'Mar 2026', burn_bhd: 3490, revenue_bhd: 3320 },
  { key: '2026-04', label: 'Apr 2026', burn_bhd: 3370, revenue_bhd: 3620 },
  { key: '2026-05', label: 'May 2026', burn_bhd: 3640, revenue_bhd: 3920 },
  { key: '2026-06', label: 'Jun 2026', burn_bhd: 1980, revenue_bhd: 4180 },
]

const BURN = {
  this_month_bhd: 1980,
  last_month_bhd: 3640,
  change_pct: -46,
  months: MONTHS,
  by_category: [
    { category: 'Salaries and wages', total_bhd: 21400, this_month_bhd: 1100 },
    { category: 'Marketing and advertising', total_bhd: 6800, this_month_bhd: 420 },
    { category: 'Software subscriptions', total_bhd: 4100, this_month_bhd: 260 },
    { category: 'Rent', total_bhd: 3600, this_month_bhd: 0 },
    { category: 'Professional fees', total_bhd: 1900, this_month_bhd: 120 },
    { category: 'Travel', total_bhd: 1100, this_month_bhd: 80 },
  ],
  revenue_note:
    'Revenue is completed platform bookings, the same definition as the platform revenue card. Burn is Zoho Books expenses by account.',
} satisfies FinancialsBurnData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: BURN, meta: META }
}

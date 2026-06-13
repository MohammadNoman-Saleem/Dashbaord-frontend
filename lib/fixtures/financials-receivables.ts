// Fixture for GET /api/financials/receivables.
// All data is fictional. Aging buckets on days past due, the late-payer
// ranking by open balance, and approximate DSO. Customers are partners and
// corporates, never patients.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { FinancialsReceivablesData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const RECEIVABLES = {
  total_bhd: 5350,
  open_count: 7,
  overdue_count: 4,
  dso_days: 38,
  buckets: [
    { key: 'current', label: 'Not yet due', invoice_count: 3, amount_bhd: 1850 },
    { key: 'b30', label: '1 to 30 days', invoice_count: 2, amount_bhd: 1400 },
    { key: 'b60', label: '31 to 60 days', invoice_count: 1, amount_bhd: 1700 },
    { key: 'b90', label: '61 to 90 days', invoice_count: 0, amount_bhd: 0 },
    { key: 'b90p', label: 'Over 90 days', invoice_count: 1, amount_bhd: 400 },
  ],
  late_payers: [
    { customer: 'Novo Nordisk', open_invoices: 2, balance_bhd: 3100, oldest_overdue_days: 18 },
    { customer: 'Partner clinic listing pilot', open_invoices: 2, balance_bhd: 1450, oldest_overdue_days: 44 },
    { customer: 'Gulf corporate wellness', open_invoices: 2, balance_bhd: 530, oldest_overdue_days: 0 },
    { customer: 'Manama imaging center', open_invoices: 1, balance_bhd: 270, oldest_overdue_days: 96 },
  ],
} satisfies FinancialsReceivablesData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(_params?: Record<string, string | number | undefined>): Envelope<unknown> {
  return { data: RECEIVABLES, meta: META }
}

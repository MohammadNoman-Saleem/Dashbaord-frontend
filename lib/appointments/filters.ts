// Client-side filters for the appointments table. Pure functions over the rows
// the analytics endpoint already returned, so applying a filter costs no request.
//
// SCOPE, stated plainly because it is a deliberate choice: these filters narrow
// the Recent appointments table ONLY. The KPI cards, the stage funnel, and the
// three breakdown tables keep describing the whole period, because they are
// server-computed aggregates. The table header therefore reports "X of Y" so a
// reader can see the two populations differ rather than assume they match.
//
// Within one group the selected values are ORed (two doctors means either
// doctor). Across groups they are ANDed (a doctor AND a status). An empty group
// is no constraint at all.
import type { AppointmentsAnalyticsRow } from '@/lib/api/contract'

/** How a row's fee reads. Derived from fee_bhd, never stored upstream: a paid
 *  consult is above BHD 1, a free one is exactly zero, and BHD 1 is the test
 *  placeholder the server currently filters out before we ever see it. */
export type FeeState = 'paid' | 'free' | 'test'

export const FEE_STATE_LABELS: Record<FeeState, string> = {
  paid: 'Paid',
  free: 'Free, BHD 0',
  test: 'Test, BHD 1',
}

/** The key a row with no appointment type groups under. */
export const NO_TYPE = '(none)'

export interface AppointmentFilterState {
  doctors: string[]
  statuses: string[]
  types: string[]
  feeStates: FeeState[]
  /** Inclusive Bahrain calendar days, YYYY-MM-DD. Null means unbounded. */
  from: string | null
  to: string | null
}

export const EMPTY_FILTERS: AppointmentFilterState = {
  doctors: [],
  statuses: [],
  types: [],
  feeStates: [],
  from: null,
  to: null,
}

const BAHRAIN_TZ = 'Asia/Bahrain'
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/

/** Today's Bahrain calendar day as YYYY-MM-DD. Bahrain time, not the browser's,
 *  so "today" means the same day the server's windows are computed in. */
export function bahrainToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ })
}

/** A row date's Bahrain calendar day, or '' when there is no usable date. */
export function bahrainDayOf(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ })
}

export function feeStateOf(row: AppointmentsAnalyticsRow): FeeState {
  if (row.fee_bhd > 1) return 'paid'
  if (row.fee_bhd === 0) return 'free'
  return 'test'
}

export function typeKeyOf(row: AppointmentsAnalyticsRow): string {
  return row.type && row.type.trim() ? row.type : NO_TYPE
}

/** The filter values actually present in this row set, so the panel only ever
 *  offers options that can match something. A dimension that is absent from the
 *  data (free bookings, while the server still excludes them) simply does not
 *  appear, and starts appearing on its own once the data carries it. */
export interface AppointmentFilterOptions {
  doctors: string[]
  statuses: string[]
  types: string[]
  feeStates: FeeState[]
}

const FEE_ORDER: FeeState[] = ['paid', 'free', 'test']

export function optionsFrom(
  rows: AppointmentsAnalyticsRow[]
): AppointmentFilterOptions {
  const doctors = new Set<string>()
  const statuses = new Set<string>()
  const types = new Set<string>()
  const feeStates = new Set<FeeState>()
  for (const row of rows) {
    if (row.doctor) doctors.add(row.doctor)
    if (row.status) statuses.add(row.status)
    types.add(typeKeyOf(row))
    feeStates.add(feeStateOf(row))
  }
  const collate = (a: string, b: string) => a.localeCompare(b)
  return {
    doctors: [...doctors].sort(collate),
    statuses: [...statuses].sort(collate),
    types: [...types].sort(collate),
    feeStates: FEE_ORDER.filter((f) => feeStates.has(f)),
  }
}

export function filterRows(
  rows: AppointmentsAnalyticsRow[],
  filters: AppointmentFilterState
): AppointmentsAnalyticsRow[] {
  const doctors = new Set(filters.doctors)
  const statuses = new Set(filters.statuses)
  const types = new Set(filters.types)
  const fees = new Set<FeeState>(filters.feeStates)
  const bounded = filters.from !== null || filters.to !== null

  return rows.filter((row) => {
    if (doctors.size > 0 && !doctors.has(row.doctor)) return false
    if (statuses.size > 0 && !statuses.has(row.status)) return false
    if (types.size > 0 && !types.has(typeKeyOf(row))) return false
    if (fees.size > 0 && !fees.has(feeStateOf(row))) return false
    if (bounded) {
      const day = bahrainDayOf(row.date)
      // A row with no usable date cannot satisfy a date bound.
      if (day === '') return false
      if (filters.from !== null && day < filters.from) return false
      if (filters.to !== null && day > filters.to) return false
    }
    return true
  })
}

/** How many individual filter values are applied, for the button's badge. A
 *  date range counts as one whichever end is set. */
export function activeFilterCount(filters: AppointmentFilterState): number {
  return (
    filters.doctors.length +
    filters.statuses.length +
    filters.types.length +
    filters.feeStates.length +
    (filters.from !== null || filters.to !== null ? 1 : 0)
  )
}

/** True when the applied range is exactly today, so the chip can say "Today"
 *  instead of repeating the date twice. */
export function isTodayRange(filters: AppointmentFilterState): boolean {
  if (filters.from === null || filters.to === null) return false
  const today = bahrainToday()
  return filters.from === today && filters.to === today
}

// URL is the single source of truth for filter state, matching how the page
// already carries period and month: a filtered view survives a reload and can be
// sent to someone else. Multi-value groups use repeated params rather than a
// delimiter, so a value containing a comma cannot corrupt the list.
export const FILTER_PARAM_KEYS = [
  'doctor',
  'status',
  'type',
  'fee',
  'from',
  'to',
] as const

/** The subset of URLSearchParams (and Next's readonly flavour) this needs. */
export interface ParamReader {
  get(name: string): string | null
  getAll(name: string): string[]
}

function readDay(raw: string | null): string | null {
  return raw && DAY_SHAPE.test(raw) ? raw : null
}

export function readFilters(params: ParamReader): AppointmentFilterState {
  const fees = params
    .getAll('fee')
    .filter((f): f is FeeState => f === 'paid' || f === 'free' || f === 'test')
  let from = readDay(params.get('from'))
  let to = readDay(params.get('to'))
  // A reversed range would silently match nothing; read it in the order meant.
  if (from !== null && to !== null && from > to) {
    const swap = from
    from = to
    to = swap
  }
  return {
    doctors: params.getAll('doctor').filter(Boolean),
    statuses: params.getAll('status').filter(Boolean),
    types: params.getAll('type').filter(Boolean),
    feeStates: fees,
    from,
    to,
  }
}

/** Append the filter state onto a params object being built for the next URL. */
export function writeFilters(
  filters: AppointmentFilterState,
  params: URLSearchParams
): void {
  for (const value of filters.doctors) params.append('doctor', value)
  for (const value of filters.statuses) params.append('status', value)
  for (const value of filters.types) params.append('type', value)
  for (const value of filters.feeStates) params.append('fee', value)
  if (filters.from !== null) params.set('from', filters.from)
  if (filters.to !== null) params.set('to', filters.to)
}

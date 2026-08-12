// Smoke test for the appointments table filters in lib/appointments/filters.ts.
// Compiles the module to CommonJS in a throwaway directory (the source is
// TypeScript, so plain node cannot import it directly) and asserts the filter
// semantics that matter:
//   - an empty group is no constraint
//   - values inside one group are ORed
//   - groups are ANDed with each other
//   - a date range is inclusive at both ends, in Bahrain days
//   - options are derived from the rows present, so an absent value is not offered
//   - URL round trip preserves the state, including a reversed range
// Run after build: node scripts/smoke-filters.mjs
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, '.smoke-filters')

const failures = []
function check(ok, message) {
  if (!ok) failures.push(message)
}

const tsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')
const compile = spawnSync(
  process.execPath,
  [tsc, '-p', path.join(root, 'scripts', 'tsconfig.filters.json')],
  { stdio: 'inherit' },
)
if (compile.status !== 0) {
  console.error('FAIL: tsc could not compile lib/appointments/filters.ts')
  process.exit(1)
}

try {
  const require = createRequire(import.meta.url)
  const f = require(path.join(outDir, 'lib', 'appointments', 'filters.js'))

  // Four rows spanning two doctors, three statuses, two types, two fee states.
  const row = (id, doctor, status, type, fee, date) => ({
    id,
    saleem_id: `SLM-${id}`,
    admin_id: id,
    patient_ref: { zoho_id: `z-${id}`, initials: 'X' },
    doctor,
    status,
    type,
    fee_bhd: fee,
    service_charge_bhd: 0,
    date,
    ends_at: null,
    duration_min: 15,
    patient_link: null,
    doctor_link: null,
    guest_link: null,
  })
  const rows = [
    row('1', 'Dr. A', 'Done', 'standard', 20, '2026-08-12T15:30:00+03:00'),
    row('2', 'Dr. B', 'Cancelled', 'standard', 25, '2026-08-11T14:00:00+03:00'),
    row('3', 'Dr. A', 'Pending', 'novo_scheduled', 0, '2026-08-13T17:45:00+03:00'),
    row('4', 'Dr. C', 'Done', null, 5, '2026-08-20T09:00:00+03:00'),
  ]

  const ids = (list) => list.map((r) => r.id).join(',')
  const F = f.EMPTY_FILTERS

  // Empty filters constrain nothing.
  check(ids(f.filterRows(rows, F)) === '1,2,3,4', 'empty filters should keep every row')

  // One group, two values: OR.
  check(
    ids(f.filterRows(rows, { ...F, doctors: ['Dr. A', 'Dr. C'] })) === '1,3,4',
    'two doctors should OR together',
  )

  // Two groups: AND.
  check(
    ids(f.filterRows(rows, { ...F, doctors: ['Dr. A'], statuses: ['Done'] })) === '1',
    'doctor AND status should intersect',
  )

  // A null type filters under the (none) key.
  check(
    ids(f.filterRows(rows, { ...F, types: [f.NO_TYPE] })) === '4',
    'a null type should match the (none) option',
  )

  // Fee states derive from fee_bhd.
  check(ids(f.filterRows(rows, { ...F, feeStates: ['free'] })) === '3', 'free should be fee 0')
  check(
    ids(f.filterRows(rows, { ...F, feeStates: ['paid'] })) === '1,2,4',
    'paid should be fee above 1',
  )

  // Date range inclusive at both ends.
  check(
    ids(f.filterRows(rows, { ...F, from: '2026-08-11', to: '2026-08-12' })) === '1,2',
    'date range should include both endpoints',
  )
  check(
    ids(f.filterRows(rows, { ...F, from: '2026-08-13', to: null })) === '3,4',
    'an open-ended from should keep everything on or after it',
  )

  // Options come from the rows present.
  const opts = f.optionsFrom(rows)
  check(ids2(opts.doctors) === 'Dr. A,Dr. B,Dr. C', `doctor options wrong: ${opts.doctors}`)
  check(opts.feeStates.join(',') === 'paid,free', `fee options wrong: ${opts.feeStates}`)
  check(
    f.optionsFrom(rows.filter((r) => r.fee_bhd > 1)).feeStates.join(',') === 'paid',
    'a fee state absent from the rows must not be offered',
  )

  // Active count: a range counts once.
  check(
    f.activeFilterCount({ ...F, doctors: ['Dr. A'], from: '2026-08-01', to: '2026-08-31' }) === 2,
    'a date range should count as one filter',
  )

  // URL round trip, including a reversed range being read in the order meant.
  const params = new URLSearchParams()
  const state = {
    doctors: ['Dr. A', 'Dr. B'],
    statuses: ['Done'],
    types: ['standard'],
    feeStates: ['paid'],
    from: '2026-08-01',
    to: '2026-08-31',
  }
  f.writeFilters(state, params)
  const back = f.readFilters(params)
  check(JSON.stringify(back) === JSON.stringify(state), `URL round trip lost state: ${JSON.stringify(back)}`)

  const reversed = new URLSearchParams('from=2026-08-31&to=2026-08-01')
  const fixed = f.readFilters(reversed)
  check(
    fixed.from === '2026-08-01' && fixed.to === '2026-08-31',
    'a reversed range should be read low to high',
  )

  // A junk date is ignored rather than matching nothing.
  const junk = f.readFilters(new URLSearchParams('from=not-a-date'))
  check(junk.from === null, 'a malformed date should be ignored')

  function ids2(list) {
    return list.join(',')
  }

  if (failures.length > 0) {
    for (const message of failures) console.error(`FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log('OK: appointment table filters behave as specified')
  }
} finally {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
}

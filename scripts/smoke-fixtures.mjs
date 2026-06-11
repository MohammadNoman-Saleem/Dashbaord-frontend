// Smoke test for the fixture dispatch in lib/fixtures/index.ts.
// Compiles the fixture modules to CommonJS in a throwaway directory (the
// source is TypeScript, so plain node cannot import it directly), then calls
// getFixture for two endpoints and asserts the envelopes look right:
//   getFixture('pulse')        returns data plus a meta block
//   getFixture('funnels_novo') is flagged unreliable with a
//                              definition_mismatch reason (the Novo funnel
//                              definition is known to be wrong; the UI renders
//                              the Optimism Banner from this flag alone)
// Run after build: node scripts/smoke-fixtures.mjs
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, '.smoke-fixtures')

const failures = []
function check(ok, message) {
  if (!ok) failures.push(message)
}

// 1. Compile lib/fixtures (and its transitive imports) to CommonJS.
const tsc = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')
const compile = spawnSync(
  process.execPath,
  [tsc, '-p', path.join(root, 'scripts', 'tsconfig.smoke.json')],
  { stdio: 'inherit' },
)
if (compile.status !== 0) {
  console.error('FAIL: tsc could not compile lib/fixtures')
  process.exit(1)
}

try {
  const require = createRequire(import.meta.url)
  const { getFixture } = require(path.join(outDir, 'lib', 'fixtures', 'index.js'))
  check(typeof getFixture === 'function', 'getFixture is not exported as a function')

  // 2. pulse: an ordinary envelope with data and meta.
  const pulse = getFixture('pulse')
  check(pulse != null && pulse.data != null, 'pulse envelope has no data')
  check(
    pulse != null && pulse.meta != null && typeof pulse.meta.updated_at === 'string',
    'pulse meta is missing updated_at',
  )

  // 3. funnels_novo: must carry the unreliable flag and its reason.
  const novo = getFixture('funnels_novo')
  check(novo != null && novo.data != null, 'funnels_novo envelope has no data')
  check(
    novo != null && novo.meta != null && novo.meta.reliable === false,
    'funnels_novo meta.reliable must be false',
  )
  const reason = novo && novo.meta && Array.isArray(novo.meta.reasons) ? novo.meta.reasons[0] : null
  check(
    reason != null && reason.key === 'definition_mismatch',
    `funnels_novo reasons[0].key must be definition_mismatch, got ${reason ? reason.key : 'none'}`,
  )

  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL: ${f}`)
    process.exitCode = 1
  } else {
    console.log('OK: getFixture(pulse) and getFixture(funnels_novo) return the expected envelopes')
  }
} finally {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
}

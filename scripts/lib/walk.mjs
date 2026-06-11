// Shared file walker for the CI gate scripts.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'test-results', 'playwright-report'])

export function walk(root, exts, skipFiles = new Set()) {
  const out = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const rel = relative(root, full).split(sep).join('/')
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(name)) stack.push(full)
        continue
      }
      if (skipFiles.has(rel)) continue
      if (!exts.some((e) => name.endsWith(e))) continue
      if (name === 'package-lock.json') continue
      out.push({ rel, text: readFileSync(full, 'utf8') })
    }
  }
  return out
}

export function report(failures, label) {
  if (failures.length === 0) {
    console.log(`OK: ${label}`)
    return
  }
  console.error(`FAIL: ${label}`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

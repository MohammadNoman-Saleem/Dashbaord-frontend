// CI gate: no em dashes (U+2014) or en dashes (U+2013) anywhere in the repo.
// Required by the implementation plan QA gates and Saleem copy rules.
// The pattern is built from char codes so this file itself stays clean.
import { walk, report } from './lib/walk.mjs'

const DASH_RE = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']')

const files = walk(process.cwd(), ['.ts', '.tsx', '.css', '.md', '.json', '.mjs', '.html'])
const failures = []

for (const { rel, text } of files) {
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (DASH_RE.test(line)) {
      failures.push(`${rel}:${i + 1} contains an em or en dash`)
    }
  })
}

report(failures, 'no em or en dashes')

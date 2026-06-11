// CI gate: no hype words in copy-bearing files (Saleem voice rules).
import { walk, report } from './lib/walk.mjs'

const HYPE = [
  'revolutionary',
  'game-changer',
  'game changer',
  'cutting-edge',
  'cutting edge',
  'synergy',
  '10x',
  'crushing it',
  'move fast',
]

const files = walk(process.cwd(), ['.ts', '.tsx', '.md', '.json'])
const failures = []

for (const { rel, text } of files) {
  const lower = text.toLowerCase()
  for (const word of HYPE) {
    if (lower.includes(word)) {
      const line = lower.split('\n').findIndex((l) => l.includes(word)) + 1
      failures.push(`${rel}:${line} contains "${word}"`)
    }
  }
}

report(failures, 'no hype words')

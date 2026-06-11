// CI gate, two rules:
//   A. No color literals (hex, rgb, rgba, hsl) anywhere except styles/tokens.css.
//      Components consume CSS variables only.
//   B. Inside tokens.css, no red-dominant color (the design system has no red;
//      attention is Optimism amber, severity is carried by words).
import { walk, report } from './lib/walk.mjs'
import { readFileSync } from 'node:fs'

const TOKENS = 'styles/tokens.css'
const failures = []

// Rule A
const files = walk(process.cwd(), ['.ts', '.tsx', '.css'], new Set([TOKENS]))
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/
for (const { rel, text } of files) {
  text.split('\n').forEach((line, i) => {
    if (colorLiteral.test(line)) {
      failures.push(`${rel}:${i + 1} color literal outside ${TOKENS}`)
    }
  })
}

// Rule B
const tokens = readFileSync(TOKENS, 'utf8')
const channels = []
for (const m of tokens.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
  const [r, g, b] = [0, 2, 4].map((o) => parseInt(m[1].slice(o, o + 2), 16))
  channels.push({ src: m[0], r, g, b })
}
for (const m of tokens.matchAll(/#([0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g)) {
  const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16))
  channels.push({ src: m[0], r, g, b })
}
for (const m of tokens.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
  channels.push({ src: m[0], r: +m[1], g: +m[2], b: +m[3] })
}
for (const { src, r, g, b } of channels) {
  if (r > 180 && r > 1.4 * g && r > 1.4 * b) {
    failures.push(`${TOKENS}: ${src} is red-dominant (r=${r} g=${g} b=${b})`)
  }
}

report(failures, 'no red, no color literals outside tokens.css')

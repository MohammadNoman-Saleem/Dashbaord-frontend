// Heartbeat strip geometry (spec 02 section 7). Pure math, no React, so the
// path can be unit-checked against the approved mockup's buildPulse script
// (Saleem_Dashboard_Redesign.html). The path is regenerated from the blip
// list; nothing is hardcoded.

/**
 * Horizontal blip positions as percentages of the strip width.
 * Zero blips: none. One blip: centered. Two or more: distributed linearly
 * from 12 to 88 inclusive, in the severity order the API returned them.
 */
export function blipPositions(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [50]
  return Array.from({ length: n }, (_, i) => 12 + ((88 - 12) * i) / (n - 1))
}

/**
 * SVG path for the strip: one line spanning the full width, flat at the
 * vertical center, with an ECG pulse drawn at each blip position. Exact port
 * of the mockup math: for a blip at x the line runs flat to x - 30, stays
 * flat to x - 16, spikes up at x - 8, drops below at x + 1, overshoots at
 * x + 8, and settles flat at x + 15.
 */
export function pulsePath(positions: number[], W = 1000, mid = 24): string {
  let d = `M0 ${mid}`
  for (const pct of positions) {
    const x = (pct / 100) * W
    d +=
      ` L${x - 30} ${mid} L${x - 16} ${mid}` +
      ` L${x - 8} ${mid - 15} L${x + 1} ${mid + 11} L${x + 8} ${mid - 3} L${x + 15} ${mid}`
  }
  d += ` L${W} ${mid}`
  return d
}

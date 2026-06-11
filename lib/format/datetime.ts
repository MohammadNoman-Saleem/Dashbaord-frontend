// Time and date display per the copy rules (spec 02 section 10):
// times "7:42 AM", dates "Jun 20". Unparseable strings pass through
// untouched so a bad payload degrades to its raw text, never to "NaN".

function parse(iso: string): Date | null {
  // Date-only strings ("2026-06-20") parse as UTC midnight, which renders
  // as the previous day in timezones west of UTC. Pin them to local time.
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "7:42 AM" */
export function fmtTime(iso: string): string {
  const d = parse(iso)
  if (!d) return iso
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** "Jun 20" */
export function fmtDate(iso: string): string {
  const d = parse(iso)
  if (!d) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Relative age for fresh things, the plain date once it is old news:
 * "just now" under a minute, "24 min ago" under an hour, "2 hours ago"
 * under a day, then "Jun 10". Pass now for deterministic rendering in
 * tests or snapshots.
 */
export function fmtAgo(iso: string, now?: Date): string {
  const d = parse(iso)
  if (!d) return iso
  const diffMs = (now ?? new Date()).getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const hours = Math.floor(diffMin / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  return fmtDate(iso)
}

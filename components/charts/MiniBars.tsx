// Compact comparison bars. Matches the mockup .mini-bars and .mb rules:
// 108px label, flexible 9px track, 44px right-aligned value, 7px row gap.
// Fill is accent by default, optimism when a row is flagged behind,
// recovery when ahead, accessible when a row is set aside (the V3 "Other"
// and "Not qualified" buckets). Severity is carried by words in the
// consumer copy. Pure render, decorative only. Consumers render the values
// as text.

export type MiniBarRow = {
  label: string
  value: string | number
  pct: number
  status?: 'ahead' | 'behind' | 'aside'
}

type MiniBarsProps = {
  rows: MiniBarRow[]
}

export function MiniBars({ rows }: MiniBarsProps) {
  if (rows.length === 0) return null

  return (
    <div className="flex flex-col gap-[7px]" aria-hidden="true">
      {rows.map((row, i) => {
        const fillClass =
          row.status === 'behind'
            ? 'bg-optimism'
            : row.status === 'ahead'
              ? 'bg-recovery'
              : row.status === 'aside'
                ? 'bg-accessible'
                : 'bg-accent'
        return (
          <div
            key={`${row.label}-${i}`}
            className="grid grid-cols-[108px_1fr_44px] items-center gap-[9px] text-xs text-ink-2"
          >
            <span>{row.label}</span>
            <span className="h-[9px] rounded-full bg-accessible-soft">
              <span
                className={`block h-full rounded-full ${fillClass}`}
                style={{ width: `${Math.max(0, Math.min(row.pct, 100))}%` }}
              />
            </span>
            <span className="num text-right font-semibold text-title">{row.value}</span>
          </div>
        )
      })}
    </div>
  )
}

// Funnel rows. Matches the mockup .fun, .frow, .ftrack rules:
// 150px label, flexible track, 112px value (104px and 92px under 880px),
// 22px track on accessible-soft, 7px radius, 3px minimum bar width.
// First row digital, final row recovery, middle rows accent.
// Pure render, decorative only. Consumers render the values as text.

export type FunnelRow = {
  label: string
  value: number
}

type FunnelBarsProps = {
  rows: FunnelRow[]
}

function formatPercent(pct: number): string {
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
}

export function FunnelBars({ rows }: FunnelBarsProps) {
  if (rows.length === 0) return null

  const base = rows[0].value || 1
  const last = rows.length - 1

  return (
    <div className="flex flex-col gap-[9px]" aria-hidden="true">
      {rows.map((row, i) => {
        const pct = Math.max(0, Math.min((row.value / base) * 100, 100))
        const fillClass =
          i === 0 ? 'bg-digital' : i === last ? 'bg-recovery' : 'bg-accent'
        return (
          <div
            key={`${row.label}-${i}`}
            className="grid grid-cols-[104px_1fr_92px] items-center gap-3 text-[12.5px] min-[881px]:grid-cols-[150px_1fr_112px]"
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-ink-2">
              {row.label}
            </span>
            <span className="h-[22px] overflow-hidden rounded-[7px] bg-accessible-soft">
              <span
                className={`block h-full min-w-[3px] rounded-[7px] ${fillClass}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="num whitespace-nowrap text-right font-semibold text-title">
              {row.value.toLocaleString()}
              {i > 0 && (
                <small className="font-medium text-ink-3"> {formatPercent(pct)}</small>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

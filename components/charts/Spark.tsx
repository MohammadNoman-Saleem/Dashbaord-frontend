// Sparkline. Matches the mockup .spark and .spark-fill rules: digital stroke,
// width 2, round caps and joins, optional accessible-soft area fill.
// Pure render, decorative only. Consumers render the values as text.

const VIEW_W = 240
const VIEW_H = 44
const PAD_Y = 5

type SparkProps = {
  values: number[]
  fill?: boolean
  className?: string
}

export function Spark({ values, fill = false, className }: SparkProps) {
  if (values.length < 2) return null

  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  const coords = values.map((v, i) => {
    const x = (i * VIEW_W) / (values.length - 1)
    const y = VIEW_H - PAD_Y - ((v - min) / range) * (VIEW_H - PAD_Y * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const points = coords.join(' ')
  const areaPoints = `0,${VIEW_H} ${points} ${VIEW_W},${VIEW_H}`

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={className ? `h-11 w-full ${className}` : 'h-11 w-full'}
      aria-hidden="true"
    >
      {fill && <polygon className="fill-accessible-soft" stroke="none" points={areaPoints} />}
      <polyline
        className="stroke-digital"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

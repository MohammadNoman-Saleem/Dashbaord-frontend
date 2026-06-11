// The i-beat brand mark from the mockup icon sprite. Used in the sidebar
// logo block and as a list icon. Inherits color via currentColor.

type BeatIconProps = {
  size?: number
  className?: string
}

export function BeatIcon({ size = 24, className }: BeatIconProps) {
  return (
    <svg
      viewBox="0 0 24 14"
      width={size}
      height={(size * 14) / 24}
      className={className}
      aria-hidden="true"
    >
      <path
        d="M1.5 7h4.2l1.6-3.6 2.6 7.8 2-6 1.5 1.8h9.1"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

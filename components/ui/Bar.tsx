/* Progress bar primitive. Mirrors .bar from the approved mockup: pill track
   on accessible soft, accent fill by default, good (recovery) and warn
   (optimism) fills. Track height is 6px in the mockup KPI cards and up to
   9px in MiniBars, so it is a bounded prop. Decorative, the value is always
   also present as text next to it. */

export type BarFill = "accent" | "good" | "warn";

const FILL_CLASSES: Record<BarFill, string> = {
  accent: "bg-accent",
  good: "bg-recovery",
  warn: "bg-optimism",
};

type BarProps = {
  /* Percent, 0 to 100. Values outside the range are clamped. */
  value: number;
  fill?: BarFill;
  /* Track height in px, 6 to 9 per the mockup. */
  height?: 6 | 7 | 8 | 9;
  className?: string;
};

export function Bar({ value, fill = "accent", height = 6, className }: BarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      aria-hidden="true"
      className={`block overflow-hidden rounded-full bg-accessible-soft ${className ?? ""}`}
      style={{ height }}
    >
      <span
        className={`block h-full rounded-full ${FILL_CLASSES[fill]}`}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}

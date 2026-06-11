/* 7px status dot. Mirrors .dot from the approved mockup. Decorative only,
   always paired with adjacent text, so it is hidden from assistive tech. */

export type StatusDotVariant = "good" | "warn" | "mut";

const VARIANT_CLASSES: Record<StatusDotVariant, string> = {
  good: "bg-recovery",
  warn: "bg-optimism",
  mut: "bg-ink-3",
};

type StatusDotProps = {
  variant?: StatusDotVariant;
  className?: string;
};

export function StatusDot({ variant = "good", className }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${VARIANT_CLASSES[variant]} ${className ?? ""}`}
    />
  );
}

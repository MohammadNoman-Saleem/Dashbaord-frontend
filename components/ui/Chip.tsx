import type { ReactNode } from "react";

/* Status chip. Mirrors .chip from the approved mockup: 11px Inter 700, pill
   radius. Severity is carried by the words inside the chip, never by color
   escalation. There is no red variant by design. */

export type ChipVariant = "good" | "warn" | "info" | "mut";

const VARIANT_CLASSES: Record<ChipVariant, string> = {
  /* Good, on track, verified, done. */
  good: "bg-recovery-soft font-bold text-recovery",
  /* The only attention state. Light: trust ink on optimism. Dark: optimism
     text on a soft optimism background, per the mockup dark treatment. */
  warn: "bg-optimism font-bold text-trust-ink [[data-theme=dark]_&]:bg-optimism-soft [[data-theme=dark]_&]:text-optimism",
  /* Neutral information. */
  info: "bg-accessible-soft font-bold text-title",
  /* Outline, muted. */
  mut: "border border-line font-semibold text-ink-2",
};

type ChipProps = {
  variant?: ChipVariant;
  className?: string;
  children: ReactNode;
};

export function Chip({ variant = "info", className, children }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-[2.5px] text-[11px] ${VARIANT_CLASSES[variant]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

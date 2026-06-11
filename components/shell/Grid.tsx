import type { ReactNode } from "react";

/* 12-column content grid from the approved mockup: 14px gap, card spans c3
   to c12. Breakpoints per 02 section 5.1: at 1180px c3 and c4 become half
   width and c5 to c8 go full; at 880px everything stacks. Kept in its own
   module (no "use client") so both server and client components can read
   the span classNames as plain values. */

export const spans = {
  c3: "col-span-3 max-[1180px]:col-span-6 max-[880px]:col-span-12",
  c4: "col-span-4 max-[1180px]:col-span-6 max-[880px]:col-span-12",
  c5: "col-span-5 max-[1180px]:col-span-12",
  c6: "col-span-6 max-[1180px]:col-span-12",
  c7: "col-span-7 max-[1180px]:col-span-12",
  c8: "col-span-8 max-[1180px]:col-span-12",
  c12: "col-span-12",
} as const;

export type SpanKey = keyof typeof spans;

type GridProps = {
  className?: string;
  children: ReactNode;
};

export function Grid({ className, children }: GridProps) {
  return (
    <div className={`grid grid-cols-12 gap-[14px] ${className ?? ""}`}>{children}</div>
  );
}

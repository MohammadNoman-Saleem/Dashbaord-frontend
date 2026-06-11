import type { ReactNode } from "react";

/* The honest "no data yet" value for a KPI tile. A field the backend serves
   as null means the source is not wired, so the tile reads "Not connected
   yet" (or a more specific phrase) in calm muted text instead of a zero
   pretending to be data. Pair it with dot="mut" on the KpiCard, never warn:
   absence is a state, not an alarm. */

export function PendingValue({ children }: { children: ReactNode }) {
  return (
    <span className="font-sans text-[15px] font-medium leading-[1.4] tracking-normal text-ink-3">
      {children}
    </span>
  );
}

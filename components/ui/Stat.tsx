import type { ReactNode } from "react";

/* Inline stat row used inside cards. Mirrors .statrow, .stat, and .grp-label
   from the V3 mockup (06 shared additions): a wrapping row of
   label-under-value stats, value 21px bold in the title color with an
   optional small suffix in ink-3, label 11.5px in ink-2. GrpLabel is the
   10.5px uppercase letter-spaced section label inside cards. */

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-4 mt-[2px] flex flex-wrap gap-x-7 gap-y-3 ${className ?? ""}`}>
      {children}
    </div>
  );
}

type StatProps = {
  /* The big number. Pass a PendingValue when the source is not wired. */
  value: ReactNode;
  /* Small muted suffix beside the value, e.g. "($2.89)" or "of 30". */
  small?: ReactNode;
  label: ReactNode;
};

export function Stat({ value, small, label }: StatProps) {
  return (
    <div className="min-w-0">
      <div className="num flex items-baseline gap-[6px] text-[21px] font-bold leading-[1.15] text-title">
        <span>{value}</span>
        {small != null ? (
          <span className="text-[12.5px] font-medium tracking-normal text-ink-3">{small}</span>
        ) : null}
      </div>
      <div className="text-[11.5px] text-ink-2">{label}</div>
    </div>
  );
}

export function GrpLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

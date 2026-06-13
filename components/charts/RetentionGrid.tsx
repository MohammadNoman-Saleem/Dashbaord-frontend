import type { CSSProperties } from "react";

import type { RetentionCohortRow } from "@/lib/api/contract";
import { fmtDate } from "@/lib/format/datetime";

/* Cohort retention matrix. Rows are weekly cohorts (the week of first
   visit), columns are days since that first visit, cells are the percent
   still returning. Cell depth rides the recovery token through color-mix so
   the ramp stays on-token in both themes; a cohort bucket that has not
   matured yet renders a quiet middle dot, never a zero. Values are real
   text in the cells; the sr-only summary lives with the consumer. */

type RetentionGridProps = {
  columns: string[];
  cohorts: RetentionCohortRow[];
  className?: string;
};

function cellStyle(pct: number | null): CSSProperties | undefined {
  if (pct == null) return undefined;
  // 8% floor keeps a zero readable as "measured, none returned"; the ramp
  // tops out at 80% so the text always sits on a stable surface.
  const depth = Math.round(8 + (Math.max(0, Math.min(pct, 100)) / 100) * 72);
  return {
    background: `color-mix(in srgb, var(--recovery) ${depth}%, transparent)`,
    color: pct > 55 ? "var(--on-accent)" : undefined,
  };
}

export function RetentionGrid({ columns, cohorts, className }: RetentionGridProps) {
  if (cohorts.length === 0) {
    return (
      <p className="py-2 text-[13px] text-ink-2">
        Cohorts land here once Mixpanel has a full week to look back on.
      </p>
    );
  }

  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <table className="w-full border-separate text-[12px]" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="whitespace-nowrap px-[10px] py-[7px] text-left text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3">
              Cohort
            </th>
            <th className="px-[10px] py-[7px] text-right text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3">
              People
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="min-w-[52px] px-[6px] py-[7px] text-center text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.date}>
              <td className="whitespace-nowrap rounded-inner bg-surface-2 px-[10px] py-[7px] font-medium text-ink-2">
                {fmtDate(cohort.date)}
              </td>
              <td className="num rounded-inner bg-surface-2 px-[10px] py-[7px] text-right text-ink-3">
                {cohort.size.toLocaleString()}
              </td>
              {cohort.cells.map((pct, i) => (
                <td
                  key={`${cohort.date}-${columns[i] ?? i}`}
                  className="num rounded-inner bg-accessible-soft px-[6px] py-[7px] text-center font-semibold text-title"
                  style={cellStyle(pct)}
                  title={pct != null ? `${pct}% retained` : "Not mature yet"}
                >
                  {pct != null ? `${pct}%` : <span className="font-normal text-ink-3">&middot;</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Rows are weekly cohorts; cells show the share still returning by day N. A dot means the week is not over yet.
      </p>
    </div>
  );
}

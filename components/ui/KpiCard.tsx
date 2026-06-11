import type { ReactNode } from "react";

import { Spark } from "@/components/charts/Spark";
import { Bar, type BarFill } from "@/components/ui/Bar";
import { Card } from "@/components/ui/Card";
import { StatusDot, type StatusDotVariant } from "@/components/ui/StatusDot";

/* KPI stat card. Mirrors .kpi from the approved mockup: 15px 17px padding,
   8px column gap, 122px minimum height. Label row per the build contract:
   10.5px uppercase tracked muted, with an optional right slot. Value is
   27px Inter 700 in the title color with tabular numerals and an optional
   small suffix. Beneath the value sits an optional Spark or progress Bar,
   and the note row with a StatusDot is pinned to the bottom. */

type KpiCardProps = {
  label: ReactNode;
  /* Optional right side of the label row, for a chip or small control. */
  labelRight?: ReactNode;
  value: ReactNode;
  /* Small muted suffix beside the value, e.g. "of 20" or "+22% vs May". */
  suffix?: ReactNode;
  /* Sparkline values. Renders a Spark when given. */
  spark?: number[];
  /* Area fill under the sparkline. Off by default, matching the mockup KPI. */
  sparkFill?: boolean;
  /* Progress bar. Renders a Bar when given. Percent 0 to 100. */
  bar?: { value: number; fill?: BarFill };
  /* Note line at the bottom, paired with the StatusDot. */
  note?: ReactNode;
  /* StatusDot variant for the note row. Defaults to good. */
  dot?: StatusDotVariant;
  className?: string;
};

export function KpiCard({
  label,
  labelRight,
  value,
  suffix,
  spark,
  sparkFill = false,
  bar,
  note,
  dot,
  className,
}: KpiCardProps) {
  return (
    <Card className={`flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px] ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3">
        <span className="min-w-0">{label}</span>
        {labelRight != null ? <span className="shrink-0">{labelRight}</span> : null}
      </div>
      <div className="num flex items-baseline gap-[7px] text-[27px] font-bold leading-[1.05] tracking-[-.01em] text-title">
        <span>{value}</span>
        {suffix != null ? (
          <span className="text-[12.5px] font-medium tracking-normal text-ink-3">{suffix}</span>
        ) : null}
      </div>
      {spark != null ? <Spark values={spark} fill={sparkFill} /> : null}
      {bar != null ? <Bar value={bar.value} fill={bar.fill} /> : null}
      {note != null ? (
        <div className="mt-auto flex items-center gap-1.5 text-xs text-ink-2">
          <StatusDot variant={dot} />
          <span className="min-w-0">{note}</span>
        </div>
      ) : null}
    </Card>
  );
}

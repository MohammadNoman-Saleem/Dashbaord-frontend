"use client";

import { useQuery } from "@tanstack/react-query";

import { Chip } from "@/components/ui/Chip";
import { Card, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel } from "@/components/ui/Stat";
import type { MomentumPipeline, PipelineMomentumData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* Per-pipeline month over month, ported from the legacy CRM overview cards.
   One tile per pipeline: new deals this month against last, then the open,
   won, lost, and value picture. The change line says "no deals last month"
   instead of inventing a percentage against zero. */

function changeChip(p: MomentumPipeline) {
  if (p.change_pct == null) {
    return <Chip variant="mut">No deals last month to compare</Chip>;
  }
  if (p.change_pct === 0) {
    return <Chip variant="mut">Level with last month ({p.last_month})</Chip>;
  }
  if (p.change_pct > 0) {
    return (
      <Chip variant="good">
        Up {p.change_pct}% vs last month ({p.last_month})
      </Chip>
    );
  }
  return (
    <Chip variant="warn">
      Down {Math.abs(p.change_pct)}% vs last month ({p.last_month})
    </Chip>
  );
}

function MomentumSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-[10px] max-[1180px]:grid-cols-2 max-[880px]:grid-cols-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-[12px] border border-line-soft p-3">
          <Skeleton height={11} width="60%" />
          <Skeleton height={24} width="40%" />
          <Skeleton height={12} width="80%" />
        </div>
      ))}
    </div>
  );
}

export function MomentumPanel() {
  const query = useQuery({
    queryKey: qk.pipelineMomentum(),
    queryFn: () =>
      fetchEnvelope<PipelineMomentumData>("pipeline_momentum", "/pipeline/momentum"),
  });

  return (
    <Card>
      <CardHeader
        title="Pipelines, month over month"
        subtitle={query.data?.data?.compare_label ?? "New deals this month against last."}
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<MomentumSkeleton />}
          isEmpty={(d) => d.pipelines.length === 0}
          emptyCopy="No pipeline activity to compare yet."
        >
          {(d, _meta, flags) => (
            <div
              className={`grid grid-cols-5 gap-[10px] max-[1180px]:grid-cols-2 max-[880px]:grid-cols-1 ${
                flags.unreliable ? "opacity-55" : ""
              }`}
            >
              {d.pipelines.map((p) => (
                <div
                  key={p.pipeline}
                  className="flex flex-col gap-[7px] rounded-[12px] border border-line-soft p-3"
                >
                  <GrpLabel className="mb-0">{p.pipeline}</GrpLabel>
                  <div className="num flex items-baseline gap-[6px] text-[23px] font-bold leading-[1.1] text-title">
                    <span>{p.this_month}</span>
                    <span className="text-[12px] font-medium tracking-normal text-ink-3">
                      new this month
                    </span>
                  </div>
                  <div>{changeChip(p)}</div>
                  <div className="text-xs text-ink-2">
                    {p.open} open · {p.won} won · {p.lost} lost · win {p.win_rate_pct}%
                  </div>
                  <div className="num text-xs text-ink-3">
                    {fmtBHD(p.total_value_bhd)} total value
                  </div>
                </div>
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
    </Card>
  );
}

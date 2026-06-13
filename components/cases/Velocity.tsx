"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat, StatRow, GrpLabel } from "@/components/ui/Stat";
import type { PipelineVelocityData, VelocityStage } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* Stage velocity, ported from the legacy sla route: how long open deals
   have sat in each stage (approximated by deal age grouped by current
   stage) and the real created-to-close cycle time for won deals. */

const STAGE_COLUMNS: DataTableColumn<VelocityStage>[] = [
  { key: "name", label: "Stage" },
  {
    key: "count",
    label: "Open deals",
    numeric: true,
    render: (row) => (row.count ? row.count : "·"),
  },
  {
    key: "avg_days",
    label: "Avg days",
    numeric: true,
    render: (row) => (row.count ? row.avg_days : "·"),
  },
  {
    key: "min_days",
    label: "Min",
    numeric: true,
    render: (row) => (row.count ? row.min_days : "·"),
  },
  {
    key: "max_days",
    label: "Max",
    numeric: true,
    render: (row) => (row.count ? row.max_days : "·"),
  },
];

function VelocitySkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={32} width="80%" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={17} />
      ))}
    </div>
  );
}

export function VelocityPanel() {
  const [pipeline, setPipeline] = useState("Telemedicine");

  const query = useQuery({
    queryKey: qk.pipelineVelocity(),
    queryFn: () =>
      fetchEnvelope<PipelineVelocityData>("pipeline_velocity", "/pipeline/velocity"),
  });

  const pipelines = query.data?.data?.pipelines;

  return (
    <Card>
      <CardHeader
        title="Stage velocity"
        subtitle="How long deals sit in each stage, and the cycle time when they close won."
        right={
          pipelines ? (
            <select
              aria-label="Pipeline"
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
            >
              {pipelines.map((p) => (
                <option key={p.pipeline} value={p.pipeline}>
                  {p.pipeline}
                </option>
              ))}
            </select>
          ) : null
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<VelocitySkeleton />}
          isEmpty={(d) => d.pipelines.length === 0}
          emptyCopy="No deals to time yet."
        >
          {(d, _meta, flags) => {
            const current = d.pipelines.find((p) => p.pipeline === pipeline) ?? d.pipelines[0];
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <StatRow>
                  <Stat
                    value={current.won ? current.won.avg_days : "·"}
                    small={
                      current.won
                        ? `days avg of ${current.won.count} won, ${current.won.min_days} to ${current.won.max_days}`
                        : "no won deals yet"
                    }
                    label="Won cycle time"
                  />
                  <Stat
                    value={current.open_avg_days}
                    small="days"
                    label="Open deals, average age"
                  />
                  <Stat
                    value={current.bottleneck ? current.bottleneck.avg_days : "·"}
                    small={current.bottleneck ? `days in ${current.bottleneck.name}` : "no open deals"}
                    label="Slowest stage"
                  />
                  <Stat
                    value={current.fastest ? current.fastest.avg_days : "·"}
                    small={current.fastest ? `days in ${current.fastest.name}` : "no open deals"}
                    label="Fastest stage"
                  />
                </StatRow>
                <GrpLabel>Open deals by stage</GrpLabel>
                <DataTable
                  columns={STAGE_COLUMNS}
                  rows={current.stages}
                  rowKey={(row) => row.name}
                />
              </div>
            );
          }}
        </QueryPanel>
      </div>
    </Card>
  );
}

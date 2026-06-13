"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat, StatRow, GrpLabel } from "@/components/ui/Stat";
import type { LossCross, LossOwnerRow, PipelineLossesData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* Lost value, ported from the legacy CRM analytics tab: is it getting
   worse, who loses the most value, and which sources produce the losses.
   Bucketed on the close month with last update as the fallback. Many lost
   deals carry BHD 0, so counts read alongside value. */

const OWNER_COLUMNS: DataTableColumn<LossOwnerRow>[] = [
  { key: "owner", label: "Owner" },
  { key: "count", label: "Deals", numeric: true },
  {
    key: "value_bhd",
    label: "Value",
    numeric: true,
    render: (row) => fmtBHD(row.value_bhd),
  },
];

type CrossRow = LossCross["rows"][number];

function crossColumns(sources: string[]): DataTableColumn<CrossRow>[] {
  return [
    { key: "reason", label: "Reason" },
    ...sources.map((source, i) => ({
      key: `s${i}`,
      label: source,
      numeric: true,
      render: (row: CrossRow) => (row.counts[i] ? row.counts[i] : "·"),
    })),
  ];
}

function LossesSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={20} width="60%" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} height={15} />
      ))}
    </div>
  );
}

export function LossesPanel() {
  const query = useQuery({
    queryKey: qk.pipelineLosses(),
    queryFn: () => fetchEnvelope<PipelineLossesData>("pipeline_losses", "/pipeline/losses"),
  });

  return (
    <Card>
      <CardHeader
        title="Lost value over time"
        subtitle="Whether losses are growing, who loses the most value, and which sources produce them."
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<LossesSkeleton />}
          isEmpty={(d) => d.totals.lost_count === 0}
          emptyCopy="No lost deals on record. Nothing to learn from yet."
        >
          {(d, _meta, flags) => {
            const maxValue = Math.max(1, ...d.months.map((m) => m.value_bhd));
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <StatRow>
                  <Stat value={d.totals.lost_count} label="Lost deals, all time" />
                  <Stat value={fmtBHD(d.totals.lost_value_bhd)} label="Total lost value" />
                  {d.totals.top_reason ? (
                    <Stat value={d.totals.top_reason} label="Top reason" />
                  ) : null}
                </StatRow>
                <div className="grid grid-cols-2 gap-7 max-[880px]:grid-cols-1">
                  <div>
                    <GrpLabel>Lost per month, trailing 12</GrpLabel>
                    <div className="flex flex-col gap-[6px]" role="presentation">
                      {d.months.map((m) => (
                        <div
                          key={m.key}
                          className="grid grid-cols-[34px_1fr_150px] items-center gap-[9px] text-xs text-ink-2"
                        >
                          <span>{m.label}</span>
                          <span className="h-[9px] rounded-full bg-accessible-soft">
                            <span
                              className="block h-full rounded-full bg-optimism"
                              style={{
                                width: `${Math.min(100, Math.round((m.value_bhd / maxValue) * 100))}%`,
                              }}
                            />
                          </span>
                          <span className="num text-right text-title">
                            {fmtBHD(m.value_bhd)} · {m.count}{" "}
                            {m.count === 1 ? "deal" : "deals"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-6">
                    <div>
                      <GrpLabel>Lost value by owner</GrpLabel>
                      <DataTable
                        columns={OWNER_COLUMNS}
                        rows={d.owners}
                        rowKey={(row) => row.owner}
                      />
                    </div>
                    <div>
                      <GrpLabel>Loss reason by lead source, deal counts</GrpLabel>
                      <DataTable
                        columns={crossColumns(d.cross.sources)}
                        rows={d.cross.rows}
                        rowKey={(row) => row.reason}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
        </QueryPanel>
      </div>
    </Card>
  );
}

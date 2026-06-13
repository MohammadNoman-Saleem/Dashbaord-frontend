"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat, StatRow, GrpLabel } from "@/components/ui/Stat";
import type { PipelineStalenessData, StalenessOwnerRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* Pipeline staleness, ported from the legacy CRM analytics tab and moved
   server-side: open deals bucketed by days since their last update, and the
   over-30-days chase list grouped by owner. The API returns every scope at
   once, so the picker switches without a refetch. Many deals carry BHD 0,
   so counts and value read together. */

const OWNER_COLUMNS: DataTableColumn<StalenessOwnerRow>[] = [
  { key: "owner", label: "Owner" },
  { key: "count", label: "Deals", numeric: true },
  {
    key: "value_bhd",
    label: "Value",
    numeric: true,
    render: (row) => fmtBHD(row.value_bhd),
  },
  { key: "top_stage", label: "Mostly stuck in" },
];

function StalenessSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={32} width="80%" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} height={17} />
      ))}
    </div>
  );
}

export function StalenessPanel() {
  const [scope, setScope] = useState("all");

  const query = useQuery({
    queryKey: qk.pipelineStaleness(),
    queryFn: () =>
      fetchEnvelope<PipelineStalenessData>("pipeline_staleness", "/pipeline/staleness"),
  });

  const scopes = query.data?.data?.scopes;

  return (
    <Card>
      <CardHeader
        title="Pipeline staleness"
        subtitle="Open deals by days since last update. Many carry BHD 0, so read count and value together."
        right={
          scopes ? (
            <select
              aria-label="Pipeline scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
            >
              {scopes.map((s) => (
                <option key={s.scope} value={s.scope}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : null
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<StalenessSkeleton />}
          isEmpty={(d) => d.scopes.length === 0}
          emptyCopy="No open deals to age yet."
        >
          {(d, _meta, flags) => {
            const current = d.scopes.find((s) => s.scope === scope) ?? d.scopes[0];
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <StatRow>
                  {current.buckets.map((b) => (
                    <Stat
                      key={b.key}
                      value={b.count}
                      small={fmtBHD(b.value_bhd)}
                      label={b.label}
                    />
                  ))}
                </StatRow>
                <GrpLabel>Untouched over 30 days, by owner</GrpLabel>
                {current.owners.length === 0 ? (
                  <p className="py-2 text-[13px] text-ink-2">
                    Nothing has sat untouched for over 30 days here.
                  </p>
                ) : (
                  <DataTable
                    columns={OWNER_COLUMNS}
                    rows={current.owners}
                    rowKey={(row) => row.owner}
                  />
                )}
              </div>
            );
          }}
        </QueryPanel>
      </div>
    </Card>
  );
}

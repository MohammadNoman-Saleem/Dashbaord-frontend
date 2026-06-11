"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LateItem, PipelineHealthData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";

/* Home panel p-late (spec 02 section 8.1). Everything past the time we
   promise ourselves: what, the promise in plain words, the owner, and an
   over-by chip in plain days. */

const COLUMNS: DataTableColumn<LateItem>[] = [
  {
    key: "what",
    label: "What's late",
    render: (row) => <b className="font-semibold text-title">{row.what}</b>,
  },
  { key: "promise", label: "The promise", render: (row) => row.promise_plain },
  { key: "owner", label: "On it" },
  {
    key: "over_by",
    label: "Over by",
    numeric: true,
    render: (row) => (
      <Chip variant="warn">
        Over by {row.over_by_days} {row.over_by_days === 1 ? "day" : "days"}
      </Chip>
    ),
  },
];

function LateSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={12} width="46%" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={17} />
      ))}
    </div>
  );
}

export function LatePanel(_props: { person: string }) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.pipelineHealth(),
    queryFn: () => fetchEnvelope<PipelineHealthData>("pipeline_health", "/pipeline/health"),
  });

  const count = query.data?.data?.items.length;

  return (
    <Card>
      <CardHeader
        title="Running late"
        subtitle="Past the time we promise ourselves."
        right={
          count != null && count > 0 ? (
            <Chip variant="warn">
              {count} {count === 1 ? "item" : "items"}
            </Chip>
          ) : undefined
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<LateSkeleton />}
          isEmpty={(d) => d.items.length === 0}
          emptyCopy="Nothing is running late. Every promise is holding."
        >
          {(d, _meta, flags) => (
            <div className={flags.unreliable ? "opacity-55" : undefined}>
              <DataTable columns={COLUMNS} rows={d.items} rowKey={(row) => row.what} />
            </div>
          )}
        </QueryPanel>
      </div>
      {query.data?.data ? (
        <CardFooter
          note="Aziz reviews every breach for a root cause."
          right={<Link href={buildDeepLink({ view: "cases" }, viewAs)}>See pipeline</Link>}
        />
      ) : null}
    </Card>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PatientRef } from "@/components/ui/PatientRef";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PrioritiesData, PriorityRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";

/* Home panel p-priorities (spec 02 section 8.1). The top rows of the
   priority queue: new leads first, then anyone going quiet, then today's
   follow-ups. The footer carries the honest counts and opens /cases. */

const TOP = 8;

const COLUMNS: DataTableColumn<PriorityRow>[] = [
  {
    key: "who",
    label: "Who",
    lockNote: "restricted",
    /* Spreading the whole row hands the restricted name field (served only
       to Fatima and Razan) to PatientRef, the only component allowed to
       render it. Everyone else gets the Zoho reference. */
    render: (row) => (
      <PatientRef
        patient={{ ...row, ...row.patient_ref }}
        className="font-semibold text-title"
      />
    ),
  },
  {
    key: "why_now",
    label: "Why now",
    render: (row) => (
      <Chip variant={row.why_now.warn ? "warn" : "info"}>{row.why_now.label}</Chip>
    ),
  },
  { key: "pipeline", label: "Pipeline" },
  {
    key: "waiting",
    label: "Waiting",
    render: (row) => <span className="num">{row.waiting_display}</span>,
  },
  { key: "next_step", label: "Next step" },
  { key: "source", label: "Source" },
];

function PrioritiesSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={12} width="42%" />
      {Array.from({ length: TOP }, (_, i) => (
        <Skeleton key={i} height={17} />
      ))}
    </div>
  );
}

export function PrioritiesPanel({ person }: { person: string }) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.priorities(person),
    queryFn: () =>
      fetchEnvelope<PrioritiesData>("priorities", "/pipeline/priorities", { person }),
  });

  const data = query.data?.data;
  const shown = data ? Math.min(TOP, data.rows.length) : null;

  return (
    <Card>
      <CardHeader
        title="Your morning, in order"
        subtitle="New leads first, then anyone going quiet, then today's follow-ups."
        right={shown ? <Chip variant="info">Top {shown}</Chip> : undefined}
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<PrioritiesSkeleton />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy="Nothing is waiting on a reply right now."
        >
          {(d, _meta, flags) => (
            <div className={flags.unreliable ? "opacity-55" : undefined}>
              <DataTable
                columns={COLUMNS}
                rows={d.rows.slice(0, TOP)}
                rowKey={(row) => row.patient_ref.zoho_id}
              />
            </div>
          )}
        </QueryPanel>
      </div>
      {data && data.rows.length > 0 ? (
        <CardFooter
          note={`Showing the top ${shown}. Another ${data.counts.queued} at-risk deals are queued, ${data.counts.dormant} dormant set aside.`}
          right={<Link href={buildDeepLink({ view: "cases" }, viewAs)}>Open the full list</Link>}
        />
      ) : null}
    </Card>
  );
}

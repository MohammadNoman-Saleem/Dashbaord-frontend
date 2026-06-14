"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PatientRef } from "@/components/ui/PatientRef";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CockpitParkedData, CockpitParkedRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* Parked, with a way back. Not Qualified is a parking lot, not a grave: each
   row shows the lead reference, when it was parked, why, and a revival nudge
   chip (warn when a date is set, mut "None" when nothing is scheduled). Lead
   names ride through PatientRef alone; everyone else sees the reference. */

const COLUMNS: DataTableColumn<CockpitParkedRow>[] = [
  {
    key: "lead",
    label: "Lead",
    render: (row) => <PatientRef patient={{ ...row, ...row.lead_ref }} className="font-semibold text-title" />,
  },
  { key: "parked_date", label: "Parked", render: (row) => <span className="num">{row.parked_date}</span> },
  { key: "reason", label: "Why" },
  {
    key: "revival_nudge",
    label: "Revival nudge",
    numeric: true,
    render: (row) =>
      row.revival_nudge ? (
        <Chip variant={row.revival_nudge.tone}>{row.revival_nudge.label}</Chip>
      ) : (
        <Chip variant="mut">None</Chip>
      ),
  },
];

function ParkedSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-[18px] py-3">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} height={18} />
      ))}
    </div>
  );
}

export function CockpitParked() {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.cockpitParked(viewAs ?? "self"),
    queryFn: () =>
      fetchEnvelope<CockpitParkedData>("cockpit_parked", "/cockpit/parked", {
        person: viewAs,
        viewer: viewAs,
      }),
  });

  const count = query.data?.data?.rows.length ?? null;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Parked, with a way back"
        subtitle="Not Qualified is a parking lot, not a grave. One tap returns a lead to Waiting Quote."
        right={count != null ? <Chip variant="mut">{`${count} parked`}</Chip> : undefined}
      />
      <div className="px-[18px] pb-3 pt-2">
        <QueryPanel
          query={query}
          skeleton={<ParkedSkeleton />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy="Nothing is parked right now."
        >
          {(d) => (
            <DataTable columns={COLUMNS} rows={d.rows} rowKey={(row) => row.lead_ref.zoho_id} />
          )}
        </QueryPanel>
      </div>
      <CardFooter note="At 300 leads a month this pool becomes a revenue source, not a write-off." />
    </Card>
  );
}

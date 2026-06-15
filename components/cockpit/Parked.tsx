"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PatientRef } from "@/components/ui/PatientRef";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import type {
  CockpitParkedBucket,
  CockpitParkedData,
  CockpitParkedRow,
  CockpitPipeline,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

const PARKED_PAGE_SIZE = 12;

/* Parked, with a way back, grouped into tabs. The Leads vs Deals split is the
   Not-Qualified-vs-Lost separation: parked leads are the Not-Qualified leads,
   parked deals are the Lost or Inactive deals, sub-split by pipeline. Each tab
   drives server-side pagination by passing its bucket to the parked endpoint,
   so the large pool paginates within the chosen tab, not across it. The
   Previous/Next pager runs per tab.

   Each row shows the lead reference, when it was parked, why, and a revival
   nudge chip (warn when a date is set, mut "None" when nothing is scheduled).
   Lead names ride through PatientRef alone; everyone else sees the reference. */

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

type TopTab = "leads" | "deals";

function bucketFor(topTab: TopTab, pipeline: CockpitPipeline): CockpitParkedBucket {
  if (topTab === "leads") return "leads";
  return pipeline === "Treatment" ? "deals_treatment" : "deals_telemedicine";
}

/* A count-only read for a tab label. page_size 1 keeps the payload tiny; only
   total is used, so the bucket count is live without shipping a full page. */
function useBucketCount(person: string, bucket: CockpitParkedBucket) {
  const query = useQuery({
    queryKey: qk.cockpitParked(person, `${bucket}:count`, 1, 1),
    queryFn: () =>
      fetchEnvelope<CockpitParkedData>("cockpit_parked", "/cockpit/parked", {
        person: person === "self" ? undefined : person,
        viewer: person === "self" ? undefined : person,
        bucket,
        page: 1,
        page_size: 1,
      }),
  });
  return query.data?.data?.total ?? null;
}

function label(base: string, count: number | null): string {
  return count == null ? base : `${base} (${count})`;
}

export function CockpitParked() {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;
  const person = viewAs ?? "self";

  const [topTab, setTopTab] = useState<TopTab>("leads");
  const [pipeline, setPipeline] = useState<CockpitPipeline>("Treatment");
  const [page, setPage] = useState(1);

  const bucket = bucketFor(topTab, pipeline);

  const leadsCount = useBucketCount(person, "leads");
  const treatmentCount = useBucketCount(person, "deals_treatment");
  const telemedicineCount = useBucketCount(person, "deals_telemedicine");
  const dealsCount =
    treatmentCount == null && telemedicineCount == null
      ? null
      : (treatmentCount ?? 0) + (telemedicineCount ?? 0);

  const query = useQuery({
    queryKey: qk.cockpitParked(person, bucket, page, PARKED_PAGE_SIZE),
    queryFn: () =>
      fetchEnvelope<CockpitParkedData>("cockpit_parked", "/cockpit/parked", {
        person: viewAs,
        viewer: viewAs,
        bucket,
        page,
        page_size: PARKED_PAGE_SIZE,
      }),
  });

  const data = query.data?.data;

  function selectTop(key: string) {
    setTopTab(key as TopTab);
    setPage(1);
  }
  function selectPipeline(key: string) {
    setPipeline(key as CockpitPipeline);
    setPage(1);
  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Parked, with a way back"
        subtitle="Not Qualified is a parking lot, not a grave. One tap returns a lead to Waiting Quote."
        right={data ? <Chip variant="mut">{`${data.total} in this tab`}</Chip> : undefined}
      />
      <div className="px-[18px] pt-2">
        <Tabs
          aria-label="Parked record type"
          value={topTab}
          onChange={selectTop}
          items={[
            { key: "leads", label: label("Leads", leadsCount) },
            { key: "deals", label: label("Deals", dealsCount) },
          ]}
        />
        {topTab === "deals" ? (
          <div className="mb-3 -mt-1">
            <Pills
              aria-label="Deal pipeline"
              value={pipeline}
              onChange={selectPipeline}
              items={[
                { key: "Treatment", label: label("Treatment", treatmentCount) },
                { key: "Telemedicine", label: label("Telemedicine", telemedicineCount) },
              ]}
            />
          </div>
        ) : null}
      </div>
      <div className="px-[18px] pb-3 pt-1">
        <QueryPanel
          query={query}
          skeleton={<ParkedSkeleton />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy="Nothing is parked in this tab right now."
        >
          {(d) => (
            <DataTable columns={COLUMNS} rows={d.rows} rowKey={(row) => row.lead_ref.zoho_id} />
          )}
        </QueryPanel>
      </div>
      {data && data.total > 0 ? (
        <CardFooter
          note={
            <span className="num">
              Page {data.page} of {data.pages} · {data.total} in this tab
            </span>
          }
          right={
            <span className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={data.page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </span>
          }
        />
      ) : (
        <CardFooter note="At 300 leads a month this pool becomes a revenue source, not a write-off." />
      )}
    </Card>
  );
}

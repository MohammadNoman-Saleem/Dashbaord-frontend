"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LateItem, PipelineHealthData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";
import { usePillFilter } from "@/lib/usePillFilter";

/* Home panel p-late and the Cases "Deals running late" card (spec 02
   section 8.1, 06 group C). Everything past the time we promise ourselves,
   filterable by kind: patients, providers, corporates. Corporates is a
   deliberate fourth pill so Afaf's late items never disappear from a
   patients-vs-providers split. The two surfaces filter independently. */

type KindKey = LateItem["kind"];

const KIND_TAG: Partial<Record<KindKey, string>> = {
  provider: "Provider",
  corp: "Corporate",
};

const KIND_PILLS = [
  { key: "all", label: "All" },
  { key: "patient", label: "Patients" },
  { key: "provider", label: "Providers" },
  { key: "corp", label: "Corporates" },
];

/* Provider and corporate rows carry a muted tag after the title so the mix
   is readable even on All. Patient rows are the default case, no tag. */
const COLUMNS: DataTableColumn<LateItem>[] = [
  {
    key: "what",
    label: "What's late",
    render: (row) => (
      <span className="inline-flex items-center gap-[6px]">
        <b className="font-semibold text-title">{row.what}</b>
        {KIND_TAG[row.kind] ? <Chip variant="mut">{KIND_TAG[row.kind]}</Chip> : null}
      </span>
    ),
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

export function LatePanel({
  variant = "home",
}: {
  person?: string;
  variant?: "home" | "cases";
}) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;
  const kind = usePillFilter<KindKey, LateItem>((row) => row.kind);

  const query = useQuery({
    queryKey: qk.pipelineHealth(),
    queryFn: () => fetchEnvelope<PipelineHealthData>("pipeline_health", "/pipeline/health"),
  });

  const items = query.data?.data?.items;
  const visibleCount = items ? kind.filter(items).length : null;

  /* Count chips per 06 group C: home reads "n items", Cases the bare
     number. Both follow the active filter. */
  const countChip =
    visibleCount != null && items && items.length > 0 ? (
      <Chip variant="warn">
        {variant === "home"
          ? `${visibleCount} ${visibleCount === 1 ? "item" : "items"}`
          : String(visibleCount)}
      </Chip>
    ) : null;

  return (
    <Card>
      <CardHeader
        title={variant === "cases" ? "Deals running late" : "Running late"}
        subtitle={
          variant === "cases"
            ? "Past an SLA. Each one gets a root-cause look from Aziz."
            : "Past the time we promise ourselves."
        }
        right={
          <div className="flex flex-wrap items-center justify-end gap-[10px]">
            <Pills
              aria-label="Filter by kind"
              items={KIND_PILLS}
              value={kind.value}
              onChange={(key) => kind.setValue(key as KindKey | "all")}
            />
            {countChip}
          </div>
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<LateSkeleton />}
          isEmpty={(d) => d.items.length === 0}
          emptyCopy="Nothing is running late. Every promise is holding."
        >
          {(d, _meta, flags) => {
            const rows = kind.filter(d.items);
            if (rows.length === 0) {
              return (
                <p className="py-2 text-[13px] text-ink-2">Nothing here under this filter.</p>
              );
            }
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <DataTable columns={COLUMNS} rows={rows} rowKey={(row) => row.what} />
              </div>
            );
          }}
        </QueryPanel>
      </div>
      {query.data?.data && variant === "home" ? (
        <CardFooter
          note="Aziz reviews every breach for a root cause."
          right={<Link href={buildDeepLink({ view: "cases" }, viewAs)}>See pipeline</Link>}
        />
      ) : null}
    </Card>
  );
}

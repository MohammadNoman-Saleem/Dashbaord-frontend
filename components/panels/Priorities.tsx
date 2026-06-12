"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { PatientRef } from "@/components/ui/PatientRef";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PrioritiesData, PriorityRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";
import { usePillFilter } from "@/lib/usePillFilter";

/* The priority queue: new leads first, then anyone going quiet, then today's
   follow-ups. Two surfaces share this table (spec 02 sections 8.1 and 8.2):
   the home panel p-priorities shows the top 8 with a link to /cases; the
   Cases view shows the top 12 as "Fatima's morning list" with the lock note
   and, per 06 group A, the service filter pills (All, Telemedicine, Medical
   travel) over the already-fetched rows. Home stays calm: no filter there,
   but rows still carry the service word in their stage text. */

const LIMITS = { home: 8, cases: 12 } as const;

type PrioritiesVariant = keyof typeof LIMITS;

type ServiceKey = PriorityRow["service"];

const SERVICE_WORD: Record<ServiceKey, string> = { tele: "Tele", travel: "Travel" };
const SERVICE_NOUN: Record<ServiceKey, string> = { tele: "telemedicine", travel: "travel" };

const SERVICE_PILLS = [
  { key: "all", label: "All" },
  { key: "tele", label: "Telemedicine" },
  { key: "travel", label: "Medical travel" },
];

const WHO_COLUMN: DataTableColumn<PriorityRow> = {
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
};

const WHY_COLUMN: DataTableColumn<PriorityRow> = {
  key: "why_now",
  label: "Why now",
  render: (row) => <Chip variant={row.why_now.tone}>{row.why_now.label}</Chip>,
};

const TAIL_COLUMNS: DataTableColumn<PriorityRow>[] = [
  {
    key: "waiting",
    label: "Waiting",
    render: (row) => <span className="num">{row.waiting_display}</span>,
  },
  { key: "next_step", label: "Next step" },
  { key: "source", label: "Source" },
];

/* Cases: a visible Travel or Tele chip plus the stage or context word.
   Home: the same words as plain text, keeping the panel calm. */
const COLUMNS: Record<PrioritiesVariant, DataTableColumn<PriorityRow>[]> = {
  cases: [
    WHO_COLUMN,
    WHY_COLUMN,
    {
      key: "service",
      label: "Service",
      render: (row) => (
        <span className="inline-flex items-center gap-[6px]">
          <Chip variant={row.service === "travel" ? "info" : "mut"}>
            {SERVICE_WORD[row.service]}
          </Chip>
          {row.pipeline ? <span>{row.pipeline}</span> : null}
        </span>
      ),
    },
    ...TAIL_COLUMNS,
  ],
  home: [
    WHO_COLUMN,
    WHY_COLUMN,
    {
      key: "service",
      label: "Service",
      render: (row) =>
        [SERVICE_WORD[row.service], row.pipeline].filter(Boolean).join(" "),
    },
    ...TAIL_COLUMNS,
  ],
};

function PrioritiesSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      <Skeleton height={12} width="42%" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={17} />
      ))}
    </div>
  );
}

export function PrioritiesPanel({
  person,
  variant = "home",
}: {
  person: string;
  variant?: PrioritiesVariant;
}) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;
  const limit = LIMITS[variant];
  const service = usePillFilter<ServiceKey, PriorityRow>((row) => row.service);

  const query = useQuery({
    queryKey: qk.priorities(person),
    queryFn: () =>
      fetchEnvelope<PrioritiesData>("priorities", "/pipeline/priorities", { person }),
  });

  const data = query.data?.data;
  const shown = data ? Math.min(limit, data.rows.length) : null;
  const total = data ? data.counts.shown + data.counts.queued : null;
  const visible = data ? service.filter(data.rows.slice(0, limit)) : null;

  /* Honest counts (06 group A): unfiltered reads "Top 12 of 31". Filtered,
     the per-service totals are not in the delta payload, so the chip scopes
     its claim to the fetched window instead of implying the visible rows
     are everything. */
  const countChip =
    shown && visible
      ? service.value === "all"
        ? `Top ${shown} of ${total}`
        : `${visible.length} ${SERVICE_NOUN[service.value]} in the top ${shown}`
      : null;

  return (
    <Card>
      <CardHeader
        title={variant === "cases" ? "Fatima's morning list" : "Your morning, in order"}
        subtitle={
          variant === "cases"
            ? "Everything waiting on a human reply, in priority order."
            : "New leads first, then anyone going quiet, then today's follow-ups."
        }
        right={
          variant === "cases" ? (
            <div className="flex flex-wrap items-center justify-end gap-[10px]">
              <Pills
                aria-label="Filter by service"
                items={SERVICE_PILLS}
                value={service.value}
                onChange={(key) => service.setValue(key as ServiceKey | "all")}
              />
              {countChip ? <Chip variant="info">{countChip}</Chip> : null}
            </div>
          ) : shown ? (
            <Chip variant="info">{`Top ${shown}`}</Chip>
          ) : undefined
        }
      />
      <div className="px-[18px] pt-2 pb-4">
        <QueryPanel
          query={query}
          skeleton={<PrioritiesSkeleton rows={limit} />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy="Nothing is waiting on a reply right now."
        >
          {(d, _meta, flags) => {
            const rows =
              variant === "cases" ? service.filter(d.rows.slice(0, limit)) : d.rows.slice(0, limit);
            if (rows.length === 0) {
              return (
                <p className="py-2 text-[13px] text-ink-2">Nothing here under this filter.</p>
              );
            }
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <DataTable
                  columns={COLUMNS[variant]}
                  rows={rows}
                  rowKey={(row) => row.patient_ref.zoho_id}
                />
              </div>
            );
          }}
        </QueryPanel>
      </div>
      {data && data.rows.length > 0 ? (
        variant === "cases" ? (
          <CardFooter
            note={`Another ${data.counts.queued} at-risk deals are queued behind these. ${data.counts.dormant} dormant cases set aside on purpose.`}
            right={
              <span className="flex items-center gap-1.5 text-ink-3">
                <Lock size={11} strokeWidth={1.8} />
                Names stay in this view. Not exportable.
              </span>
            }
          />
        ) : (
          <CardFooter
            note={`Showing the top ${shown}. Another ${data.counts.queued} at-risk deals are queued, ${data.counts.dormant} dormant set aside.`}
            right={<Link href={buildDeepLink({ view: "cases" }, viewAs)}>Open the full list</Link>}
          />
        )
      ) : null}
    </Card>
  );
}

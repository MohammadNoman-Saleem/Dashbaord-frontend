"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
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

/* The priority queue: new leads first, then anyone going quiet, then today's
   follow-ups. Two surfaces share this table (spec 02 sections 8.1 and 8.2):
   the home panel p-priorities shows the top 8 with a link to /cases; the
   Cases view shows the top 12 as "Fatima's morning list" with the lock note. */

const LIMITS = { home: 8, cases: 12 } as const;

type PrioritiesVariant = keyof typeof LIMITS;

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
    render: (row) => <Chip variant={row.why_now.tone}>{row.why_now.label}</Chip>,
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

  const query = useQuery({
    queryKey: qk.priorities(person),
    queryFn: () =>
      fetchEnvelope<PrioritiesData>("priorities", "/pipeline/priorities", { person }),
  });

  const data = query.data?.data;
  const shown = data ? Math.min(limit, data.rows.length) : null;
  const total = data ? data.counts.shown + data.counts.queued : null;

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
          shown ? (
            <Chip variant="info">
              {variant === "cases" ? `Top ${shown} of ${total}` : `Top ${shown}`}
            </Chip>
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
          {(d, _meta, flags) => (
            <div className={flags.unreliable ? "opacity-55" : undefined}>
              <DataTable
                columns={COLUMNS}
                rows={d.rows.slice(0, limit)}
                rowKey={(row) => row.patient_ref.zoho_id}
              />
            </div>
          )}
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

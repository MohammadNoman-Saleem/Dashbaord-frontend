"use client";

// The month's objectives (spec 02 section 8.6): ship-by-end-of-month
// commitments with a status and a plain progress line. Viewers who may edit
// (admin any, dept head own team, mirrored by the server's can_edit per row)
// get an inline status select; everyone else sees the read-only chip. A
// change writes through PATCH /api/deliverables/:id optimistically with
// rollback, and a toast confirms or reports the failure.
//
// on_track is a computed read state with no legacy status behind it, so it
// is never offered as a settable option; the API rejects it. The select
// carries the four settable statuses only.

import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Check, CircleAlert, Target } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { FieldSelect } from "@/components/ui/Field";
import { ListRow, type ListRowVariant } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { DeliverableRow } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { PEOPLE } from "@/config/people";

type DeliverableStatus = DeliverableRow["status"];
/** The four the server accepts; on_track is computed, not settable. */
type SettableStatus = "done" | "in_progress" | "in_review" | "needs_start";

const WRITE_FAILED =
  "Couldn't save. The status is unchanged. Try again, or tell Al Saeed if it repeats.";

const STATUS_CHIP: Record<DeliverableStatus, { variant: ChipVariant; label: string }> = {
  done: { variant: "good", label: "Done" },
  on_track: { variant: "good", label: "On track" },
  in_progress: { variant: "info", label: "In progress" },
  in_review: { variant: "warn", label: "In review" },
  needs_start: { variant: "mut", label: "Needs a start" },
};

const SETTABLE: Array<{ value: SettableStatus; label: string }> = [
  { value: "needs_start", label: "Needs a start" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "done", label: "Done" },
];

function rowIcon(status: DeliverableStatus) {
  if (status === "done") return Check;
  if (status === "needs_start") return CircleAlert;
  return Target;
}

function rowVariant(status: DeliverableStatus): ListRowVariant {
  if (status === "done") return "good";
  if (status === "in_review" || status === "needs_start") return "warn";
  return "info";
}

/* "khalid" reads as "Khalid"; known people use their configured names. */
function ownerName(key: string): string {
  const known = (PEOPLE as Record<string, { name: string }>)[key];
  if (known) return known.name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "long" });
}

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} height={38} />
    ))}
  </div>
);

/* A computed on_track row defaults the select to in_progress, the nearest
   settable state, so a change always sends a status the server accepts. */
function settableOf(status: DeliverableStatus): SettableStatus {
  return status === "on_track" ? "in_progress" : status;
}

function StatusControl({ row, month }: { row: DeliverableRow; month: string }) {
  const toast = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (status: SettableStatus) =>
      mutateEnvelope<DeliverableRow>("deliverables", "PATCH", `/deliverables/${row.id}`, {
        status,
      }),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: qk.deliverables(month) });
      const snapshot = qc.getQueryData<Envelope<DeliverableRow[]>>(qk.deliverables(month));
      qc.setQueryData<Envelope<DeliverableRow[]>>(qk.deliverables(month), (prev) =>
        prev && prev.data
          ? {
              ...prev,
              data: prev.data.map((r) => (r.id === row.id ? { ...r, status } : r)),
            }
          : prev,
      );
      return { snapshot };
    },
    onError: (_err, _status, context) => {
      if (context?.snapshot) qc.setQueryData(qk.deliverables(month), context.snapshot);
      toast(WRITE_FAILED, CircleAlert);
    },
    onSuccess: (_data, status) => {
      const label = SETTABLE.find((s) => s.value === status)?.label ?? status;
      toast(`Saved. ${row.title} is now "${label}".`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.deliverables(month) });
    },
  });

  return (
    <FieldSelect
      aria-label={`Status for ${row.title}`}
      className="w-[150px]"
      value={settableOf(row.status)}
      disabled={mutation.isPending}
      onChange={(e) => {
        const next = e.target.value as SettableStatus;
        if (next !== settableOf(row.status)) mutation.mutate(next);
      }}
    >
      {SETTABLE.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </FieldSelect>
  );
}

type ObjectivesCardProps = {
  query: UseQueryResult<Envelope<DeliverableRow[]>>;
  month: string;
};

export function ObjectivesCard({ query, month }: ObjectivesCardProps) {
  return (
    <Card>
      <CardHeader
        title={`${monthLabel(month)} objectives`}
        subtitle="Ship-by-end-of-month commitments, one owner each."
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(rows) => rows.length === 0}
          emptyCopy={`No objectives logged for ${monthLabel(month)} yet.`}
        >
          {(rows) => (
            <div>
              {rows.map((row) => {
                const chip = STATUS_CHIP[row.status];
                return (
                  <ListRow
                    key={row.id}
                    icon={rowIcon(row.status)}
                    variant={rowVariant(row.status)}
                    title={row.title}
                    subtitle={`${row.owner_keys.map(ownerName).join(" + ")} · ${row.progress_note}`}
                    right={
                      row.can_edit ? (
                        <StatusControl row={row} month={month} />
                      ) : (
                        <Chip variant={chip.variant}>{chip.label}</Chip>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </QueryPanel>
      </div>
    </Card>
  );
}

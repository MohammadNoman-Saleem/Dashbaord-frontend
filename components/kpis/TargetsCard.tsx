"use client";

// The month's targets table with the scoped edit and delete flows (spec 02
// section 8.6). The server decides who may edit which row (can_edit per
// row); this component only renders controls where the payload says so.
// Edits warn that renaming disconnects an automatic feed, write through
// PATCH /api/kpi/targets/:id optimistically with rollback, and the success
// toast names what stays automatic. Delete is the navy confirm with the
// explicit consequence, then DELETE /api/kpi/targets/:id.

import { useState } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CircleAlert, Pencil, Trash2 } from "lucide-react";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Bar, type BarFill } from "@/components/ui/Bar";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, FieldInput } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { KpiTargetRow } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

const WRITE_FAILED =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

/* "14", "81%", "BHD 8" with one decimal kept for fractional targets. */
function fmtValue(value: number, unit: KpiTargetRow["unit"]): string {
  const text = Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1);
  if (unit === "pct") return `${text}%`;
  if (unit === "bhd") return `BHD ${text}`;
  return text;
}

function progress(row: KpiTargetRow): { pct: number; fill: BarFill } {
  if (row.target <= 0) return { pct: 0, fill: "accent" };
  const pct = Math.min(100, (row.current / row.target) * 100);
  if (row.direction === "at_most") {
    return { pct, fill: row.current <= row.target ? "good" : "warn" };
  }
  return { pct, fill: row.current >= row.target ? "good" : "accent" };
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthShort(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "long" });
}

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    {Array.from({ length: 8 }, (_, i) => (
      <Skeleton key={i} height={18} />
    ))}
  </div>
);

type DisplayRow = KpiTargetRow & { show_owner: boolean };

/** Owner shown once per group: rows arrive sorted by person from the API. */
function withOwnerGroups(rows: KpiTargetRow[]): DisplayRow[] {
  let prev: string | null = null;
  return rows.map((row) => {
    const show = row.person_key !== prev;
    prev = row.person_key;
    return { ...row, show_owner: show };
  });
}

type TargetsCardProps = {
  query: UseQueryResult<Envelope<KpiTargetRow[]>>;
  month: string;
};

export function TargetsCard({ query, month }: TargetsCardProps) {
  const [editing, setEditing] = useState<KpiTargetRow | null>(null);
  const [deleting, setDeleting] = useState<KpiTargetRow | null>(null);

  const columns: DataTableColumn<DisplayRow>[] = [
    {
      key: "owner",
      label: "Owner",
      render: (row) =>
        row.show_owner ? <b className="font-semibold text-title">{row.person_name}</b> : null,
    },
    { key: "label", label: "Target" },
    {
      key: "progress",
      label: "Progress",
      render: (row) => {
        const p = progress(row);
        return (
          <span className="block min-w-[120px]">
            <Bar value={p.pct} fill={p.fill} />
          </span>
        );
      },
    },
    {
      key: "current",
      label: "Current",
      numeric: true,
      render: (row) => fmtValue(row.current, row.unit),
    },
    {
      key: "target",
      label: "Goal",
      numeric: true,
      render: (row) =>
        `${fmtValue(row.target, row.unit)}${row.direction === "at_most" ? " cap" : ""}`,
    },
    {
      key: "actions",
      label: "",
      numeric: true,
      render: (row) =>
        row.can_edit ? (
          <span className="inline-flex">
            <IconButton aria-label={`Edit ${row.label}`} onClick={() => setEditing(row)}>
              <Pencil strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
            <IconButton aria-label={`Delete ${row.label}`} onClick={() => setDeleting(row)}>
              <Trash2 strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
          </span>
        ) : null,
    },
  ];

  return (
    <Card data-focus-id="kpi-targets">
      <CardHeader
        title={`Targets, ${monthLabel(month)}`}
        subtitle="One number per person per metric. A full bar means done."
        right={<Chip variant="info">Month: {monthShort(month)}</Chip>}
      />
      <div className="px-[18px] pb-2 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(rows) => rows.length === 0}
          emptyCopy={`No targets are set for ${monthShort(month)} yet.`}
        >
          {(rows) => (
            <DataTable columns={columns} rows={withOwnerGroups(rows)} rowKey={(row) => row.id} />
          )}
        </QueryPanel>
      </div>
      <CardFooter note="Most of these fill themselves each morning. The rest come in with the Saturday update. Open an edit to see which is which." />

      {editing ? (
        <EditTargetModal row={editing} month={month} onClose={() => setEditing(null)} />
      ) : null}
      {deleting ? (
        <DeleteTargetModal row={deleting} month={month} onClose={() => setDeleting(null)} />
      ) : null}
    </Card>
  );
}

/* ── Edit ── */

function EditTargetModal({
  row,
  month,
  onClose,
}: {
  row: KpiTargetRow;
  month: string;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [target, setTarget] = useState(String(row.target));
  const toast = useToast();
  const qc = useQueryClient();

  const trimmed = label.trim();
  const parsedTarget = Number(target);
  const targetValid = target.trim() !== "" && Number.isFinite(parsedTarget) && parsedTarget >= 0;
  const labelChanged = trimmed !== row.label;
  const targetChanged = targetValid && parsedTarget !== row.target;
  const disconnects = labelChanged && row.source === "auto";
  const canSave = trimmed.length >= 2 && targetValid && (labelChanged || targetChanged);

  const mutation = useMutation({
    mutationFn: (body: { label?: string; target?: number }) =>
      mutateEnvelope<KpiTargetRow>("kpi_targets", "PATCH", `/kpi/targets/${row.id}`, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.kpiTargets(month) });
      const snapshot = qc.getQueryData<Envelope<KpiTargetRow[]>>(qk.kpiTargets(month));
      qc.setQueryData<Envelope<KpiTargetRow[]>>(qk.kpiTargets(month), (prev) =>
        prev && prev.data
          ? {
              ...prev,
              data: prev.data.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      label: body.label ?? r.label,
                      target: body.target ?? r.target,
                      ...(disconnects ? { source: "manual" as const, auto_feed: null } : {}),
                    }
                  : r,
              ),
            }
          : prev,
      );
      return { snapshot };
    },
    onError: (_err, _body, context) => {
      if (context?.snapshot) qc.setQueryData(qk.kpiTargets(month), context.snapshot);
      toast(WRITE_FAILED, CircleAlert);
    },
    onSuccess: () => {
      const staysAuto = row.source === "auto" && !disconnects;
      toast(
        staysAuto
          ? `Saved. ${trimmed} keeps updating automatically each morning.`
          : "Saved as a typed-in number.",
      );
      onClose();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.kpiTargets(month) });
      void qc.invalidateQueries({ queryKey: ["kpi", "strip"] });
      void qc.invalidateQueries({ queryKey: qk.kpiTeamSummary(month) });
    },
  });

  function save() {
    if (!canSave || mutation.isPending) return;
    const body: { label?: string; target?: number } = {};
    if (labelChanged) body.label = trimmed;
    if (targetChanged) body.target = parsedTarget;
    mutation.mutate(body);
  }

  return (
    <Modal open onClose={onClose} aria-label="Edit target">
      <ModalTitle>Edit target</ModalTitle>
      <ModalText>
        {row.label} · {row.person_name} · {monthLabel(month)}
      </ModalText>
      <div className="mb-[14px] flex items-center gap-2">
        {row.source === "auto" ? (
          <>
            <Chip variant="good">Updates automatically</Chip>
            <span className="text-[11.5px] text-ink-3">
              Filled each morning from {row.auto_feed ?? row.metric_key}.
            </span>
          </>
        ) : (
          <>
            <Chip variant="mut">Typed in</Chip>
            <span className="text-[11.5px] text-ink-3">Comes in with the Saturday update.</span>
          </>
        )}
      </div>
      <Field
        label="Metric name"
        htmlFor="edit-target-label"
        hint="Renaming disconnects the automatic feed and makes this a typed-in number."
      >
        <FieldInput
          id="edit-target-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <Field label={`Target for ${monthShort(month)}`} htmlFor="edit-target-value">
        <FieldInput
          id="edit-target-value"
          value={target}
          inputMode="decimal"
          onChange={(e) => setTarget(e.target.value)}
        />
      </Field>
      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!canSave || mutation.isPending}>
          {mutation.isPending ? "Saving" : "Save changes"}
        </Button>
      </ModalRow>
    </Modal>
  );
}

/* ── Delete ── */

function DeleteTargetModal({
  row,
  month,
  onClose,
}: {
  row: KpiTargetRow;
  month: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<{ deleted: boolean }>("kpi_targets", "DELETE", `/kpi/targets/${row.id}`),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.kpiTargets(month) });
      const snapshot = qc.getQueryData<Envelope<KpiTargetRow[]>>(qk.kpiTargets(month));
      qc.setQueryData<Envelope<KpiTargetRow[]>>(qk.kpiTargets(month), (prev) =>
        prev && prev.data
          ? { ...prev, data: prev.data.filter((r) => r.id !== row.id) }
          : prev,
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(qk.kpiTargets(month), context.snapshot);
      toast(WRITE_FAILED, CircleAlert);
    },
    onSuccess: () => {
      toast(`Deleted permanently. ${row.label} is gone from ${row.person_name}'s morning view.`);
      onClose();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.kpiTargets(month) });
      void qc.invalidateQueries({ queryKey: ["kpi", "strip"] });
      void qc.invalidateQueries({ queryKey: qk.kpiTeamSummary(month) });
    },
  });

  return (
    <Modal open onClose={onClose} aria-label="Delete target">
      <ModalTitle>Delete this target?</ModalTitle>
      <ModalText>
        Delete permanently. {row.label} disappears from {row.person_name}&apos;s morning view too.
      </ModalText>
      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="navy"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Deleting" : "Delete permanently"}
        </Button>
      </ModalRow>
    </Modal>
  );
}

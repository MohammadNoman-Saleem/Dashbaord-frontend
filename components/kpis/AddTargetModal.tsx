"use client";

// Add a target (spec 02 section 8.6): the primary action on /kpis, scoped
// the same way as edit and delete (the server lets an admin add for anyone
// and a dept head only for their own team; a refusal comes back as a plain
// 403). One row per person, metric, and month: a duplicate comes back as a
// plain 409, surfaced verbatim under the form rather than as a generic
// failure. Writes through POST /api/kpi/targets and invalidates the same
// keys the edit flow does.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { KpiTargetRow } from "@/lib/api/contract";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer } from "@/lib/viewer";
import { PEOPLE } from "@/config/people";

const WRITE_FAILED =
  "Couldn't save. Nothing changed. Try again, or tell Al Saeed if it repeats.";

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

type PersonOption = { key: string; name: string };

/* The people an admin can pick from come with /api/me; a dept head has no
   such list (they cannot view as others), so the static roster stands in and
   the server enforces the team scope on save. */
function personOptions(mePeople: { key: string; name: string }[] | undefined): PersonOption[] {
  if (mePeople && mePeople.length > 0) return mePeople.map((p) => ({ key: p.key, name: p.name }));
  return Object.entries(PEOPLE).map(([key, cfg]) => ({ key, name: cfg.name }));
}

type CreateBody = {
  person_key: string;
  label: string;
  month: string;
  target: number;
  direction: "at_least" | "at_most";
  unit: "count" | "bhd" | "pct";
};

export function AddTargetModal({ month, onClose }: { month: string; onClose: () => void }) {
  const { me } = useViewer();
  const options = personOptions(me?.people);

  const [personKey, setPersonKey] = useState(options[0]?.key ?? "");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"at_least" | "at_most">("at_least");
  const [unit, setUnit] = useState<"count" | "bhd" | "pct">("count");
  const [serverError, setServerError] = useState<string | null>(null);

  const toast = useToast();
  const qc = useQueryClient();

  const trimmedLabel = label.trim();
  const parsedTarget = Number(target);
  const targetValid = target.trim() !== "" && Number.isFinite(parsedTarget) && parsedTarget >= 0;
  const canSave = personKey !== "" && trimmedLabel.length >= 2 && targetValid;

  const mutation = useMutation({
    mutationFn: (body: CreateBody) =>
      mutateEnvelope<KpiTargetRow>("kpi_targets", "POST", "/kpi/targets", body),
    onSuccess: () => {
      const who = options.find((p) => p.key === personKey)?.name ?? personKey;
      toast(`Added. ${trimmedLabel} is now on ${who}'s ${monthShort(month)} view.`);
      void qc.invalidateQueries({ queryKey: qk.kpiTargets(month) });
      void qc.invalidateQueries({ queryKey: ["kpi", "strip"] });
      void qc.invalidateQueries({ queryKey: qk.kpiTeamSummary(month) });
      onClose();
    },
    onError: (err) => {
      // A duplicate (409) or a scope refusal (403) carries a plain message;
      // show it inline so the person can fix the form. Anything else falls
      // back to the neutral failure copy.
      if (err instanceof ApiError && err.messagePlain) {
        setServerError(err.messagePlain);
      } else {
        toast(WRITE_FAILED, CircleAlert);
      }
    },
  });

  function save() {
    if (!canSave || mutation.isPending) return;
    setServerError(null);
    mutation.mutate({
      person_key: personKey,
      label: trimmedLabel,
      month,
      target: parsedTarget,
      direction,
      unit,
    });
  }

  return (
    <Modal open onClose={onClose} aria-label="Add a target">
      <ModalTitle>Add a target</ModalTitle>
      <ModalText>One number per person per metric for {monthLabel(month)}.</ModalText>

      <Field label="Owner" htmlFor="add-target-person">
        <FieldSelect
          id="add-target-person"
          value={personKey}
          onChange={(e) => setPersonKey(e.target.value)}
        >
          {options.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field
        label="Metric name"
        htmlFor="add-target-label"
        hint="A plain name, for example Consultations booked or Quotes out within 72h."
      >
        <FieldInput
          id="add-target-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Target for ${monthShort(month)}`} htmlFor="add-target-value">
          <FieldInput
            id="add-target-value"
            value={target}
            inputMode="decimal"
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <Field label="Unit" htmlFor="add-target-unit">
          <FieldSelect
            id="add-target-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
          >
            <option value="count">Count</option>
            <option value="bhd">BHD</option>
            <option value="pct">Percent</option>
          </FieldSelect>
        </Field>
      </div>

      <Field
        label="Direction"
        htmlFor="add-target-direction"
        hint="At least is a floor to reach. At most is a cap to stay under."
      >
        <FieldSelect
          id="add-target-direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value as typeof direction)}
        >
          <option value="at_least">At least this much</option>
          <option value="at_most">At most this much</option>
        </FieldSelect>
      </Field>

      {serverError ? (
        <p className="mb-[6px] flex items-start gap-[7px] text-[12.5px] text-ink-2">
          <CircleAlert strokeWidth={1.8} className="mt-[2px] h-[14px] w-[14px] shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </p>
      ) : null}

      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!canSave || mutation.isPending}>
          {mutation.isPending ? "Adding" : "Add target"}
        </Button>
      </ModalRow>
    </Modal>
  );
}

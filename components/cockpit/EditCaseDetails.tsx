"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, PenLine } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type {
  WriteGateChangeEditField,
  WriteGateCommitData,
  WriteGatePrepareData,
} from "@/lib/api/contract";

/* Phase 4 progressive case-field edits: change the patient budget (BHD) or the
   treatment start and end dates on a deal. Each field is its own gated write
   running the same prepare -> confirm -> commit flow as SetFollowUp, with a
   single confirm. A single confirm modal is shared across the three fields,
   driven by which field is pending. When the server reports writes are off,
   the confirm step says so and the apply button is disabled. */

const WRITE_FAILURE_COPY =
  "Couldn't save the change. Nothing changed. Try again, or tell Al Saeed if it repeats.";

type EditField = WriteGateChangeEditField["field"];

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
  /** Current patient budget in BHD, or null. */
  currentBudget: number | null;
  /** Current treatment start date (YYYY-MM-DD), or null. */
  currentTreatmentStart: string | null;
  /** Current treatment end date (YYYY-MM-DD), or null. */
  currentTreatmentEnd: string | null;
};

export function EditCaseDetails({
  resourceId,
  currentBudget,
  currentTreatmentStart,
  currentTreatmentEnd,
}: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [budget, setBudget] = useState(
    currentBudget != null ? String(currentBudget) : "",
  );
  const [treatmentStart, setTreatmentStart] = useState(
    currentTreatmentStart?.slice(0, 10) ?? "",
  );
  const [treatmentEnd, setTreatmentEnd] = useState(
    currentTreatmentEnd?.slice(0, 10) ?? "",
  );
  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);

  const valueFor: Record<EditField, string> = {
    patient_budget: budget,
    treatment_start: treatmentStart,
    treatment_end: treatmentEnd,
  };

  const prepare = useMutation({
    mutationFn: async (field: EditField) => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        {
          resourceType: "deal",
          resourceId,
          change: { kind: "edit_field", field, value: valueFor[field] },
        },
      );
      return res?.data ?? null;
    },
    onSuccess: (data) => {
      if (data) setPrepared(data);
    },
    onError: (error) => {
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : WRITE_FAILURE_COPY,
        AlertCircle,
      );
    },
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!prepared) return null;
      return mutateEnvelope<WriteGateCommitData>(
        "write_gate_commit",
        "POST",
        "/write-gate/commit",
        {
          change_id: prepared.change_id,
          confirmations: prepared.confirmations_required,
        },
      );
    },
    onSuccess: () => {
      toast("Case detail saved.");
      setPrepared(null);
      void queryClient.invalidateQueries({ queryKey: qk.cockpitCase(resourceId) });
    },
    onError: (error) => {
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : WRITE_FAILURE_COPY,
        AlertCircle,
      );
    },
  });

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <PenLine strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Edit case details
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Patient budget (BHD)" htmlFor="edit-budget" className="mb-0 w-[180px]">
          <FieldInput
            id="edit-budget"
            type="number"
            min={0}
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!budget || prepare.isPending}
          onClick={() => prepare.mutate("patient_budget")}
        >
          Review change
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Treatment start" htmlFor="edit-treatment-start" className="mb-0 w-[180px]">
          <FieldInput
            id="edit-treatment-start"
            type="date"
            value={treatmentStart}
            onChange={(event) => setTreatmentStart(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!treatmentStart || prepare.isPending}
          onClick={() => prepare.mutate("treatment_start")}
        >
          Review change
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Treatment end" htmlFor="edit-treatment-end" className="mb-0 w-[180px]">
          <FieldInput
            id="edit-treatment-end"
            type="date"
            value={treatmentEnd}
            onChange={(event) => setTreatmentEnd(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!treatmentEnd || prepare.isPending}
          onClick={() => prepare.mutate("treatment_end")}
        >
          Review change
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Editing a case detail writes to Zoho through the confirm step. Every
        other action here is still read-only.
      </p>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the case detail change"
      >
        <ModalTitle>Confirm this change</ModalTitle>
        <ModalText>
          This is exactly what will change in Zoho. Nothing is written until you
          confirm.
        </ModalText>
        <ul className="mb-[15px] list-disc pl-5 text-[13px] text-title">
          {prepared?.change_list.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {prepared && !prepared.writes_enabled ? (
          <p className="mb-[15px] rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
            Writes are turned off right now, so this cannot be applied yet. It
            will go live once the gate is switched on after sign-off.
          </p>
        ) : null}
        <ModalRow>
          <Button variant="ghost" size="sm" onClick={() => setPrepared(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              commit.isPending || (prepared != null && !prepared.writes_enabled)
            }
            onClick={() => commit.mutate()}
          >
            Confirm and save
          </Button>
        </ModalRow>
      </Modal>
    </div>
  );
}

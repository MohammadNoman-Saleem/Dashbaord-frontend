"use client";

import { useState } from "react";
import { AlertCircle, PenLine } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import {
  useCockpitWrite,
  writeErrorMessage,
  type CockpitEditField,
} from "./useCockpitWrite";

/* Progressive case-field edits: change the patient budget (BHD) or the
   treatment start and end dates on a deal. ONE-STEP write: clicking Save on a
   field sends that field's change in a single POST to
   /api/cockpit/case/[id]/write, which validates, writes to Zoho, and audits in
   one call. No confirm prompt: these are low-impact field edits and write
   immediately on click. The in-flight field's button disables while its request
   runs. If writes are turned off server-side the route refuses and the toast
   carries that message. */

const WRITE_FAILURE_COPY =
  "Couldn't save the change. Nothing changed. Try again, or tell Al Saeed if it repeats.";

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

  const [budget, setBudget] = useState(
    currentBudget != null ? String(currentBudget) : "",
  );
  const [treatmentStart, setTreatmentStart] = useState(
    currentTreatmentStart?.slice(0, 10) ?? "",
  );
  const [treatmentEnd, setTreatmentEnd] = useState(
    currentTreatmentEnd?.slice(0, 10) ?? "",
  );

  const valueFor: Record<CockpitEditField, string> = {
    patient_budget: budget,
    treatment_start: treatmentStart,
    treatment_end: treatmentEnd,
  };

  const save = useCockpitWrite(resourceId, {
    onSuccess: () => toast("Case detail saved."),
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
  });

  function saveField(field: CockpitEditField) {
    save.mutate({ kind: "edit_field", field, value: valueFor[field] });
  }

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
          disabled={!budget || save.isPending}
          onClick={() => saveField("patient_budget")}
        >
          Save budget
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
          disabled={!treatmentStart || save.isPending}
          onClick={() => saveField("treatment_start")}
        >
          Save start date
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
          disabled={!treatmentEnd || save.isPending}
          onClick={() => saveField("treatment_end")}
        >
          Save end date
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Editing a case detail writes to Zoho on click. Every other action here is
        still read-only.
      </p>
    </div>
  );
}

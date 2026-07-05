"use client";

import { useState } from "react";
import { AlertCircle, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldSelect } from "@/components/ui/Field";
import { GrpLabel } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/fetcher";
import type { CockpitRecordType } from "@/lib/api/contract";
import { useCaseProviders, useCaseProviderWrite } from "./useCaseProviders";

/* The case file's Hospitals section: the hospitals this patient has been sent to
   as chips, each with a remove control, plus a picker to add another. It reads and
   writes the same provider_referrals the provider board uses, so the two stay in
   sync. Which hospital a patient was sent to is patient health data, so this whole
   section is name-seer only: the panel renders it only for a name-seer and the
   server gates every path the same way. A remove is conservative: the chip stays
   until the server confirms, then the refetch drops it. */

const ADD_FAILURE_COPY =
  "Couldn't add the hospital. Nothing changed. Try again, or tell Al Saeed if it repeats.";
const REMOVE_FAILURE_COPY =
  "Couldn't remove the hospital. Nothing changed. Try again, or tell Al Saeed if it repeats.";

function toastMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.messagePlain
    ? error.messagePlain
    : fallback;
}

export function CaseProviders({
  caseId,
  recordKind,
}: {
  caseId: string;
  recordKind: CockpitRecordType;
}) {
  const toast = useToast();
  const query = useCaseProviders(caseId, true);
  const { add, remove } = useCaseProviderWrite(caseId, recordKind);
  const [hospitalId, setHospitalId] = useState("");

  const data = query.data?.data;
  const linked = data?.linked ?? [];
  const linkedIds = new Set(linked.map((l) => l.hospital_id));
  // Hide hospitals the patient is already on so a double-add is hard to trigger.
  const options = (data?.available ?? []).filter((h) => !linkedIds.has(h.id));

  const onAdd = () => {
    if (!hospitalId) return;
    add.mutate(hospitalId, {
      onSuccess: () => {
        setHospitalId("");
        toast("Added to the hospital.");
      },
      onError: (error) => toast(toastMessage(error, ADD_FAILURE_COPY), AlertCircle),
    });
  };

  const onRemove = (referralId: string) => {
    remove.mutate(referralId, {
      onSuccess: () => toast("Removed from the hospital."),
      onError: (error) =>
        toast(toastMessage(error, REMOVE_FAILURE_COPY), AlertCircle),
    });
  };

  return (
    <>
      <GrpLabel>Hospitals</GrpLabel>
      <p className="mb-2 text-[11px] text-ink-3">
        Hospitals this patient has been sent to. Also shown on the provider board.
      </p>

      {query.isPending ? (
        <div className="mb-3 flex flex-col gap-2 py-1">
          <Skeleton height={14} width="70%" />
          <Skeleton height={14} width="45%" />
        </div>
      ) : query.isError ? (
        <p className="mb-3 py-1 text-[12px] text-ink-3">
          Couldn&apos;t load hospitals right now. They will appear once the
          connection recovers.
        </p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {linked.length > 0 ? (
            linked.map((l) => (
              <span
                key={l.referral_id}
                className="inline-flex items-center rounded-full border border-line px-[9px] py-[3px] text-[11px] text-ink-2"
              >
                {l.hospital_name}
                <button
                  type="button"
                  aria-label={`Remove ${l.hospital_name}`}
                  disabled={remove.isPending}
                  onClick={() => onRemove(l.referral_id)}
                  className="ml-[5px] flex items-center text-ink-3 hover:text-ink disabled:opacity-40"
                >
                  <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-[12px] text-ink-3">
              Not sent to any hospital yet
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Add to a hospital"
          htmlFor="add-hospital-select"
          className="mb-0 w-[220px]"
        >
          <FieldSelect
            id="add-hospital-select"
            value={hospitalId}
            onChange={(event) => setHospitalId(event.target.value)}
          >
            <option value="">Select a hospital</option>
            {options.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!hospitalId || add.isPending}
          onClick={onAdd}
        >
          Add hospital
        </Button>
      </div>
    </>
  );
}

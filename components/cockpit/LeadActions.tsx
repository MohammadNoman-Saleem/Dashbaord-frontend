"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type {
  CockpitPipeline,
  WriteGateChange,
  WriteGateCommitData,
  WriteGatePrepareData,
  WriteGateStageOptionsData,
} from "@/lib/api/contract";

/* Lead-stage cockpit writes, the lead counterpart to the deal controls. Each of
   the three controls runs the same prepare -> confirm -> commit flow as
   StageMove and EditCaseDetails, routed through the write gate with
   resourceType 'lead'. A single confirm modal is shared across the three,
   driven by which change is prepared. When the server reports writes are off,
   the confirm step says so and the apply button is disabled: nothing is written
   until the gate is turned on after sign-off.

   Convert to deal reads the full open-stage list for the chosen pipeline from
   /write-gate/stage-options (pipeline only, no current stage), so the stage
   dropdown only ever offers CRM config the server stands behind. */

const WRITE_FAILURE_COPY =
  "Couldn't save the change. Nothing changed. Try again, or tell Al Saeed if it repeats.";

const PIPELINES: CockpitPipeline[] = ["Treatment", "Telemedicine"];

// The Leads Lead_Status picklist, in funnel order.
const LEAD_STATUSES = [
  "New",
  "Intro Call Scheduled",
  "Intro Call Done",
  "Doctor Consultation Scheduled",
  "Doctor Consultation Done",
  "Quote Shared",
  "Deal Ready",
  "Not Qualified",
  "Waiting Response",
];

type Props = {
  /** The lead's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
  /** The current Lead_Status, to prefill the update-status control, or null. */
  currentStatus: string | null;
};

export function LeadActions({ resourceId, currentStatus }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [pipeline, setPipeline] = useState<CockpitPipeline | "">("");
  const [convertStage, setConvertStage] = useState("");
  const [status, setStatus] = useState(currentStatus ?? "");
  const [reason, setReason] = useState("");
  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);

  // The full open-stage list for the chosen pipeline. Fetched only once a
  // pipeline is picked; passing no stage returns every open stage to convert
  // into.
  const options = useQuery({
    queryKey: ["write-gate", "stage-options", pipeline],
    enabled: pipeline !== "",
    queryFn: () =>
      fetchEnvelope<WriteGateStageOptionsData>(
        "write_gate_stage_options",
        "/write-gate/stage-options",
        { pipeline },
      ),
  });

  const stageTargets = options.data?.data?.targets ?? [];

  const prepare = useMutation({
    mutationFn: async (change: WriteGateChange) => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        { resourceType: "lead", resourceId, change },
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
      toast("Lead change saved.");
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

  const convertReady = pipeline !== "" && convertStage !== "";

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <UserPlus strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Lead actions
      </div>

      {/* Convert to deal */}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Convert into pipeline" htmlFor="lead-convert-pipeline" className="mb-0 w-[200px]">
          <FieldSelect
            id="lead-convert-pipeline"
            value={pipeline}
            onChange={(event) => {
              setPipeline(event.target.value as CockpitPipeline | "");
              setConvertStage("");
            }}
          >
            <option value="">Pick a pipeline</option>
            {PIPELINES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <Field label="Stage" htmlFor="lead-convert-stage" className="mb-0 w-[200px]">
          <FieldSelect
            id="lead-convert-stage"
            value={convertStage}
            disabled={pipeline === "" || options.isPending || stageTargets.length === 0}
            onChange={(event) => setConvertStage(event.target.value)}
          >
            <option value="">Pick a stage</option>
            {stageTargets.map((target) => (
              <option key={target} value={target}>
                {target}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!convertReady || prepare.isPending}
          onClick={() => {
            if (pipeline === "") return;
            prepare.mutate({ kind: "convert_lead", pipeline, stage: convertStage });
          }}
        >
          Review change
        </Button>
      </div>

      {/* Update status */}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Lead status" htmlFor="lead-status" className="mb-0 w-[220px]">
          <FieldSelect
            id="lead-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Pick a status</option>
            {LEAD_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!status || prepare.isPending}
          onClick={() => prepare.mutate({ kind: "set_lead_status", status })}
        >
          Review change
        </Button>
      </div>

      {/* Park (not qualified) */}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label="Park reason" htmlFor="lead-park-reason" className="mb-0 w-[300px]">
          <FieldInput
            id="lead-park-reason"
            type="text"
            value={reason}
            placeholder="Why this lead is not qualified"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!reason || prepare.isPending}
          onClick={() => prepare.mutate({ kind: "park_lead", reason })}
        >
          Review change
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-ink-3">
        Each lead action writes to Zoho through the confirm step. Every other
        action here is still read-only.
      </p>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the lead change"
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

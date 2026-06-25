"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  useCockpitWrite,
  writeErrorMessage,
  type CockpitPipeline,
  type CockpitStageOptions,
} from "./useCockpitWrite";

/* Lead-stage cockpit writes, the lead counterpart to the deal controls.
   ONE-STEP write: clicking an action POSTs the change in a single call to
   /api/cockpit/case/[id]/write, which validates and writes to Zoho in one call.
   If writes are turned off server-side the route refuses and the toast carries
   that message.

   Convert to deal reads the full open-stage list for the chosen pipeline from
   /write-gate/stage-options (pipeline only, no current stage), so the stage
   dropdown only ever offers CRM config the server stands behind.

   CONFIRMATION: converting a lead creates a deal (a non-idempotent action), so
   an in-app ConfirmDialog (matching the dashboard, not the browser alert) runs
   before convert only. Clicking Convert opens the dialog; approving it fires
   the write. Update status and park write immediately on click, no prompt. The
   convert button and the dialog's Confirm button are disabled while the request
   is in flight (save.isPending), so a double-click cannot fire a second
   convert; the server also re-reads the lead and refuses if it is already
   converted, so two deals can never be created. */

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
  /** Called after a successful convert with the new deal's Zoho id, so the
   *  parent can open the freshly created deal. Convert only; the other lead
   *  actions never call it. */
  onConvertSuccess?: (newDealId: string) => void;
};

export function LeadActions({ resourceId, currentStatus, onConvertSuccess }: Props) {
  const toast = useToast();

  const [pipeline, setPipeline] = useState<CockpitPipeline | "">("");
  const [convertStage, setConvertStage] = useState("");
  const [status, setStatus] = useState(currentStatus ?? "");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The full open-stage list for the chosen pipeline. Fetched only once a
  // pipeline is picked; passing no stage returns every open stage to convert
  // into.
  const options = useQuery({
    queryKey: ["write-gate", "stage-options", pipeline],
    enabled: pipeline !== "",
    queryFn: () =>
      fetchEnvelope<CockpitStageOptions>(
        "write_gate_stage_options",
        "/write-gate/stage-options",
        { pipeline },
      ),
  });

  const stageTargets = options.data?.data?.targets ?? [];

  const save = useCockpitWrite(resourceId, {
    onSuccess: (result) => {
      // A convert returns the new deal id: show the convert copy and hand the
      // id to the parent so it can open the new deal. set_lead_status and
      // park_lead carry no new_deal_id, so they keep the generic copy and never
      // navigate.
      if (result?.new_deal_id) {
        toast("Lead converted. Opening the new deal.");
        onConvertSuccess?.(result.new_deal_id);
        return;
      }
      toast("Lead change saved.");
    },
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
  });

  const convertReady = pipeline !== "" && convertStage !== "";

  // CONFIRMATION: convert creates a deal (non-idempotent), so clicking Convert
  // opens the in-app confirm dialog rather than writing straight away.
  function openConvertConfirm() {
    if (pipeline === "") return;
    setConfirmOpen(true);
  }

  function confirmConvert() {
    if (pipeline === "") return;
    save.mutate(
      { kind: "convert_lead", pipeline, stage: convertStage },
      { onSettled: () => setConfirmOpen(false) },
    );
  }

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
          disabled={!convertReady || save.isPending}
          onClick={openConvertConfirm}
        >
          Convert to deal
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
          disabled={!status || save.isPending}
          onClick={() => save.mutate({ kind: "set_lead_status", status })}
        >
          Update status
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
          disabled={!reason || save.isPending}
          onClick={() => save.mutate({ kind: "park_lead", reason })}
        >
          Park lead
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-ink-3">
        Each lead action writes to Zoho on click; converting a lead asks for a
        quick confirm first. Every other action here is still read-only.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title="Convert this lead to a deal"
        message={
          pipeline === ""
            ? ""
            : `This creates a ${pipeline} deal in Zoho at ${convertStage} and cannot be undone. The lead becomes a deal once you confirm.`
        }
        confirmLabel="Convert to deal"
        busy={save.isPending}
        onConfirm={confirmConvert}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

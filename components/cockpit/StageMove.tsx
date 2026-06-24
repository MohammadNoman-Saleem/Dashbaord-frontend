"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, GitBranch } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldSelect } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  useCockpitWrite,
  writeErrorMessage,
  type CockpitStageOptions,
} from "./useCockpitWrite";

/* Move a deal to a different stage. ONE-STEP write: on open the control reads
   the allowed target stages and the loss reasons from /write-gate/stage-options
   (so the dropdowns only ever offer CRM config the server stands behind), then
   a single POST to /api/cockpit/case/[id]/write validates and writes to Zoho in
   one call.

   CONFIRMATION: a normal move writes immediately on click. A move to Lost /
   Inactive is high-impact, so an in-app ConfirmDialog (matching the dashboard,
   not the browser alert) runs first; everything else has no prompt. Clicking
   Mark lost opens the dialog; approving it fires the write. The Apply button
   and the dialog's Confirm button disable while the request is in flight. If
   writes are turned off server-side the route refuses and the toast carries
   that message. */

const WRITE_FAILURE_COPY =
  "Couldn't move the stage. Nothing changed. Try again, or tell Al Saeed if it repeats.";

const LOST_STAGE = "Lost / Inactive";

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
  /** The deal's pipeline, which scopes the allowed target stages. */
  pipeline: "Treatment" | "Telemedicine";
  /** The current stage, so the options query can exclude it. */
  currentStage: string | null;
};

export function StageMove({ resourceId, pipeline, currentStage }: Props) {
  const toast = useToast();

  const [toStage, setToStage] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const options = useQuery({
    queryKey: ["write-gate", "stage-options", pipeline, currentStage ?? ""],
    queryFn: () =>
      fetchEnvelope<CockpitStageOptions>(
        "write_gate_stage_options",
        "/write-gate/stage-options",
        { pipeline, stage: currentStage ?? undefined },
      ),
  });

  const targets = options.data?.data?.targets ?? [];
  const lossReasons = options.data?.data?.loss_reasons ?? [];
  const isLossMove = toStage === LOST_STAGE;
  const reasonMissing = isLossMove && !reason;

  const save = useCockpitWrite(resourceId, {
    onSuccess: () => toast("Stage moved."),
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
  });

  function commitMove() {
    save.mutate({
      kind: "move_stage",
      to_stage: toStage,
      reason_for_loss: isLossMove ? reason : null,
    });
  }

  function apply() {
    // CONFIRMATION: only a move to Lost / Inactive opens the in-app confirm
    // dialog (it marks the case lost). Every other move writes on click.
    if (isLossMove) {
      setConfirmOpen(true);
      return;
    }
    commitMove();
  }

  function confirmLoss() {
    save.mutate(
      { kind: "move_stage", to_stage: toStage, reason_for_loss: reason },
      { onSettled: () => setConfirmOpen(false) },
    );
  }

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <GitBranch strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Move stage
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Move to" htmlFor="stage-move-target" className="mb-0 w-[220px]">
          <FieldSelect
            id="stage-move-target"
            value={toStage}
            disabled={options.isPending || targets.length === 0}
            onChange={(event) => {
              setToStage(event.target.value);
              setReason("");
            }}
          >
            <option value="">Pick a stage</option>
            {targets.map((target) => (
              <option key={target} value={target}>
                {target}
              </option>
            ))}
          </FieldSelect>
        </Field>
        {isLossMove ? (
          <Field label="Reason" htmlFor="stage-move-reason" className="mb-0 w-[220px]">
            <FieldSelect
              id="stage-move-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">Pick a reason</option>
              {lossReasons.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </FieldSelect>
          </Field>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          disabled={!toStage || reasonMissing || save.isPending}
          onClick={apply}
        >
          {isLossMove ? "Mark lost" : "Move stage"}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Moving the stage writes to Zoho on click; a move to {LOST_STAGE} asks for
        a quick confirm first. Every other action here is still read-only.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title={`Mark this deal ${LOST_STAGE}`}
        message={`This writes to Zoho now and cannot be undone. The deal is marked ${LOST_STAGE} with the reason ${reason || "you picked"}, and drops out of the open pipeline until someone revives it.`}
        confirmLabel="Mark lost"
        busy={save.isPending}
        onConfirm={confirmLoss}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

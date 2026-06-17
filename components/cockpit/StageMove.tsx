"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, GitBranch } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type {
  WriteGateCommitData,
  WriteGatePrepareData,
  WriteGateStageOptionsData,
} from "@/lib/api/contract";

/* The second cockpit write wired through the gate (Phase 1b): move a deal to a
   different stage. The flow mirrors SetFollowUp: prepare -> confirm -> commit.
   On open the control reads the allowed target stages and the loss reasons from
   /write-gate/stage-options, so the dropdowns only ever offer CRM config the
   server stands behind.

   A move to Lost / Inactive needs a loss reason and is a high-impact change:
   prepare returns confirmations_required 2, so the confirm step adds a tick box
   before the apply button enables (the double confirm). When the server reports
   writes are off, the confirm step says so and the apply button is disabled. */

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
  const queryClient = useQueryClient();

  const [toStage, setToStage] = useState("");
  const [reason, setReason] = useState("");
  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const options = useQuery({
    queryKey: ["write-gate", "stage-options", pipeline, currentStage ?? ""],
    queryFn: () =>
      fetchEnvelope<WriteGateStageOptionsData>(
        "write_gate_stage_options",
        "/write-gate/stage-options",
        { pipeline, stage: currentStage ?? undefined },
      ),
  });

  const targets = options.data?.data?.targets ?? [];
  const lossReasons = options.data?.data?.loss_reasons ?? [];
  const isLossMove = toStage === LOST_STAGE;
  const reasonMissing = isLossMove && !reason;

  const prepare = useMutation({
    mutationFn: async () => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        {
          resourceType: "deal",
          resourceId,
          change: {
            kind: "move_stage",
            to_stage: toStage,
            reason_for_loss: isLossMove ? reason : null,
          },
        },
      );
      return res?.data ?? null;
    },
    onSuccess: (data) => {
      if (data) {
        setConfirmed(false);
        setPrepared(data);
      }
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
      toast("Stage moved.");
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

  const needsSecondConfirm = prepared != null && prepared.confirmations_required >= 2;

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
          disabled={!toStage || reasonMissing || prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          Review change
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Moving the stage writes to Zoho through the confirm step. Every other
        action here is still read-only.
      </p>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the stage move"
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
        {needsSecondConfirm ? (
          <label className="mb-[15px] flex items-start gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              className="mt-[2px]"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I understand this marks the case as lost. This is the second
              confirm for a high-impact change.
            </span>
          </label>
        ) : null}
        <ModalRow>
          <Button variant="ghost" size="sm" onClick={() => setPrepared(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              commit.isPending ||
              (prepared != null && !prepared.writes_enabled) ||
              (needsSecondConfirm && !confirmed)
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

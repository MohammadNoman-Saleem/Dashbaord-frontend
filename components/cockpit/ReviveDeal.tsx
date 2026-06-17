"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import type {
  CockpitPipeline,
  WriteGateCommitData,
  WriteGatePrepareData,
  WriteGateStageOptionsData,
} from "@/lib/api/contract";

/* Phase 4 parked revival: bring a Lost / Inactive deal back to an open stage.
   This is not a new change kind. It reuses the move_stage flow and the
   stage-options endpoint, scoped from the parked deal's current stage (always
   Lost / Inactive) so the dropdown only offers the open targets the server
   stands behind. Reviving is the opposite of a loss, so it carries no loss
   reason and confirmations_required is 1 (a single confirm). The flow mirrors
   StageMove: prepare -> confirm -> commit. On success the parked list is
   invalidated so the row drops off. When the server reports writes are off,
   the confirm step says so and the apply button is disabled. */

const WRITE_FAILURE_COPY =
  "Couldn't revive the case. Nothing changed. Try again, or tell Al Saeed if it repeats.";

const LOST_STAGE = "Lost / Inactive";

type Props = {
  /** The deal's internal Zoho record id (parked row lead_ref.zoho_id). */
  resourceId: string;
  /** The deal's pipeline, which scopes the allowed target stages. */
  pipeline: CockpitPipeline;
  /** The parked-list query key to invalidate after a successful revive. */
  parkedKey: QueryKey;
};

export function ReviveDeal({ resourceId, pipeline, parkedKey }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [toStage, setToStage] = useState("");
  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);

  const options = useQuery({
    queryKey: ["write-gate", "stage-options", pipeline, LOST_STAGE],
    enabled: open,
    queryFn: () =>
      fetchEnvelope<WriteGateStageOptionsData>(
        "write_gate_stage_options",
        "/write-gate/stage-options",
        { pipeline, stage: LOST_STAGE },
      ),
  });

  // Reviving never moves back to Lost, so drop that target if the policy lists
  // it (the same endpoint backs the loss move, where Lost is a valid target).
  const targets = (options.data?.data?.targets ?? []).filter(
    (target) => target !== LOST_STAGE,
  );

  const prepare = useMutation({
    mutationFn: async () => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        {
          resourceType: "deal",
          resourceId,
          change: { kind: "move_stage", to_stage: toStage, reason_for_loss: null },
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
      toast("Case revived.");
      setPrepared(null);
      setOpen(false);
      setToStage("");
      void queryClient.invalidateQueries({ queryKey: parkedKey });
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

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Revive
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-end gap-2">
      <Field label="Bring back to" htmlFor={`revive-target-${resourceId}`} className="mb-0 w-[200px]">
        <FieldSelect
          id={`revive-target-${resourceId}`}
          value={toStage}
          disabled={options.isPending || targets.length === 0}
          onChange={(event) => setToStage(event.target.value)}
        >
          <option value="">Pick a stage</option>
          {targets.map((target) => (
            <option key={target} value={target}>
              {target}
            </option>
          ))}
        </FieldSelect>
      </Field>
      <Button
        variant="primary"
        size="sm"
        disabled={!toStage || prepare.isPending}
        onClick={() => prepare.mutate()}
      >
        Review change
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the revival"
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
    </span>
  );
}

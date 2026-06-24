"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldSelect } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  useCockpitWrite,
  writeErrorMessage,
  type CockpitPipeline,
  type CockpitStageOptions,
} from "./useCockpitWrite";

/* Parked revival: bring a Lost / Inactive deal back to an open stage. This is
   not a new change kind; it reuses the move_stage flow and the stage-options
   endpoint, scoped from the parked deal's current stage (always Lost /
   Inactive) so the dropdown only offers the open targets the server stands
   behind. Reviving is the opposite of a loss, so it carries no loss reason.

   ONE-STEP write: a single POST to /api/cockpit/case/[id]/write validates and
   writes to Zoho in one call. On success the parked list is invalidated so the
   row drops off (the case query is not the one shown here).

   CONFIRMATION: a revive moves AWAY from Lost, so the Lost-target confirm never
   fires in practice (Lost is filtered out of the targets below). The same
   target-based guard is kept for consistency with StageMove: only a chosen
   target of Lost / Inactive would open the in-app ConfirmDialog (matching the
   dashboard, not the browser alert). Apply writes on click otherwise, and
   disables while the request is in flight. If writes are off server-side the
   route refuses and the toast carries that message. */

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const options = useQuery({
    queryKey: ["write-gate", "stage-options", pipeline, LOST_STAGE],
    enabled: open,
    queryFn: () =>
      fetchEnvelope<CockpitStageOptions>(
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

  const save = useCockpitWrite(resourceId, {
    // This control shows in the parked list, not the case panel; invalidate the
    // parked list instead so the revived row drops off.
    skipCaseInvalidate: true,
    onSuccess: () => {
      toast("Case revived.");
      setOpen(false);
      setToStage("");
      void queryClient.invalidateQueries({ queryKey: parkedKey });
    },
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
  });

  function commitMove() {
    save.mutate({ kind: "move_stage", to_stage: toStage, reason_for_loss: null });
  }

  function apply() {
    // CONFIRMATION: only a Lost / Inactive target opens the confirm dialog
    // (consistent with StageMove). A revive moves away from Lost, so this never
    // fires here.
    if (toStage === LOST_STAGE) {
      setConfirmOpen(true);
      return;
    }
    commitMove();
  }

  function confirmLoss() {
    save.mutate(
      { kind: "move_stage", to_stage: toStage, reason_for_loss: null },
      { onSettled: () => setConfirmOpen(false) },
    );
  }

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
        disabled={!toStage || save.isPending}
        onClick={apply}
      >
        Revive
      </Button>
      <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => setOpen(false)}>
        Cancel
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title={`Mark this deal ${LOST_STAGE}`}
        message={`This writes to Zoho now and cannot be undone. The deal is marked ${LOST_STAGE} and drops out of the open pipeline until someone revives it.`}
        confirmLabel="Mark lost"
        busy={save.isPending}
        onConfirm={confirmLoss}
        onCancel={() => setConfirmOpen(false)}
      />
    </span>
  );
}

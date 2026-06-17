"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type {
  WriteGateCommitData,
  WriteGatePrepareData,
} from "@/lib/api/contract";

/* The first cockpit write wired through the gate (Saleem Cockpit Implementation
   Plan, Phase 1.3): set a deal's next follow-up date. The flow is prepare ->
   confirm -> commit. Prepare validates and returns the plain-language change
   list and a short-lived change_id; the case manager confirms exactly what will
   change; commit applies it and the case refetches.

   The control shows only for deals (leads have no Next_Follow_up field). When
   the server reports writes are off (writes_enabled false), the confirm step
   says so and the apply button is disabled: nothing is written until the gate
   is turned on after sign-off. Every other case-file action stays disabled. */

const WRITE_FAILURE_COPY =
  "Couldn't save the follow-up date. Nothing changed. Try again, or tell Al Saeed if it repeats.";

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
  /** The current next-follow-up date (YYYY-MM-DD) or null. */
  currentFollowUp: string | null;
};

export function SetFollowUp({ resourceId, currentFollowUp }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(currentFollowUp?.slice(0, 10) ?? "");
  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);

  const prepare = useMutation({
    mutationFn: async () => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        {
          resourceType: "deal",
          resourceId,
          change: { kind: "set_follow_up", date },
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
      toast("Follow-up date saved.");
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
        <CalendarClock strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Next follow-up
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Date" htmlFor="follow-up-date" className="mb-0 w-[180px]">
          <FieldInput
            id="follow-up-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={!date || prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          Review change
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Setting a follow-up date writes to Zoho through the confirm step. Every
        other action here is still read-only.
      </p>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the follow-up change"
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

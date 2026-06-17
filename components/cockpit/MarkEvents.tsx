"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Stamp } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type {
  WriteGateChangeStamp,
  WriteGateCommitData,
  WriteGatePrepareData,
} from "@/lib/api/contract";

/* Phase 1b mark-event stamps: record that first contact went out, a quotation
   was sent, a partner quote was requested, or a partner asked for more time.
   Each stamp is a single gated write that runs the same prepare -> confirm ->
   commit flow as SetFollowUp, with a single confirm (no double confirm here).
   When the server reports writes are off, the confirm step says so and the
   apply button is disabled. */

const WRITE_FAILURE_COPY =
  "Couldn't mark the event. Nothing changed. Try again, or tell Al Saeed if it repeats.";

type StampEvent = WriteGateChangeStamp["event"];

const EVENTS: Array<{ event: StampEvent; label: string }> = [
  { event: "first_contact", label: "Mark first contact sent" },
  { event: "quotation_sent", label: "Mark quotation sent" },
  { event: "partner_quote_requested", label: "Mark partner quote requested" },
  { event: "partner_more_time", label: "Mark partner needs more time" },
];

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
};

export function MarkEvents({ resourceId }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [pendingEvent, setPendingEvent] = useState<StampEvent | null>(null);
  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);

  const prepare = useMutation({
    mutationFn: async (event: StampEvent) => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        {
          resourceType: "deal",
          resourceId,
          change: { kind: "stamp", event },
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
      toast("Event marked.");
      setPrepared(null);
      setPendingEvent(null);
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

  function start(event: StampEvent) {
    setPendingEvent(event);
    prepare.mutate(event);
  }

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <Stamp strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Mark an event
      </div>
      <div className="flex flex-wrap gap-2">
        {EVENTS.map((item) => (
          <Button
            key={item.event}
            variant="ghost"
            size="sm"
            disabled={prepare.isPending && pendingEvent === item.event}
            onClick={() => start(item.event)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Marking an event writes to Zoho through the confirm step. Every other
        action here is still read-only.
      </p>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the event"
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

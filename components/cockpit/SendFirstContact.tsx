"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type {
  WhatsAppTemplateData,
  WriteGateCommitData,
  WriteGatePrepareData,
} from "@/lib/api/contract";

/* Phase 2 send-and-log: send the fixed first-contact WhatsApp template to the
   patient and log it on the deal, stamping the last-comm date. The flow mirrors
   SetFollowUp: prepare -> confirm -> commit, with a single confirm.

   On render the control reads the fixed template text and previews it, so the
   case manager sees exactly what goes out before they confirm. The template is
   a non-clinical greeting and still needs sign-off; the backend send runs
   through a no-op adapter until the provider lands. When the server reports
   writes are off, the confirm step says so and the apply button is disabled. */

const WRITE_FAILURE_COPY =
  "Couldn't send the first contact. Nothing changed. Try again, or tell Al Saeed if it repeats.";

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
};

export function SendFirstContact({ resourceId }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [prepared, setPrepared] = useState<WriteGatePrepareData | null>(null);

  const template = useQuery({
    queryKey: ["whatsapp", "first-contact-template"],
    queryFn: () =>
      fetchEnvelope<WhatsAppTemplateData>(
        "whatsapp_first_contact_template",
        "/whatsapp/template/first_contact",
      ),
  });

  const templateText = template.data?.data?.text ?? null;

  const prepare = useMutation({
    mutationFn: async () => {
      const res = await mutateEnvelope<WriteGatePrepareData>(
        "write_gate_prepare",
        "POST",
        "/write-gate/prepare",
        {
          resourceType: "deal",
          resourceId,
          change: { kind: "send_first_contact" },
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
      toast("First contact sent and logged.");
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
        <MessageCircle strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Send first contact
      </div>
      <div className="my-[9px] rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
        {templateText ?? "The first-contact template will appear here once it loads."}
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={templateText == null || prepare.isPending}
        onClick={() => prepare.mutate()}
      >
        Send first contact
      </Button>
      <p className="mt-2 text-[11px] text-ink-3">
        Sending the first contact writes to Zoho through the confirm step. Every
        other action here is still read-only.
      </p>

      <Modal
        open={prepared != null}
        onClose={() => setPrepared(null)}
        aria-label="Confirm the first contact"
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
        {templateText ? (
          <div className="mb-[15px] rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
            {templateText}
          </div>
        ) : null}
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
            Confirm and send
          </Button>
        </ModalRow>
      </Modal>
    </div>
  );
}

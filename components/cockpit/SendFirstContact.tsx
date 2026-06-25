"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fetchEnvelope } from "@/lib/api/fetcher";
import type { WhatsAppTemplateData } from "@/lib/api/contract";
import { useCockpitWrite, writeErrorMessage } from "./useCockpitWrite";

/* Send-and-log: send the fixed first-contact WhatsApp template to the patient
   and log it on the deal, stamping the last-comm date. ONE-STEP write: clicking
   Send sends the change in a single POST to /api/cockpit/case/[id]/write, which
   sends through the server-side WhatsApp port and, only on a confirmed send,
   stamps the deal in one call. No confirm prompt: the template is a fixed
   non-clinical greeting and writes immediately on click.

   The backend send runs through a no-op adapter until the provider lands, so a
   send returns not-sent and the route refuses without stamping. If writes are
   turned off server-side the route also refuses; the toast carries the message
   either way. The button disables while the request is in flight. */

const WRITE_FAILURE_COPY =
  "Couldn't send the first contact. Nothing changed. Try again, or tell Al Saeed if it repeats.";

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
};

export function SendFirstContact({ resourceId }: Props) {
  const toast = useToast();

  const template = useQuery({
    queryKey: ["whatsapp", "first-contact-template"],
    queryFn: () =>
      fetchEnvelope<WhatsAppTemplateData>(
        "whatsapp_first_contact_template",
        "/whatsapp/template/first_contact",
      ),
  });

  const templateText = template.data?.data?.text ?? null;

  const save = useCockpitWrite(resourceId, {
    onSuccess: () => toast("First contact sent and logged."),
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
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
        disabled={templateText == null || save.isPending}
        onClick={() => save.mutate({ kind: "send_first_contact" })}
      >
        Send first contact
      </Button>
      <p className="mt-2 text-[11px] text-ink-3">
        Sending the first contact writes to Zoho on click. Every other action
        here is still read-only.
      </p>
    </div>
  );
}

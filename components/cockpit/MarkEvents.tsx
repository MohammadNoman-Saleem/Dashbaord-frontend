"use client";

import { AlertCircle, Stamp } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  useCockpitWrite,
  writeErrorMessage,
  type CockpitStampEvent,
} from "./useCockpitWrite";

/* Mark-event stamps: record that first contact went out, a quotation was sent,
   a partner quote was requested, or a partner asked for more time. ONE-STEP
   write: clicking a button sends the stamp in a single POST to
   /api/cockpit/case/[id]/write, which validates, writes to Zoho, and audits in
   one call. No confirm prompt: a stamp is a low-impact change and writes
   immediately on click. If writes are turned off server-side the route refuses
   and the toast carries that message. */

const WRITE_FAILURE_COPY =
  "Couldn't mark the event. Nothing changed. Try again, or tell Al Saeed if it repeats.";

const EVENTS: Array<{ event: CockpitStampEvent; label: string }> = [
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

  const save = useCockpitWrite(resourceId, {
    onSuccess: () => toast("Event marked."),
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
  });

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
            disabled={save.isPending}
            onClick={() => save.mutate({ kind: "stamp", event: item.event })}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Marking an event writes to Zoho on click. Every other action here is
        still read-only.
      </p>
    </div>
  );
}

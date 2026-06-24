"use client";

import { useState } from "react";
import { AlertCircle, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useCockpitWrite, writeErrorMessage } from "./useCockpitWrite";

/* Set a deal's next follow-up date. ONE-STEP write: clicking Save sends the
   change in a single POST to /api/cockpit/case/[id]/write, which validates,
   writes to Zoho, and audits in one call (the former prepare -> confirm ->
   commit split is gone). No confirm prompt: this is a low-impact change and
   writes immediately on click. If writes are turned off server-side the route
   refuses and the toast carries that message.

   The control shows only for deals (leads have no Next_Follow_up field). Every
   other case-file action stays read-only. */

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
  const [date, setDate] = useState(currentFollowUp?.slice(0, 10) ?? "");

  const save = useCockpitWrite(resourceId, {
    onSuccess: () => toast("Follow-up date saved."),
    onError: (error) => toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
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
          disabled={!date || save.isPending}
          onClick={() => save.mutate({ kind: "set_follow_up", date })}
        >
          Save follow-up
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Setting a follow-up date writes to Zoho on click. Every other action here
        is still read-only.
      </p>
    </div>
  );
}

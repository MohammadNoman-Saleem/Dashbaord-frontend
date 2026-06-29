"use client";

import { useState } from "react";
import { AlertCircle, Tag } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useCockpitWrite, writeErrorMessage } from "./useCockpitWrite";

/* Add one or more tags to the case record (deal or lead). ONE-STEP write: the
   typed text is split into tag names and sent in a single POST to
   /api/cockpit/case/[id]/write, which validates, writes to Zoho's add_tags
   action, and audits in one call. Writes immediately on click; if writes are
   turned off server-side the route refuses and the toast carries that message.
   Tags are case metadata, not patient data, so this shows for every signed-in
   viewer. The single add_tag kind works for both deals and leads: the server
   detects the module from the record id. */

const WRITE_FAILURE_COPY =
  "Couldn't add the tag. Nothing changed. Try again, or tell Al Saeed if it repeats.";

export function AddTag({
  resourceId,
  availableTags = [],
}: {
  resourceId: string;
  /** The org's existing tag names for this record's module, offered as
   *  suggestions. Free text is still allowed: typing a new name creates it. */
  availableTags?: string[];
}) {
  const toast = useToast();
  const [text, setText] = useState("");

  const save = useCockpitWrite(resourceId, {
    onSuccess: () => {
      setText("");
      toast("Tag added.");
    },
    onError: (error) =>
      toast(writeErrorMessage(error, WRITE_FAILURE_COPY), AlertCircle),
  });

  // Split on commas so the case manager can add several at once; trim and drop
  // blanks. The submit is disabled until there is at least one name.
  const names = text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <Tag strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Add a tag
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Tag" htmlFor="add-tag-input" className="mb-0 w-[220px]">
          <FieldInput
            id="add-tag-input"
            type="text"
            value={text}
            placeholder="e.g. Priority"
            list={
              availableTags.length > 0 ? "cockpit-tag-suggestions" : undefined
            }
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          disabled={names.length === 0 || save.isPending}
          onClick={() => save.mutate({ kind: "add_tag", tag_names: names })}
        >
          Add tag
        </Button>
      </div>
      {availableTags.length > 0 ? (
        <datalist id="cockpit-tag-suggestions">
          {availableTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      ) : null}
      <p className="mt-2 text-[11px] text-ink-3">
        Separate multiple tags with a comma. Adding a tag writes to Zoho on click.
      </p>
    </div>
  );
}

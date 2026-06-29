"use client";

import { AlertCircle, X } from "lucide-react";

import { GrpLabel } from "@/components/ui/Stat";
import { useToast } from "@/components/ui/Toast";
import { AddTag } from "./AddTag";
import { useCockpitWrite, writeErrorMessage } from "./useCockpitWrite";

/* The case file's tags section: the current tags as chips, each with a remove
   control, plus the add-tag picker. Tags are case metadata, not patient data,
   so this shows for every signed-in viewer; both writes are gated server-side by
   WRITE_GATE_ENABLED. Add and remove both work for deals and leads, since the
   server detects the module from the record id. A remove is conservative: the
   chip stays until the server confirms, then the case refetch drops it. */

const REMOVE_FAILURE_COPY =
  "Couldn't remove the tag. Nothing changed. Try again, or tell Al Saeed if it repeats.";

export function CaseTags({
  resourceId,
  tags,
  availableTags,
  flat = false,
}: {
  resourceId: string;
  tags: string[];
  availableTags: string[];
  /** Passed to the add control so it renders without its own border when the
   *  parent already provides a box (the case-file box). */
  flat?: boolean;
}) {
  const toast = useToast();
  const remove = useCockpitWrite(resourceId, {
    onSuccess: () => toast("Tag removed."),
    onError: (error) =>
      toast(writeErrorMessage(error, REMOVE_FAILURE_COPY), AlertCircle),
  });

  return (
    <>
      <GrpLabel>Tags</GrpLabel>
      <div className="mb-3 flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-line px-[9px] py-[3px] text-[11px] text-ink-2"
            >
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate({ kind: "remove_tag", tag_name: t })
                }
                className="ml-[5px] flex items-center text-ink-3 hover:text-ink disabled:opacity-40"
              >
                <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-[12px] text-ink-3">No tags yet</span>
        )}
      </div>
      <AddTag resourceId={resourceId} availableTags={availableTags} flat={flat} />
    </>
  );
}

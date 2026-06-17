"use client";

import { useState } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  BoardCommentResult,
  BoardPriority,
  BoardTaskDetail,
  BoardTaskPatchBody,
} from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalTitle } from "@/components/ui/Modal";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/* The card detail panel. Opens on a card click, fetches the full task through
   the boardTaskDetail query, and shows description, status, priority, owner,
   due, created and modified, an Open in Zoho link, and the recent comments.

   The controls each save through the unified PATCH (status, owner, priority)
   or the comment POST, optimistic with a toast, then invalidate the board and
   this task's detail so both carry Zoho's truth on the next read. The status
   selector here is the keyboard and screen-reader path, since the board cards
   are drag-only.

   Priority is editable unless the backend's probe found Zoho rejects a
   priority write on an existing task (priority_editable false). In that case
   it renders read-only with a short note rather than a control that silently
   fails. */

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

const PRIORITY_OPTIONS: BoardPriority[] = ["None", "Low", "Medium", "High"];

const PRIORITY_VARIANTS: Record<string, ChipVariant> = {
  High: "warn",
  Medium: "info",
  Low: "mut",
};

type TaskDetailModalProps = {
  taskId: string;
  projectId: string;
  onClose: () => void;
};

type DetailEnvelope = Envelope<BoardTaskDetail>;

export function TaskDetailModal({
  taskId,
  projectId,
  onClose,
}: TaskDetailModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const detailKey = qk.boardTaskDetail(taskId);

  const query = useQuery({
    queryKey: detailKey,
    queryFn: () =>
      fetchEnvelope<BoardTaskDetail>(
        "board_task_detail",
        `/board/task/${taskId}`,
        { project: projectId },
      ),
    staleTime: 30_000,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["board"] });
    void queryClient.invalidateQueries({ queryKey: detailKey });
  }

  /* One mutation for every PATCH field. The optimistic update writes the
     changed field onto the cached detail; rollback restores the snapshot. */
  const patchMutation = useMutation({
    mutationFn: (body: Omit<BoardTaskPatchBody, "project">) =>
      mutateEnvelope<BoardTaskDetail>(
        "board",
        "PATCH",
        `/board/task/${taskId}`,
        { project: projectId, ...body },
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<DetailEnvelope>(detailKey);
      queryClient.setQueryData<DetailEnvelope>(detailKey, (old) => {
        if (!old?.data) return old;
        const next = { ...old.data };
        if (body.status !== undefined) next.status = body.status;
        if (body.priority !== undefined) next.priority = body.priority;
        if (body.owner_zpuid !== undefined) {
          const match = old.data.assignable_users.find(
            (u) => u.zpuid === body.owner_zpuid,
          );
          next.owner_zpuid = body.owner_zpuid;
          next.owner = match?.name ?? next.owner;
        }
        return { ...old, data: next };
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(detailKey, context.previous);
      }
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: () => {
      toast("Saved.");
    },
    onSettled: () => {
      invalidate();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      aria-label="Task detail"
      className="w-[520px]"
    >
      <QueryPanel query={query} skeleton={<DetailSkeleton />}>
        {(data) => (
          <DetailBody
            data={data}
            saving={patchMutation.isPending}
            onPatch={(body) => patchMutation.mutate(body)}
            onClose={onClose}
            taskId={taskId}
            projectId={projectId}
            detailKey={detailKey}
            invalidate={invalidate}
          />
        )}
      </QueryPanel>
    </Modal>
  );
}

type DetailBodyProps = {
  data: BoardTaskDetail;
  saving: boolean;
  onPatch: (body: Omit<BoardTaskPatchBody, "project">) => void;
  onClose: () => void;
  taskId: string;
  projectId: string;
  detailKey: readonly unknown[];
  invalidate: () => void;
};

function DetailBody({
  data,
  saving,
  onPatch,
  onClose,
  taskId,
  projectId,
  detailKey,
  invalidate,
}: DetailBodyProps) {
  const priorityEditable = data.priority_editable !== false;
  const priorityValue = data.priority ?? "None";
  const priorityVariant =
    data.priority && data.priority !== "None"
      ? (PRIORITY_VARIANTS[data.priority] ?? "mut")
      : null;

  return (
    <div className="flex flex-col gap-[14px]">
      <div>
        <ModalTitle>{data.name}</ModalTitle>
        <p className="text-xs text-ink-3">
          Created {data.created_display ?? "not set"}
          {data.modified_display ? ` · updated ${data.modified_display}` : ""}
          {data.due_display ? ` · due ${data.due_display}` : ""}
        </p>
      </div>

      {data.description ? (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
          {data.description}
        </p>
      ) : (
        <p className="text-[13px] text-ink-3">No description set.</p>
      )}

      <div className="grid grid-cols-2 gap-x-[12px]">
        <Field label="Status" htmlFor="task-status">
          <FieldSelect
            id="task-status"
            value={data.status}
            disabled={saving}
            onChange={(event) => {
              if (event.target.value !== data.status) {
                onPatch({ status: event.target.value });
              }
            }}
          >
            {/* The status set comes from the board columns the user came from;
                the detail payload carries the current status, and Zoho only
                accepts a known status id, so we offer the current plus the
                standard set the board renders. */}
            {STATUS_OPTIONS(data.status).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </FieldSelect>
        </Field>

        {priorityEditable ? (
          <Field label="Priority" htmlFor="task-priority">
            <FieldSelect
              id="task-priority"
              value={priorityValue}
              disabled={saving}
              onChange={(event) => {
                const next = event.target.value as BoardPriority;
                if (next !== priorityValue) onPatch({ priority: next });
              }}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </FieldSelect>
          </Field>
        ) : (
          <Field
            label="Priority"
            htmlFor="task-priority-readonly"
            hint="Priority editing is not available for existing tasks on this Zoho plan."
          >
            <div
              id="task-priority-readonly"
              className="flex h-[37px] items-center rounded-inner border border-line bg-surface-2 px-[11px] text-[13.5px] text-ink"
            >
              {priorityVariant ? (
                <Chip variant={priorityVariant}>{data.priority}</Chip>
              ) : (
                <span className="text-ink-3">None</span>
              )}
            </div>
          </Field>
        )}
      </div>

      <Field label="Owner" htmlFor="task-owner">
        <FieldSelect
          id="task-owner"
          value={data.owner_zpuid ?? ""}
          disabled={saving}
          onChange={(event) => {
            if (event.target.value && event.target.value !== data.owner_zpuid) {
              onPatch({ owner_zpuid: event.target.value });
            }
          }}
        >
          {data.owner_zpuid ? null : (
            <option value="">Unassigned</option>
          )}
          {data.assignable_users.map((user) => (
            <option key={user.key} value={user.zpuid}>
              {user.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <CommentsSection
        comments={data.comments}
        taskId={taskId}
        projectId={projectId}
        detailKey={detailKey}
        invalidate={invalidate}
      />

      <div className="mt-[2px] flex items-center justify-between gap-2">
        {data.url ? (
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-[6px] text-[13px] font-semibold text-accent hover:underline"
          >
            <ExternalLink strokeWidth={1.8} className="h-[15px] w-[15px]" />
            Open in Zoho
          </a>
        ) : (
          <span className="text-xs text-ink-3">No Zoho link.</span>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

type CommentsSectionProps = {
  comments: BoardTaskDetail["comments"];
  taskId: string;
  projectId: string;
  detailKey: readonly unknown[];
  invalidate: () => void;
};

function CommentsSection({
  comments,
  taskId,
  projectId,
  invalidate,
}: CommentsSectionProps) {
  const toast = useToast();
  const [draft, setDraft] = useState("");

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      mutateEnvelope<BoardCommentResult>(
        "board",
        "POST",
        `/board/task/${taskId}/comment`,
        { project: projectId, content },
      ),
    onError: () => {
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: () => {
      setDraft("");
      toast("Comment added.");
    },
    onSettled: () => {
      invalidate();
    },
  });

  function submit() {
    const content = draft.trim();
    if (!content) return;
    commentMutation.mutate(content);
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        Comments
      </span>
      {comments.length === 0 ? (
        <p className="text-[13px] text-ink-3">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-[8px]">
          {comments.map((comment, index) => (
            <li
              key={`${comment.author}-${index}`}
              className="rounded-inner border border-line-soft bg-surface-2 px-[11px] py-[8px]"
            >
              <p className="text-[13px] leading-snug text-ink-2">
                {comment.content}
              </p>
              <p className="mt-[3px] text-xs text-ink-3">
                {comment.author} · {comment.time_display}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FieldInput
            aria-label="Add a comment"
            placeholder="Add a comment"
            value={draft}
            disabled={commentMutation.isPending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <Button
          onClick={submit}
          disabled={commentMutation.isPending || draft.trim().length === 0}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/* The status set offered in the detail selector. The board renders these
   columns in this order; the current status is always present, so a status
   Zoho added outside the standard set still shows as the selected value. */
const STANDARD_STATUSES = [
  "Backlog",
  "Open",
  "In Progress",
  "To be Tested",
  "On Hold",
  "Delayed",
  "Closed",
  "Cancelled",
];

function STATUS_OPTIONS(current: string): string[] {
  if (STANDARD_STATUSES.includes(current)) return STANDARD_STATUSES;
  return [current, ...STANDARD_STATUSES];
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-[14px]">
      <Skeleton width={220} height={20} />
      <Skeleton height={48} />
      <div className="grid grid-cols-2 gap-x-[12px]">
        <Skeleton height={37} />
        <Skeleton height={37} />
      </div>
      <Skeleton height={37} />
      <Skeleton height={60} />
    </div>
  );
}

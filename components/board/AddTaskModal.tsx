"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  BoardAssignableUser,
  BoardCreateTaskBody,
  BoardCreateTaskResult,
  BoardPriority,
} from "@/lib/api/contract";
import { mutateEnvelope } from "@/lib/api/fetcher";
import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* The Add task form. Opens from the board's Add task button, posts to
   POST /board/task, and on success invalidates the board so the new card
   appears, with a toast carrying the new task id.

   The tasklist is preselected to the board's current tasklist (the only one
   the create can target from this view). The owner picker, priority, and due
   date are optional, matching the create body. This overlaps the topbar Raise
   drawer by design, per the build lead. */

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

const PRIORITY_OPTIONS: BoardPriority[] = ["None", "Low", "Medium", "High"];

type AddTaskModalProps = {
  open: boolean;
  projectId: string;
  tasklistId: string | null;
  users: BoardAssignableUser[];
  onClose: () => void;
};

export function AddTaskModal({
  open,
  projectId,
  tasklistId,
  users,
  onClose,
}: AddTaskModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerZpuid, setOwnerZpuid] = useState("");
  const [priority, setPriority] = useState<BoardPriority>("None");
  const [dueDate, setDueDate] = useState("");

  function reset() {
    setName("");
    setDescription("");
    setOwnerZpuid("");
    setPriority("None");
    setDueDate("");
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const body: BoardCreateTaskBody = {
        project: projectId,
        tasklist_id: tasklistId ?? "",
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(ownerZpuid ? { owner_zpuid: ownerZpuid } : {}),
        ...(priority !== "None" ? { priority } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
      };
      return mutateEnvelope<BoardCreateTaskResult>(
        "board",
        "POST",
        "/board/task",
        body,
      );
    },
    onError: () => {
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: (result) => {
      const id = result?.data?.task_id;
      toast(id ? `Task added, ${id}.` : "Task added.");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      onClose();
    },
  });

  function handleClose() {
    if (createMutation.isPending) return;
    reset();
    onClose();
  }

  const canSubmit =
    name.trim().length > 0 && Boolean(tasklistId) && !createMutation.isPending;

  if (!open) return null;

  return (
    <Modal open onClose={handleClose} aria-label="Add task" className="w-[480px]">
      <ModalTitle>Add task</ModalTitle>
      <ModalText>
        Creates a Zoho task on the selected tasklist. The team is notified
        through Zoho as usual.
      </ModalText>

      {tasklistId ? null : (
        <p className="mb-[13px] text-[13px] text-ink-2">
          Pick a tasklist on the board first. A task needs a list to live on.
        </p>
      )}

      <Field label="Name" htmlFor="add-name">
        <FieldInput
          id="add-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Short task name"
        />
      </Field>

      <div className="grid grid-cols-2 gap-x-[12px]">
        <Field label="Owner" htmlFor="add-owner">
          <FieldSelect
            id="add-owner"
            value={ownerZpuid}
            onChange={(event) => setOwnerZpuid(event.target.value)}
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.key} value={user.zpuid}>
                {user.name}
              </option>
            ))}
          </FieldSelect>
        </Field>

        <Field label="Priority" htmlFor="add-priority">
          <FieldSelect
            id="add-priority"
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as BoardPriority)
            }
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </FieldSelect>
        </Field>
      </div>

      <Field label="Due date" htmlFor="add-due">
        <FieldInput
          id="add-due"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </Field>

      <Field label="Description" htmlFor="add-description">
        <textarea
          id="add-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Optional detail"
          className="w-full rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
        />
      </Field>

      <ModalRow>
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit}
        >
          Add task
        </Button>
      </ModalRow>
    </Modal>
  );
}

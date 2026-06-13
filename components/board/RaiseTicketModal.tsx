"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ItSupportTicketData } from "@/lib/api/contract";
import { mutateEnvelope } from "@/lib/api/fetcher";
import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* Raise an IT ticket: title, what happened, and how urgent. POSTs to
   /api/it-support, which files a Zoho task in the IT project with an
   SLA-derived due date and priority-routed owners. The success toast names
   the ticket id so the raiser can quote it.

   v1 has no attachments (Zoho's API refuses them on our auth) and no
   category selector; tickets land in the General list on the board. */

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

const PRIORITIES = [
  { key: "critical", label: "Critical, work is stopped" },
  { key: "high", label: "High, blocking soon" },
  { key: "medium", label: "Medium, needs a plan" },
  { key: "low", label: "Low, when there is time" },
];

type RaiseTicketModalProps = {
  open: boolean;
  onClose: () => void;
};

export function RaiseTicketModal({ open, onClose }: RaiseTicketModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const raiseMutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<ItSupportTicketData>("it_support", "POST", "/it-support", {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        priority,
      }),
    onSuccess: (envelope) => {
      const id = envelope?.data?.ticket_id;
      toast(
        id
          ? `Ticket ${id} raised. IT picks it up within the SLA.`
          : "Ticket raised. IT picks it up within the SLA.",
      );
      /* The new ticket is a card on the board's General scope. */
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      setTitle("");
      setDescription("");
      setPriority("medium");
      onClose();
    },
    onError: () => {
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
  });

  const canSubmit = title.trim().length >= 3 && !raiseMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} aria-label="Raise an IT ticket">
      <ModalTitle>Raise an IT ticket</ModalTitle>
      <ModalText>
        Goes straight onto the IT board with a due date from the priority you
        pick. Critical means IT answers within the hour.
      </ModalText>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) raiseMutation.mutate();
        }}
      >
        <Field label="What do you need" htmlFor="ticket-title">
          <FieldInput
            id="ticket-title"
            placeholder="One line, e.g. CRM export button fails"
            autoComplete="off"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Details (optional)" htmlFor="ticket-description">
          <textarea
            id="ticket-description"
            rows={4}
            placeholder="What happened, where, and anything you already tried"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-y rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
          />
        </Field>
        <Field label="Priority" htmlFor="ticket-priority">
          <FieldSelect
            id="ticket-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            {PRIORITIES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </FieldSelect>
        </Field>
        <ModalRow>
          <Button variant="ghost" onClick={onClose} disabled={raiseMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {raiseMutation.isPending ? "Raising..." : "Raise ticket"}
          </Button>
        </ModalRow>
      </form>
    </Modal>
  );
}

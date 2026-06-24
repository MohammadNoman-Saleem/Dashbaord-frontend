"use client";

import { Button } from "@/components/ui/Button";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";

/* Reusable in-app confirmation dialog for the irreversible cockpit writes
   (converting a lead to a deal, marking a deal Lost / Inactive). It replaces
   the native browser confirm prompt so the approval step matches the dashboard
   instead of the browser's plain alert. The confirmation step itself is kept:
   the user still approves before the write fires.

   DESIGN: built on the app's Modal and Button. No red anywhere; the design
   system carries no red and the weight of the action lives in the WORDS of the
   message, not in colour. The Confirm button is the app's primary accent
   button; Cancel is the ghost button. While busy the Confirm button is
   disabled (and shows a working label) so a double-click cannot double-submit
   the write; Cancel is disabled too so the dialog cannot be torn down mid
   request. */

type ConfirmDialogProps = {
  /** Whether the dialog is open. */
  open: boolean;
  /** The dialog heading, e.g. "Convert this lead to a deal". */
  title: string;
  /** The body copy that explains what the confirm will do and that it cannot
   *  be undone. Carry the "irreversible" weight here, in words. */
  message: string;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** True while the underlying write is in flight; disables both buttons so a
   *  double-click cannot double-submit. */
  busy?: boolean;
  /** Runs the underlying write (the convert / move-to-Lost mutation). */
  onConfirm: () => void;
  /** Closes the dialog without writing. */
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  // While the write is in flight a scrim click or Escape must not tear the
  // dialog down, so close is a no-op until the request settles.
  function handleClose() {
    if (busy) return;
    onCancel();
  }

  return (
    <Modal open onClose={handleClose} aria-label={title}>
      <ModalTitle>{title}</ModalTitle>
      <ModalText>{message}</ModalText>
      <ModalRow>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          {busy ? "Working" : confirmLabel}
        </Button>
      </ModalRow>
    </Modal>
  );
}

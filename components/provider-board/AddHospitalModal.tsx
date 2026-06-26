"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* Add a board-only hospital, for sending a patient to a hospital not yet in the
   system. It is stored on the board only (never written to Zoho) and shows as a
   column under the country entered here. */

const ADD_FAILURE =
  "Couldn't add the hospital. Try again, or tell Al Saeed if it repeats.";

type AddHospitalModalProps = {
  open: boolean;
  defaultCountry: string;
  onClose: () => void;
};

export function AddHospitalModal({
  open,
  defaultCountry,
  onClose,
}: AddHospitalModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [country, setCountry] = useState(defaultCountry);

  const addMutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<{ id: string }>(
        "provider_board",
        "POST",
        "/provider-board/hospital",
        { name: name.trim(), country: country.trim() },
      ),
    onSuccess: () => {
      toast("Hospital added to the board.");
      void queryClient.invalidateQueries({ queryKey: qk.providerBoard() });
      onClose();
    },
    onError: (error) =>
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : ADD_FAILURE,
        AlertCircle,
      ),
  });

  const canAdd =
    name.trim().length > 0 &&
    country.trim().length > 0 &&
    !addMutation.isPending;

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      aria-label="Add a hospital"
      className="w-[460px]"
    >
      <ModalTitle>Add a hospital</ModalTitle>
      <ModalText>
        For a hospital not yet in the system. It is added to this board only (not
        to Zoho) and appears as a column under its country.
      </ModalText>

      <Field label="Hospital name" htmlFor="add-hospital-name">
        <FieldInput
          id="add-hospital-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Hospital name"
          autoComplete="off"
        />
      </Field>

      <Field label="Country" htmlFor="add-hospital-country">
        <FieldInput
          id="add-hospital-country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          placeholder="e.g. Bahrain, Turkey, India"
          autoComplete="off"
        />
      </Field>

      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => addMutation.mutate()} disabled={!canAdd}>
          Add hospital
        </Button>
      </ModalRow>
    </Modal>
  );
}

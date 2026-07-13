"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/* Add a patient to a hospital column by the Zoho reference shown on a card or in
   the case file, for viewers who do not see patient names (so the name search is
   not available to them). The board finds the matching lead or deal server-side
   and infers the kind. No patient name is ever shown or sent here. */

type HospitalOption = { id: string; name: string };

const ADD_FAILURE =
  "Couldn't add to the board. Try again, or tell Al Saeed if it repeats.";

type AddByReferenceModalProps = {
  open: boolean;
  hospitals: HospitalOption[];
  presetHospitalId: string | null;
  onClose: () => void;
};

export function AddByReferenceModal({
  open,
  hospitals,
  presetHospitalId,
  onClose,
}: AddByReferenceModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [hospitalId, setHospitalId] = useState(presetHospitalId ?? "");
  const [reference, setReference] = useState("");

  const addMutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<{ id: string }>("provider_board", "POST", "/provider-board", {
        hospital_id: hospitalId,
        zoho_id: reference.trim(),
      }),
    onSuccess: () => {
      toast("Added to the hospital.");
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
    Boolean(hospitalId) && reference.trim().length > 0 && !addMutation.isPending;

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      aria-label="Add a patient by Zoho reference"
      className="w-[520px]"
    >
      <ModalTitle>Add a patient to a hospital</ModalTitle>
      <ModalText>
        Pick the hospital you sent the patient to, then enter the Zoho reference
        shown on a patient card or in the case file. The board finds the matching
        lead or deal.
      </ModalText>

      <Field label="Hospital" htmlFor="add-ref-hospital">
        <FieldSelect
          id="add-ref-hospital"
          value={hospitalId}
          onChange={(event) => setHospitalId(event.target.value)}
        >
          <option value="">Select a hospital</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </FieldSelect>
      </Field>

      <Field label="Zoho reference" htmlFor="add-ref-reference">
        <FieldInput
          id="add-ref-reference"
          type="text"
          autoComplete="off"
          placeholder="The reference shown on a card"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>

      <ModalRow>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => addMutation.mutate()} disabled={!canAdd}>
          Add to board
        </Button>
      </ModalRow>
    </Modal>
  );
}

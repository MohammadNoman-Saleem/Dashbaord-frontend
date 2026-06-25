"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Search } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { PatientRef, type PatientRefData } from "@/components/ui/PatientRef";
import { useToast } from "@/components/ui/Toast";

/* Add a patient to a hospital column. Pick the hospital, find the patient by
   reusing the cockpit smart search (POST /cockpit/search, term in the body, the
   same privacy-safe path), select a match, and POST the referral. Identity is
   shown ONLY through PatientRef, so no patient name is ever spelled here. */

type SearchMatch = {
  kind: "lead" | "deal";
  patient_ref: PatientRefData;
  stage_or_status: string | null;
  pipeline: string | null;
  owner: string | null;
};

type HospitalOption = { id: string; name: string };

const SEARCH_FAILURE =
  "Couldn't run the search. Try again, or tell Al Saeed if it keeps happening.";
const ADD_FAILURE =
  "Couldn't add to the board. Try again, or tell Al Saeed if it repeats.";
const MIN_TERM = 2;

type AddReferralModalProps = {
  open: boolean;
  hospitals: HospitalOption[];
  presetHospitalId: string | null;
  onClose: () => void;
};

export function AddReferralModal({
  open,
  hospitals,
  presetHospitalId,
  onClose,
}: AddReferralModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [hospitalId, setHospitalId] = useState(presetHospitalId ?? "");
  const [input, setInput] = useState("");
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [selected, setSelected] = useState<SearchMatch | null>(null);

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await mutateEnvelope<{ matches: SearchMatch[] }>(
        "cockpit_search",
        "POST",
        "/cockpit/search",
        { q },
      );
      return res?.data?.matches ?? [];
    },
    onSuccess: (rows) => setMatches(rows),
    onError: (error) =>
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : SEARCH_FAILURE,
        AlertCircle,
      ),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<{ id: string }>(
        "provider_board",
        "POST",
        "/provider-board",
        {
          hospital_id: hospitalId,
          record_kind: selected?.kind,
          zoho_id: selected?.patient_ref.zoho_id,
        },
      ),
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

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = input.trim();
    if (q.length < MIN_TERM) return;
    searchMutation.mutate(q);
  }

  const canAdd = Boolean(hospitalId) && selected != null && !addMutation.isPending;

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      aria-label="Add a patient to a hospital"
      className="w-[520px]"
    >
      <ModalTitle>Add a patient to a hospital</ModalTitle>
      <ModalText>
        Pick the hospital you sent the patient to, then find the patient. The
        board tracks how long the hospital has had the case.
      </ModalText>

      <Field label="Hospital" htmlFor="add-hospital">
        <FieldSelect
          id="add-hospital"
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

      <Field label="Patient" htmlFor="add-patient-search">
        <form onSubmit={onSearch} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <FieldInput
              id="add-patient-search"
              type="text"
              autoComplete="off"
              placeholder="Name, phone, or Zoho ID"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={input.trim().length < MIN_TERM || searchMutation.isPending}
          >
            <Search strokeWidth={1.8} aria-hidden="true" />
            Find
          </Button>
        </form>
      </Field>

      {selected ? (
        <div className="mb-[12px] rounded-inner border border-line bg-surface-2 px-[11px] py-[9px]">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Selected
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <PatientRef patient={{ ...selected, ...selected.patient_ref }} />
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Change
            </Button>
          </div>
        </div>
      ) : matches != null ? (
        matches.length === 0 ? (
          <p className="mb-[12px] py-1 text-[13px] text-ink-2">
            No lead or deal matches that. Check the spelling or digits.
          </p>
        ) : (
          <div className="mb-[12px] max-h-[240px] overflow-y-auto">
            {matches.map((m) => (
              <div
                key={`${m.kind}-${m.patient_ref.zoho_id}`}
                className="flex items-center justify-between gap-2 border-b border-line-soft py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <PatientRef patient={{ ...m, ...m.patient_ref }} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(m)}
                >
                  Select
                </Button>
              </div>
            ))}
          </div>
        )
      ) : null}

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

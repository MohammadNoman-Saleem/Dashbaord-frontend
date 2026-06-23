"use client";

// Local data layer for the cockpit patient-notes panel (CaseFile).
//
// Per the worker task rules, the response type and the React Query key are
// defined LOCALLY here rather than in lib/api/contract.ts or lib/api/keys.ts,
// so this feature never touches a file the other worker is editing. A local
// EndpointKey alias is cast at the fetcher call sites: the notes endpoint is
// not registered in config/endpoints.ts, and an unregistered key resolves to
// undefined in ENDPOINT_MODES, which is not 'fixture', so fetchEnvelope and
// mutateEnvelope both resolve same-origin against the live /api routes that
// already exist. This keeps the change contained to the two task files.
//
// PRIVACY (NHRA): the server gates these routes to viewers with
// sees_patient_names and a note body may carry patient detail. This module
// never logs a note body, an author name, or any patient value; it only moves
// the typed payloads between the routes and the panel.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import type { EndpointKey } from "@/config/endpoints";

// The note shape the GET/POST routes return (mirrors the CaseNote interface in
// lib/server/services/case-notes.ts). Kept local to avoid editing contract.ts.
export interface CaseNote {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
  /** True when the signed-in viewer authored the note: shows the delete control. */
  mine: boolean;
}

// Local query key for this feature; not added to lib/api/keys.ts.
const caseNotesKey = (caseId: string) => ["cockpit", "case", caseId, "notes"] as const;

// The notes endpoints are not registered in config/endpoints.ts. An
// unregistered key is undefined in ENDPOINT_MODES, which is not 'fixture', so
// the fetcher serves the live same-origin /api route. Cast the literal once.
const NOTES_ENDPOINT = "cockpit_case_notes" as EndpointKey;

/** Active notes for a case, newest first. Disabled until the panel may load
 *  notes (a name-seer with a selected case); short staleTime so a fresh add or
 *  delete shows promptly when the list is invalidated. */
export function useCaseNotes(caseId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: caseNotesKey(caseId ?? ""),
    enabled: enabled && caseId != null && caseId !== "",
    queryFn: () =>
      fetchEnvelope<CaseNote[]>(NOTES_ENDPOINT, `/cockpit/case/${caseId}/notes`),
  });
}

/** Add a note, then invalidate the list so it refetches newest-first. */
export function useAddCaseNote(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      mutateEnvelope<CaseNote>(
        NOTES_ENDPOINT,
        "POST",
        `/cockpit/case/${caseId}/notes`,
        { body },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: caseNotesKey(caseId) });
    },
  });
}

/** Soft-delete a note (the server enforces author-or-manager), then invalidate
 *  the list so the removed note drops out. */
export function useDeleteCaseNote(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      mutateEnvelope<{ id: string; deleted: boolean }>(
        NOTES_ENDPOINT,
        "DELETE",
        `/cockpit/case/${caseId}/notes/${noteId}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: caseNotesKey(caseId) });
    },
  });
}

"use client";

// Local data layer for the cockpit patient-notes panel (CaseFile).
//
// DIRECTION: notes come from ZOHO CRM (the Notes related-list on the deal/lead
// record). The list is READ (useCaseNotes); adding a note now writes back to
// Zoho CRM through the gated POST on the same route (useAddCaseNote). There is
// still no delete path: a note, once written, is managed in Zoho.
//
// Per the worker task rules, the response type and the React Query key are
// defined LOCALLY here rather than in lib/api/contract.ts or lib/api/keys.ts,
// so this feature never touches a file the other worker is editing. A local
// EndpointKey alias is cast at the fetcher call site: the notes endpoint is
// not registered in config/endpoints.ts, and an unregistered key resolves to
// undefined in ENDPOINT_MODES, which is not 'fixture', so fetchEnvelope /
// mutateEnvelope resolve same-origin against the live /api route that already
// exists. This keeps the change contained to the two task files.
//
// PRIVACY (NHRA): the server gates both verbs to viewers with
// sees_patient_names and a note body may carry patient detail. This module
// never logs a note body, a title, an author name, or any patient value; it
// only moves the typed payload between the route and the panel.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import type { EndpointKey } from "@/config/endpoints";
import type { CockpitRecordType } from "@/lib/api/contract";

// The note shape the GET route returns (mirrors the CaseNote interface in
// lib/server/services/zoho-notes.ts: a mapped Zoho v3 Note). Kept local to
// avoid editing contract.ts.
export interface CaseNote {
  id: string;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
}

// The Zoho CRM module the record lives in. Notes hang off Deals and Leads, so
// the panel passes the module derived from the case record_type.
export type NoteModule = "Deals" | "Leads";

/** Map the cockpit record_type ('deal' | 'lead') to the Zoho CRM module the
 *  notes route reads ('Deals' | 'Leads'). */
export function moduleForRecordType(recordType: CockpitRecordType): NoteModule {
  return recordType === "lead" ? "Leads" : "Deals";
}

// Local query key for this feature; not added to lib/api/keys.ts. Keyed on the
// module too, so a deal and a lead with the same id never share a cache entry.
const caseNotesKey = (caseId: string, module: NoteModule) =>
  ["cockpit", "case", caseId, "notes", module] as const;

// The notes endpoint is not registered in config/endpoints.ts. An unregistered
// key is undefined in ENDPOINT_MODES, which is not 'fixture', so the fetcher
// serves the live same-origin /api route. Cast the literal once.
const NOTES_ENDPOINT = "cockpit_case_notes" as EndpointKey;

/** Zoho CRM notes for a case, newest first, READ. The module is passed as
 *  ?module so the route reads the right related-list. Disabled until the panel
 *  may load notes (a name-seer with a selected case). */
export function useCaseNotes(
  caseId: string | null,
  module: NoteModule,
  enabled: boolean,
) {
  return useQuery({
    queryKey: caseNotesKey(caseId ?? "", module),
    enabled: enabled && caseId != null && caseId !== "",
    queryFn: () =>
      fetchEnvelope<CaseNote[]>(
        NOTES_ENDPOINT,
        `/cockpit/case/${caseId}/notes`,
        { module },
      ),
  });
}

// The add-note request body the gated POST validates (content required, title
// optional). The module rides in the body so the route knows the related-list
// without a query param. Kept local; never logged here.
export interface AddCaseNoteInput {
  content: string;
  title?: string;
}

// What the POST returns on success. Mirrors the route's withMeta({ added, id }).
export interface AddCaseNoteResult {
  added: boolean;
  id: string | null;
}

/** Write a note to a case's Zoho CRM Notes related-list through the gated POST,
 *  then invalidate the notes query so the new note appears. The module is sent
 *  in the body (the route also accepts ?module). On success the cached list for
 *  this case/module is refetched. This module never logs the content or title. */
export function useAddCaseNote(caseId: string | null, module: NoteModule) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCaseNoteInput) =>
      mutateEnvelope<AddCaseNoteResult>(
        NOTES_ENDPOINT,
        "POST",
        `/cockpit/case/${caseId}/notes`,
        { content: input.content, title: input.title, module },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: caseNotesKey(caseId ?? "", module),
      });
    },
  });
}

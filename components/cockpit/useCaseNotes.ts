"use client";

// Local data layer for the cockpit patient-notes panel (CaseFile).
//
// DIRECTION: notes now come from ZOHO CRM (the Notes related-list on the
// deal/lead record), READ-ONLY. There is no add or delete path: notes are
// authored in Zoho and the cockpit only displays them. The earlier Supabase
// case_notes write hooks (useAddCaseNote / useDeleteCaseNote) are removed.
//
// Per the worker task rules, the response type and the React Query key are
// defined LOCALLY here rather than in lib/api/contract.ts or lib/api/keys.ts,
// so this feature never touches a file the other worker is editing. A local
// EndpointKey alias is cast at the fetcher call site: the notes endpoint is
// not registered in config/endpoints.ts, and an unregistered key resolves to
// undefined in ENDPOINT_MODES, which is not 'fixture', so fetchEnvelope
// resolves same-origin against the live /api route that already exists. This
// keeps the change contained to the two task files.
//
// PRIVACY (NHRA): the server gates this route to viewers with
// sees_patient_names and a note body may carry patient detail. This module
// never logs a note body, a title, an author name, or any patient value; it
// only moves the typed payload between the route and the panel.

import { useQuery } from "@tanstack/react-query";

import { fetchEnvelope } from "@/lib/api/fetcher";
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

/** Zoho CRM notes for a case, newest first, READ-ONLY. The module is passed as
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

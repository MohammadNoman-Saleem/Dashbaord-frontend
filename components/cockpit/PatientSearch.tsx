"use client";

// Smart patient search (cockpit header). Enter a name, phone, or Zoho ID, see
// the leads and deals that match, click one to open its case file in the
// cockpit. The server auto-detects the kind of term; this box is one input.
//
// Privacy (NHRA, compliance-critical): the route gates this to viewers holding
// sees_patient_names and returns 403 to everyone else, so this box is rendered
// only for a name-seeing viewer (the page checks the capability before mounting
// it). The searched term is treated as sensitive: it lives in component state
// only, is never logged, and never goes into a query key. It rides in the POST
// body (not the URL), so a patient name or phone never lands in access logs or
// browser history. Patient names ride the server's per-field gate plus the
// global PII sweep; the client only displays what the server chose to send.
//
// Self-contained on purpose: the response type and the query key are defined
// here, not in lib/api/contract.ts or lib/api/keys.ts, to avoid a file race with
// the notes worker (a precedent exists for interim local types). The search
// endpoint is always live (no fixture); this POSTs the term through the shared
// mutateEnvelope helper (the same path the cockpit write controls use), keeping
// the term out of any query string.

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { FieldInput } from "@/components/ui/Field";
import { ListRow } from "@/components/ui/ListRow";
import { PatientRef, type PatientRefData } from "@/components/ui/PatientRef";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";

/* One match the server returns. Mirrors PatientSearchMatch in
   lib/server/services/patient-search.ts. Kept local on purpose: single
   consumer, and the shared contract module is owned by another worker.

   The patient identity rides in patient_ref (id + initials + human ref), which
   everyone may see; the patient name is appended by the server as a separate
   field only for a name-seeing viewer. This component renders it through
   PatientRef (the only component allowed to spell a patient name) by spreading
   the match over its patient_ref, the same pattern the queue and case file use,
   so the name is never spelled here and the global PII sweep covers it. */
type PatientSearchMatch = {
  kind: "lead" | "deal";
  patient_ref: PatientRefData;
  stage_or_status: string | null;
  pipeline: string | null;
  owner: string | null;
};

type PatientSearchData = {
  matches: PatientSearchMatch[];
};

/* The minimum term length before the server will match. Mirrors the length
   floor in the service so the UI can keep the button honest rather than firing a
   request that can only return nothing. */
const MIN_TERM_LENGTH = 2;

const SEARCH_FAILURE_COPY =
  "Couldn't run the search. Try again, or tell Al Saeed if it keeps happening.";

/* Run the search through the shared mutateEnvelope POST helper, the same path
   the cockpit write controls use. The term rides in the request body, never a
   query string, so a patient name or phone never lands in access logs or
   browser history; it is never logged here either. Returns the matches array
   (mutateEnvelope yields null only in fixture mode, which this live endpoint
   never hits). */
async function fetchPatientSearch(term: string): Promise<PatientSearchMatch[]> {
  const res = await mutateEnvelope<PatientSearchData>(
    "cockpit_search",
    "POST",
    "/cockpit/search",
    { q: term },
  );
  return res?.data?.matches ?? [];
}

function kindChip(kind: PatientSearchMatch["kind"]) {
  return kind === "deal" ? "Deal" : "Lead";
}

/* The result subtitle is staff routing data only (stage or status, pipeline,
   owner), never the phone or the searched term. */
function matchSubtitle(m: PatientSearchMatch): string {
  const parts: string[] = [];
  if (m.stage_or_status) parts.push(m.stage_or_status);
  if (m.pipeline) parts.push(m.pipeline);
  if (m.owner) parts.push(m.owner);
  return parts.length > 0 ? parts.join(" · ") : "No stage or owner on file.";
}

type Props = {
  /** Open a case in the cockpit by its internal Zoho record id. Wired to the
   *  page's case selection so a click lands in the case-file card. */
  onSelect: (zohoId: string) => void;
};

export function PatientSearch({ onSelect }: Props) {
  // The live input value and the submitted term are separate: the query only
  // runs against a submitted value, so typing does not fire a request per
  // keystroke (and the term is not put into the query key).
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const longEnough = input.trim().length >= MIN_TERM_LENGTH;

  const query = useQuery({
    // The key is a fixed token, NOT the term: the searched value must never ride
    // in the query cache key. Refetching on a new submit is driven by the
    // enabled flag plus a manual refetch below.
    queryKey: ["cockpit", "patient-search"],
    enabled: submitted != null && submitted.length >= MIN_TERM_LENGTH,
    queryFn: () => fetchPatientSearch(submitted ?? ""),
    // The term is sensitive; do not retain it across navigations.
    gcTime: 0,
    staleTime: 0,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = input.trim();
    if (next.length < MIN_TERM_LENGTH) return;
    // If the same value is resubmitted, force a refetch; otherwise updating the
    // submitted value enables (or re-runs) the query.
    if (submitted === next) {
      void query.refetch();
    } else {
      setSubmitted(next);
    }
  }

  const matches = query.data ?? null;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Find a patient"
        subtitle="Search by name, phone, or Zoho ID to jump straight to the case."
      />
      <div className="px-[18px] pb-3 pt-2">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <FieldInput
              type="text"
              autoComplete="off"
              placeholder="Name, phone, or Zoho ID"
              aria-label="Patient search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={!longEnough || query.isFetching}
          >
            <Search strokeWidth={1.8} aria-hidden="true" />
            Search
          </Button>
        </form>
        <p className="mt-1.5 text-xs text-ink-3">
          {longEnough || input.length === 0
            ? "Matches a patient name, a phone (country code optional), or a Zoho record ID."
            : "Enter at least 2 characters to search."}
        </p>

        <div className="mt-3">
          {query.isFetching ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height={48} />
              ))}
            </div>
          ) : query.isError ? (
            <div className="py-1">
              <p className="text-[13px] leading-relaxed text-ink-2">
                {query.error instanceof ApiError && query.error.messagePlain
                  ? query.error.messagePlain
                  : SEARCH_FAILURE_COPY}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : submitted == null ? (
            <p className="py-1 text-[13px] text-ink-2">
              Results will appear here once you search.
            </p>
          ) : matches != null && matches.length === 0 ? (
            <p className="py-1 text-[13px] text-ink-2">
              No lead or deal matches that name, phone, or ID. Check the spelling
              or digits, or the case may not be in the CRM yet.
            </p>
          ) : matches != null ? (
            <div>
              {matches.map((m) => (
                <ListRow
                  key={`${m.kind}-${m.patient_ref.zoho_id}`}
                  icon={User}
                  title={<PatientRef patient={{ ...m, ...m.patient_ref }} />}
                  subtitle={matchSubtitle(m)}
                  right={
                    <span className="flex items-center gap-2">
                      <Chip variant="mut">{kindChip(m.kind)}</Chip>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelect(m.patient_ref.zoho_id)}
                      >
                        Open
                      </Button>
                    </span>
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

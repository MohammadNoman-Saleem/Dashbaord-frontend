"use client";

// Patient phone search (cockpit header). Enter a phone, see the leads and deals
// that carry it, click one to open its case file in the cockpit.
//
// Privacy (NHRA, compliance-critical): the route gates this to viewers holding
// sees_patient_names and returns 403 to everyone else, so this box is rendered
// only for a name-seeing viewer (the page checks the capability before mounting
// it). The searched phone is treated as sensitive: it lives in component state
// only, is never logged, and never goes into a query key. Patient names ride the
// server's per-field gate plus the global PII sweep; the client only displays
// what the server chose to send.
//
// Self-contained on purpose: the response type and the query key are defined
// here, not in lib/api/contract.ts or lib/api/keys.ts, to avoid a file race with
// the notes worker (a precedent exists for interim local types). The search
// endpoint is always live (no fixture), so this calls the route directly through
// fetch with the same conventions as lib/api/fetcher rather than routing through
// fetchEnvelope, which would need a shared EndpointKey.

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { FieldInput } from "@/components/ui/Field";
import { ListRow } from "@/components/ui/ListRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError } from "@/lib/api/fetcher";
import type { Envelope } from "@/lib/api/envelope";

/* One match the server returns. Mirrors PatientSearchMatch in
   lib/server/services/patient-search.ts. Kept local on purpose: single
   consumer, and the shared contract module is owned by another worker. The
   patient name is present only when the server decided this viewer may see it;
   never compose or guess a name from any other field. */
type PatientSearchMatch = {
  kind: "lead" | "deal";
  zoho_id: string;
  name: string | null;
  stage_or_status: string | null;
  pipeline: string | null;
  owner: string | null;
  ref: string;
};

type PatientSearchData = {
  matches: PatientSearchMatch[];
};

/* The minimum digit count the server requires before it will match. Mirrors
   MIN_DIGITS in the service so the UI can keep the button honest rather than
   firing a request that can only return nothing. */
const MIN_DIGITS = 7;

const SEARCH_FAILURE_COPY =
  "Couldn't run the search. Try again, or tell Al Saeed if it keeps happening.";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/* Call the search route directly. Same conventions as lib/api/fetcher
   (same-origin /api, credentials, accept header, ApiError on non-ok). The phone
   goes only into the query string of this request; it is never logged here. */
async function fetchPatientSearch(phone: string): Promise<Envelope<PatientSearchData>> {
  const qs = `?phone=${encodeURIComponent(phone)}`;
  const res = await fetch(`${API_BASE}/api/cockpit/search${qs}`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as Envelope<PatientSearchData> | null;
  if (!res.ok) {
    throw new ApiError(
      `/cockpit/search responded ${res.status}`,
      res.status,
      body?.meta?.error?.message_plain,
    );
  }
  if (!body) {
    throw new ApiError("/cockpit/search returned an empty body", res.status);
  }
  return body;
}

function digitCount(raw: string): number {
  return raw.replace(/\D+/g, "").length;
}

function kindChip(kind: PatientSearchMatch["kind"]) {
  return kind === "deal" ? "Deal" : "Lead";
}

/* The result subtitle is staff routing data only (stage or status, pipeline,
   owner), never the phone. */
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
  // The live input value and the submitted phone are separate: the query only
  // runs against a submitted value, so typing does not fire a request per
  // keystroke (and the phone is not put into the query key).
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const enoughDigits = digitCount(input) >= MIN_DIGITS;

  const query = useQuery({
    // The key is a fixed token, NOT the phone: the searched number must never
    // ride in the query cache key. Refetching on a new submit is driven by the
    // enabled flag plus a manual refetch below.
    queryKey: ["cockpit", "patient-search"],
    enabled: submitted != null,
    queryFn: () => fetchPatientSearch(submitted ?? ""),
    // The phone is sensitive; do not retain it across navigations.
    gcTime: 0,
    staleTime: 0,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enoughDigits) return;
    const next = input.trim();
    // If the same value is resubmitted, force a refetch; otherwise updating the
    // submitted value enables (or re-runs) the query.
    if (submitted === next) {
      void query.refetch();
    } else {
      setSubmitted(next);
    }
  }

  const matches = query.data?.data?.matches ?? null;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Find a patient by phone"
        subtitle="Enter a WhatsApp or mobile number to jump straight to the case."
      />
      <div className="px-[18px] pb-3 pt-2">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <FieldInput
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="e.g. 3300 1234 or +973 3300 1234"
              aria-label="Patient phone number"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={!enoughDigits || query.isFetching}
          >
            <Search strokeWidth={1.8} aria-hidden="true" />
            Search
          </Button>
        </form>
        <p className="mt-1.5 text-xs text-ink-3">
          {enoughDigits || input.length === 0
            ? "Country code is optional. The last 8 to 9 digits are matched."
            : "Enter at least 7 digits to search."}
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
              No lead or deal carries that number. Check the digits, or the case
              may not be in the CRM yet.
            </p>
          ) : matches != null ? (
            <div>
              {matches.map((m) => (
                <ListRow
                  key={`${m.kind}-${m.zoho_id}`}
                  icon={User}
                  title={m.name ?? m.ref}
                  subtitle={matchSubtitle(m)}
                  right={
                    <span className="flex items-center gap-2">
                      <Chip variant="mut">{kindChip(m.kind)}</Chip>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelect(m.zoho_id)}
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

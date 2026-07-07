"use client";

// Local data layer for the cockpit case file's Hospitals section (CaseFile).
//
// DIRECTION: the patient-to-hospital link lives in the Postgres provider_referrals
// table (the provider board), not in Zoho. The read (useCaseProviders) hits the
// case-scoped GET; the writes reuse the provider-board routes so their gating and
// audit are not duplicated: add is POST /provider-board, remove is DELETE
// /provider-board/[referral_id]. Both refresh this case's list and the board.
//
// PRIVACY (NHRA): which hospital a patient was sent to is patient health data. The
// server gates every path to name-seers; the panel only renders this section for a
// name-seer. This module moves ids and hospital names only, never a patient name.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import type { CaseProvidersData, CockpitRecordType } from "@/lib/api/contract";

/** The hospitals a patient has been sent to plus the pickable hospital list, READ.
 *  Disabled until the panel may load it (a name-seer with a selected case). */
export function useCaseProviders(caseId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.cockpitCaseProviders(caseId ?? ""),
    enabled: enabled && caseId != null && caseId !== "",
    queryFn: () =>
      fetchEnvelope<CaseProvidersData>(
        "cockpit_case_providers",
        `/cockpit/case/${caseId}/providers`,
      ),
  });
}

/** Add the patient to a hospital and remove a link, reusing the provider-board
 *  routes. record_kind and the patient zoho_id are fixed for this case. On success
 *  both refresh this case's Hospitals list and the provider board. */
export function useCaseProviderWrite(
  caseId: string,
  recordKind: CockpitRecordType,
) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: qk.cockpitCaseProviders(caseId),
    });
    void queryClient.invalidateQueries({ queryKey: qk.providerBoard() });
  };

  const add = useMutation({
    mutationFn: (hospitalId: string) =>
      mutateEnvelope<{ id: string }>(
        "provider_board",
        "POST",
        "/provider-board",
        { hospital_id: hospitalId, record_kind: recordKind, zoho_id: caseId },
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (referralId: string) =>
      mutateEnvelope<{ id: string }>(
        "provider_board",
        "DELETE",
        `/provider-board/${referralId}`,
      ),
    onSuccess: invalidate,
  });

  return { add, remove };
}

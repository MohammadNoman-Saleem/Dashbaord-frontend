"use client";

// Shared client data layer for the cockpit CRM write controls.
//
// DIRECTION: every cockpit write now goes the SAME way notes and the board
// already write: a control builds its change object and POSTs it ONCE to
// /api/cockpit/case/[id]/write, which validates, writes straight to Zoho, and
// audits in that one call. The former two-step write gate (prepare -> confirm
// -> commit, with a write_intents ledger) is gone; there is no change_id, no
// confirmations_required, and no second round trip.
//
// CONFIRMATION lives in the controls, not here: a lightweight client confirm
// runs ONLY before LeadActions convert_lead and before a StageMove / ReviveDeal
// whose chosen target is Lost / Inactive. Everything else writes immediately on
// click. The submit button is disabled while the request is in flight
// (mutation.isPending), which (with the server convert re-read guard) stops a
// double-click from creating a second deal on convert.
//
// LOCAL TYPES/KEYS (per the worker task rules): the change shape and the result
// shape are defined HERE, not in lib/api/contract.ts; the React Query key is
// qk.cockpitCase from lib/api/keys.ts (already present, not added). This keeps
// the refactor off the contract.ts / keys.ts files the other worker owns. The
// endpoint key cockpit_case_write is already registered in config/endpoints.ts
// as 'live', so mutateEnvelope resolves same-origin against the live route.
//
// PRIVACY (NHRA): this module only moves the typed change between the control
// and the route. It never logs a field value, a patient name, a phone, or a
// budget; the server audits KEYS only.

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";

// The cockpit pipelines a lead converts into / a deal moves within. Kept local
// (a trivial union) so this feature never imports a write-gate type.
export type CockpitPipeline = "Treatment" | "Telemedicine";

// The change object a control sends. This is the SAME shape each control built
// for the old prepare call; only the transport changed (one POST, no change_id).
// Defined locally to keep the refactor off lib/api/contract.ts.
export type CockpitWriteChange =
  | { kind: "set_follow_up"; date: string }
  | { kind: "move_stage"; to_stage: string; reason_for_loss?: string | null }
  | {
      kind: "stamp";
      event:
        | "first_contact"
        | "quotation_sent"
        | "partner_quote_requested"
        | "partner_more_time";
    }
  | { kind: "send_first_contact" }
  | {
      kind: "edit_field";
      field: "patient_budget" | "treatment_start" | "treatment_end";
      value: string;
    }
  | { kind: "convert_lead"; pipeline: CockpitPipeline; stage: string }
  | { kind: "set_lead_status"; status: string }
  | { kind: "set_lead_follow_up"; date: string }
  | { kind: "park_lead"; reason: string };

// The stamp event union, exported for the MarkEvents control's button list.
export type CockpitStampEvent = Extract<
  CockpitWriteChange,
  { kind: "stamp" }
>["event"];

// The edit-field union, exported for the EditCaseDetails control.
export type CockpitEditField = Extract<
  CockpitWriteChange,
  { kind: "edit_field" }
>["field"];

// What the route returns on success (mirrors the service ApplyChangeResult /
// the route's withMeta(...)). Kept local.
export interface CockpitWriteResult {
  committed: boolean;
  change_list: string[];
  resource_id: string;
  new_deal_id?: string | null;
}

// The CRM target stages list the move/convert/revive controls read from
// /write-gate/stage-options. Kept local; that read route is unchanged.
export interface CockpitStageOptions {
  targets: string[];
  loss_reasons: string[];
}

export { ApiError };

/** One mutation that POSTs a change to /api/cockpit/case/[id]/write in a SINGLE
 *  step and, on success, invalidates the case query so the panel refetches.
 *  Each control supplies its own onSuccess (toast + any extra invalidation) and
 *  onError (the plain-language message from the route) via the options.
 *
 *  resourceId is the deal/lead Zoho record id. While the request is in flight
 *  the returned mutation.isPending is true; controls disable their submit
 *  button on it (covers double-click, especially convert). */
export function useCockpitWrite(
  resourceId: string,
  options?: {
    onSuccess?: (result: CockpitWriteResult | null) => void;
    onError?: (error: unknown) => void;
    /** When true, the case query is NOT auto-invalidated (e.g. ReviveDeal
     *  invalidates the parked list instead). Defaults to false. */
    skipCaseInvalidate?: boolean;
  },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: CockpitWriteChange) => {
      const res = await mutateEnvelope<CockpitWriteResult>(
        "cockpit_case_write",
        "POST",
        `/cockpit/case/${encodeURIComponent(resourceId)}/write`,
        { change },
      );
      return res?.data ?? null;
    },
    onSuccess: (result) => {
      // Invalidate the whole cockpit query subtree so the case file, the queue,
      // and the parked list all refetch after a write. The ['cockpit'] literal
      // matches every qk.cockpit* key (they all start with 'cockpit'), which
      // covers what skipCaseInvalidate used to gate, so that option no longer
      // gates this broad invalidate.
      void queryClient.invalidateQueries({ queryKey: ["cockpit"] });
      options?.onSuccess?.(result);
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
}

/** Pull the plain-language failure message off an ApiError, falling back to the
 *  control's own copy. Centralised so every control shows message_plain the
 *  same way. */
export function writeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.messagePlain
    ? error.messagePlain
    : fallback;
}

// Shared client helper for the AI suggestions shown on the Today list and the
// inbox card. Two tiers: tier 1 confirms inline in one tap, tier 2 confirms
// through a small modal first. Keeps the kind sets, the human label, and the
// staleness rule in one place so the two surfaces cannot drift.
import type { InboxEvent } from "@/lib/api/contract";

// Tier 1 kinds get an inline one-tap Confirm; tier 2 kinds confirm through a
// small modal first (same write route). Never-suggest kinds
// (send_first_contact, budget edits) are handled from the case file only.
export const ONE_TAP_KINDS = new Set([
  "set_follow_up",
  "set_lead_follow_up",
  "set_lead_status",
  "stamp",
  "add_tag",
]);

export const MODAL_KINDS = new Set(["move_stage", "convert_lead", "park_lead"]);

export type SuggestedChange = { kind: string; [k: string]: unknown };

export function describeChange(c: SuggestedChange): string | null {
  switch (c.kind) {
    case "set_follow_up":
    case "set_lead_follow_up":
      return `Set follow up to ${String(c.date)}`;
    case "set_lead_status":
      return `Set status: ${String(c.status)}`;
    case "stamp":
      return `Mark ${String(c.event).replace(/_/g, " ")}`;
    case "add_tag":
      return `Add tag: ${Array.isArray(c.tag_names) ? c.tag_names.join(", ") : String(c.tag_names)}`;
    case "move_stage":
      return `Move stage to ${String(c.to_stage)}`;
    case "convert_lead":
      return `Convert to a ${String(c.pipeline)} deal at ${String(c.stage)}`;
    case "park_lead":
      return `Park as Not Qualified (${String(c.reason)})`;
    default:
      return null;
  }
}

export interface PickedSuggestion {
  /** The message event this came from, or null for a proactive (state) suggestion
   *  that has no message to resolve. */
  eventId: string | null;
  change: SuggestedChange;
  label: string;
  stale: boolean;
  /** True for tier 2 kinds: Confirm opens a modal instead of firing directly. */
  modal: boolean;
}

/** Build a PickedSuggestion from a raw change (the proactive case-summary path),
 *  with the same tier + staleness rules but no message event. */
export function pickFromChange(
  change: SuggestedChange | null | undefined,
  stageAt: string | null | undefined,
  currentStage: string | null | undefined,
): PickedSuggestion | null {
  if (!change || !(ONE_TAP_KINDS.has(change.kind) || MODAL_KINDS.has(change.kind))) {
    return null;
  }
  const label = describeChange(change);
  if (!label) return null;
  const stale = stageAt != null && currentStage != null && currentStage !== stageAt;
  return { eventId: null, change, label, stale, modal: MODAL_KINDS.has(change.kind) };
}

/** The first event carrying a one-tap suggestion, with a staleness flag when the
 *  live case has moved since the suggestion was made. */
export function pickSuggestion(
  events: InboxEvent[],
  currentStage: string | null | undefined,
): PickedSuggestion | null {
  const event = events.find(
    (e) =>
      e.triage?.suggested_change &&
      (ONE_TAP_KINDS.has(e.triage.suggested_change.kind) ||
        MODAL_KINDS.has(e.triage.suggested_change.kind)),
  );
  if (!event || !event.triage?.suggested_change) return null;
  const change = event.triage.suggested_change as SuggestedChange;
  const label = describeChange(change);
  if (!label) return null;
  const stamped = event.triage.stage_at_triage;
  const stale =
    stamped != null && currentStage != null && currentStage !== stamped;
  return { eventId: event.id, change, label, stale, modal: MODAL_KINDS.has(change.kind) };
}

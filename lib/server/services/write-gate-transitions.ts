// The allowed stage-transition map for the two cockpit pipelines, plus the
// loss-reason rule. Ported VERBATIM from the NestJS backend
// src/write-gate/transitions.ts (pure: no Zoho, no IO, no DI). Only the policy
// helpers the /write-gate/stage-options read route needs are used here; the
// gate's prepare/commit write paths are DEFERRED and not ported.
//
// Stages and categories are the live, ordered sets verified by the Zoho schema
// discovery (2026-06-17).
//
// Policy (conservative, forward-leaning):
//   - Forward: an open stage may move to any later open stage in its pipeline,
//     or to its Won stage. (Skipping ahead is allowed; the team often jumps.)
//   - Backward: an open or Won stage may move to any EARLIER open stage (a
//     correction or a revival), never inventing a stage.
//   - To Lost / Inactive: allowed from any open stage. REQUIRES a non-empty
//     Reason For Loss from the picklist, and is a high-impact move (double
//     confirm).
//   - From Lost / Inactive: allowed back to any open stage (the parked "way
//     back"). No loss reason needed to revive.
//   - A no-op (to === from) is rejected: nothing to write.
//
// SERVER ONLY by convention; imports nothing Node-specific.

export type CockpitWritePipeline = 'Treatment' | 'Telemedicine';

// Ordered OPEN stages per pipeline (excludes the Won and Lost terminals).
export const OPEN_STAGES: Record<CockpitWritePipeline, string[]> = {
  Treatment: [
    'New Deal',
    'Quote Proposed',
    'Consultation Scheduled',
    'Consult Payment',
    'Consultation Completed',
    'Treatment Quote',
    'Treatment Payment',
    'Treatment Scheduled',
    'Treatment in Progress',
  ],
  Telemedicine: [
    'New Deal',
    'Quote Proposed',
    'Payment Done',
    'Consultation Scheduled',
  ],
};

export const WON_STAGE: Record<CockpitWritePipeline, string> = {
  Treatment: 'Treatment Completed',
  Telemedicine: 'TeleConsult Completed',
};

// Both cockpit pipelines share the one Lost terminal.
export const LOST_STAGE = 'Lost / Inactive';

// Reason For Loss picklist values (Deals Reason_For_Loss__s), minus -None-.
// A move to Lost must carry one of these.
export const LOSS_REASONS = [
  'Price/Affordability',
  'No Response',
  'Service Not Available',
  'Chose Another Provider',
  'Criteria Not Met',
  'Proposal Declined',
  'Contract Declined',
  'Internal Decision',
  'Other',
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

/** Every stage of a pipeline, in order: open stages, then Won, then Lost. */
export function stagesOf(pipeline: CockpitWritePipeline): string[] {
  return [...OPEN_STAGES[pipeline], WON_STAGE[pipeline], LOST_STAGE];
}

export function isKnownStage(
  pipeline: CockpitWritePipeline,
  stage: string,
): boolean {
  return stagesOf(pipeline).includes(stage);
}

export interface TransitionCheck {
  ok: boolean;
  /** Plain-language reason a transition was rejected (null when ok). */
  reason: string | null;
  /** True when the move requires a Reason For Loss (a move into Lost). */
  requires_loss_reason: boolean;
  /** True for high-impact moves needing a second confirmation (into Lost). */
  requires_double_confirm: boolean;
}

function reject(reason: string): TransitionCheck {
  return {
    ok: false,
    reason,
    requires_loss_reason: false,
    requires_double_confirm: false,
  };
}

/** Validate a proposed stage move against the map. Pure: no Zoho, no IO. The
 *  loss-reason value itself is validated by the caller against LOSS_REASONS. */
export function validateStageTransition(
  pipeline: CockpitWritePipeline,
  from: string,
  to: string,
  lossReason: string | null,
): TransitionCheck {
  if (!isKnownStage(pipeline, from)) {
    return reject(`Current stage "${from}" is not a ${pipeline} stage.`);
  }
  if (!isKnownStage(pipeline, to)) {
    return reject(`Target stage "${to}" is not a ${pipeline} stage.`);
  }
  if (from === to) {
    return reject('The deal is already in that stage.');
  }

  // Into Lost: allowed from anywhere, but forces a valid loss reason and a
  // second confirmation.
  if (to === LOST_STAGE) {
    const hasReason = !!lossReason && lossReason.trim().length > 0;
    const validReason =
      hasReason && (LOSS_REASONS as readonly string[]).includes(lossReason);
    if (!validReason) {
      return {
        ok: false,
        reason:
          'Moving a deal to Lost / Inactive needs a reason for loss from the list.',
        requires_loss_reason: true,
        requires_double_confirm: true,
      };
    }
    return {
      ok: true,
      reason: null,
      requires_loss_reason: true,
      requires_double_confirm: true,
    };
  }

  // From Lost back into an open stage: the parked "way back" revival.
  if (from === LOST_STAGE) {
    const openIndex = OPEN_STAGES[pipeline].indexOf(to);
    if (openIndex === -1) {
      return reject(
        'A parked deal can only be revived to an open stage, not straight to Won.',
      );
    }
    return ok();
  }

  const order = stagesOf(pipeline);
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  const wonIndex = order.indexOf(WON_STAGE[pipeline]);

  // Forward to any later open stage or to Won.
  if (toIndex > fromIndex) return ok();

  // Backward only to an earlier OPEN stage (a correction or revival); never
  // backward into Won.
  if (toIndex < fromIndex && toIndex < wonIndex) return ok();

  return reject(`Moving from "${from}" to "${to}" is not an allowed step.`);
}

function ok(): TransitionCheck {
  return {
    ok: true,
    reason: null,
    requires_loss_reason: false,
    requires_double_confirm: false,
  };
}

/** Every stage of the pipeline that is a valid target from currentStage, in
 *  pipeline order. Probes each candidate through validateStageTransition with a
 *  valid loss reason ('No Response') so the Lost target is included; the UI
 *  still requires the reason to be chosen at move time. Pure: no Zoho, no IO. */
export function allowedTargets(
  pipeline: CockpitWritePipeline,
  currentStage: string,
): string[] {
  return stagesOf(pipeline).filter(
    (t) =>
      t !== currentStage &&
      validateStageTransition(pipeline, currentStage, t, 'No Response').ok,
  );
}

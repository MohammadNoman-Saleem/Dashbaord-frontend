// GET /api/write-gate/stage-options?pipeline=&stage= - read-only policy data
// backing the stage-move control: the valid target stages from a given stage in
// a pipeline, and the loss-reason picklist. Ported from the NestJS backend
// src/write-gate/write-gate.controller.ts (@Get('stage-options') stageOptions).
//
// This is the ONLY write-gate route ported now: it is pure policy
// (validateStageTransition / allowedTargets / LOSS_REASONS), no Zoho, no DB,
// serverless-safe. The write paths POST /write-gate/prepare and
// POST /write-gate/commit are DEFERRED (session-scoped pg_advisory_lock breaks
// under the transaction pooler) and are NOT ported here.
//
// No assertPerson: any authenticated viewer (the service key included) may read
// it. An unknown or missing pipeline returns empty targets rather than throwing,
// so a stale query degrades to an empty control. The WriteGateStageOptionsData
// shape ({ targets, loss_reasons }) is preserved VERBATIM so the frontend is
// unchanged.
//
// Node runtime: the route resolves the viewer via the foundation (pg-backed).
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import {
  LOSS_REASONS,
  OPEN_STAGES,
  allowedTargets,
} from '@/lib/server/services/write-gate-transitions';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();

  const url = new URL(req.url);
  const pipeline = url.searchParams.get('pipeline') ?? undefined;
  const stage = url.searchParams.get('stage') ?? undefined;

  const loss_reasons = [...LOSS_REASONS];
  if (pipeline === 'Treatment' || pipeline === 'Telemedicine') {
    // With a current stage: the valid move targets from it. With no stage (or
    // empty): the full open-stage list, so the lead-conversion control can
    // pick a target stage for a deal that does not exist yet.
    const targets =
      stage && stage.trim().length > 0
        ? allowedTargets(pipeline, stage)
        : [...OPEN_STAGES[pipeline]];
    return withMeta({ targets, loss_reasons });
  }
  return withMeta({ targets: [], loss_reasons });
});

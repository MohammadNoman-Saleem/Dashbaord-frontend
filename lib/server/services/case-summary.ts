// Proactive case summaries. For an active cockpit case with no new message, ask
// Nova for a one-line status + a suggested next action from the case STATE alone
// (stage, step, how long it has sat, SLA clock). Triggered by a manual refresh;
// recomputed only when a case's state fingerprint changes, so re-clicking is
// cheap and idempotent. The Today list reads these as the fallback summary and
// suggestion (a fresh message summary/suggestion wins).
//
// PRIVACY (NHRA): the model input is de-identified (no name/phone/id; only
// structural state). The stored summary is gated to name-seers on read. Reuses
// the write-gate suggestion schema so a proactive suggestion is validated against
// the same allowed set the write route enforces.
//
// SERVER ONLY.
import { getPool } from '../db';
import { getEnv } from '../env';
import { getAudit } from '../audit';
import { converseJson } from '../integrations/bedrock';
import { cockpitService, type NormalizedCase } from './cockpit';
import { governingClock } from './sla';
import { LEAD_STATUSES } from './write-gate-changes';
import {
  allowedOptions,
  suggestedChangeSchema,
  type SuggestedChange,
  type TriageContext,
} from './triage';
import type { RequestViewer } from '../auth/viewer';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredSummary {
  summary: string | null;
  suggested_change: SuggestedChange | null;
  stage_at: string | null;
}

/** The state that, if it changes, warrants a fresh read. Only the stage/step -
 *  NOT the SLA clock kind, which ticks over time (due_today -> due_now) and would
 *  churn re-summaries without changing what the summary says (the clock is shown
 *  separately as the due chip). */
function fingerprint(ctx: TriageContext): string {
  return `${ctx.stage_or_status ?? ''}|${ctx.step ?? ''}`;
}

/** Build the de-identified triage context + days-in-stage for a case. */
function contextOf(c: NormalizedCase): { ctx: TriageContext; daysInStage: number } {
  const clock = governingClock(c.clockInputs, new Date());
  const anchor = c.clockInputs.statusChange ?? c.createdTime;
  const daysInStage = anchor
    ? Math.max(0, Math.floor((Date.now() - new Date(anchor).getTime()) / DAY_MS))
    : 0;
  return {
    ctx: {
      matched: true,
      kind: c.recordType,
      step: c.step,
      stage_or_status: c.recordType === 'deal' ? c.stage : c.leadStatus,
      pipeline: c.pipeline,
      clock: { kind: clock.kind, sla_key: clock.sla_key },
    },
    daysInStage,
  };
}

const SYSTEM = [
  'You summarise a medical-travel case for a case manager from its STATUS only.',
  'There is no new patient message. You are given the case status, how many days',
  'it has sat in its current status, and the SLA clock. Output STRICT JSON:',
  '{"summary":"<one short line, at most 120 chars, plainly stating where this case stands and why it needs attention>",',
  '"suggested_change": null OR one of',
  'for a deal: {"kind":"set_follow_up","date":"YYYY-MM-DD"},{"kind":"move_stage","to_stage":"<one of case.allowed.move_stage_targets>"},',
  'for a lead: {"kind":"set_lead_follow_up","date":"YYYY-MM-DD"},{"kind":"set_lead_status","status":"<one of case.allowed.lead_statuses>"},{"kind":"park_lead","reason":"<short>"},{"kind":"convert_lead","pipeline":"Treatment|Telemedicine","stage":"<one of case.allowed.convert_stages>"},',
  'for either: {"kind":"add_tag","tag_names":["<1 to 3 short tags>"]}}',
  'For a lead, advance via convert_lead; never move_stage (deals only).',
  'Every to_stage/status/stage MUST be copied exactly from case.allowed; if none fits, use null.',
  'Suggest the next best action from the state (e.g. a quote sat unanswered for days -> a follow up).',
  'The input includes today as an ISO date; output real calendar dates (YYYY-MM-DD), never the literal.',
].join('\n');

/** Ask Nova for a state summary + suggestion. Throws on a model/config failure
 *  (the caller then leaves the case for the next refresh). */
async function summarizeCase(
  ctx: TriageContext,
  daysInStage: number,
): Promise<{ summary: string | null; suggested_change: SuggestedChange | null }> {
  const opts = allowedOptions(ctx);
  const input = {
    today: new Date().toISOString().slice(0, 10),
    case: {
      kind: ctx.kind,
      step: ctx.step,
      stage_or_status: ctx.stage_or_status,
      pipeline: ctx.pipeline,
      days_in_stage: daysInStage,
      clock: ctx.clock,
      allowed:
        ctx.kind === 'deal'
          ? { move_stage_targets: opts.stage_targets }
          : { lead_statuses: LEAD_STATUSES, convert_stages: opts.convert_stages },
    },
  };
  const raw = await converseJson(SYSTEM, JSON.stringify(input), {
    timeoutMs: 4000,
    purpose: 'case_summary',
  });
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 120) : null;
  const sc = suggestedChangeSchema(ctx).safeParse(obj.suggested_change);
  const suggested = sc.success ? (sc.data as SuggestedChange) : null;
  return { summary, suggested_change: suggested };
}

/** Run an async fn over items with a fixed concurrency. */
async function runPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function readFingerprints(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await getPool().query<{ zoho_id: string; state_fingerprint: string | null }>(
    `select zoho_id, state_fingerprint from case_summaries where zoho_id = any($1::text[])`,
    [ids],
  );
  const m = new Map<string, string>();
  for (const r of rows) if (r.state_fingerprint) m.set(r.zoho_id, r.state_fingerprint);
  return m;
}

/** Recompute summaries for active cockpit cases whose state changed (or are
 *  missing), up to `cap` per call. Returns counts; `remaining` is the backlog
 *  beyond this call (click again to finish). */
export async function refreshSummaries(
  viewer: RequestViewer,
  { cap = 80, concurrency = 8 }: { cap?: number; concurrency?: number } = {},
): Promise<{ refreshed: number; skipped: number; remaining: number }> {
  if (!getEnv().TRIAGE_AI_ENABLED) {
    return { refreshed: 0, skipped: 0, remaining: 0 };
  }
  const { cases } = await cockpitService.population();
  const active = cases.filter((c) => c.step !== 'parked');
  const seen = await readFingerprints(active.map((c) => c.zoho_id));

  const work = active
    .map((c) => ({ c, ...contextOf(c), fp: '' }))
    .map((w) => ({ ...w, fp: fingerprint(w.ctx) }))
    .filter((w) => seen.get(w.c.zoho_id) !== w.fp);

  const remaining = Math.max(0, work.length - cap);
  const batch = work.slice(0, cap);
  const model = getEnv().BEDROCK_MODEL_ID;
  const pool = getPool();
  let refreshed = 0;

  await runPool(batch, concurrency, async (w) => {
    try {
      const { summary, suggested_change } = await summarizeCase(w.ctx, w.daysInStage);
      await pool.query(
        `insert into case_summaries (zoho_id, summary, suggested_change, stage_at, state_fingerprint, model, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (zoho_id) do update set
           summary = excluded.summary, suggested_change = excluded.suggested_change,
           stage_at = excluded.stage_at, state_fingerprint = excluded.state_fingerprint,
           model = excluded.model, updated_at = now()`,
        [
          w.c.zoho_id,
          summary,
          suggested_change ? JSON.stringify(suggested_change) : null,
          w.ctx.stage_or_status,
          w.fp,
          model,
        ],
      );
      refreshed += 1;
    } catch {
      // Leave this case for the next refresh; a transient model error should not
      // stamp a fingerprint that would suppress a retry.
    }
  });

  const skipped = active.length - work.length;
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.summaries_refresh',
    entity_type: 'case_summaries',
    context: { refreshed, skipped, remaining },
  });
  return { refreshed, skipped, remaining };
}

/** Stored summaries for a set of cases, for the Today join. */
export async function getSummaries(ids: string[]): Promise<Map<string, StoredSummary>> {
  if (ids.length === 0) return new Map();
  const { rows } = await getPool().query<{
    zoho_id: string;
    summary: string | null;
    suggested_change: SuggestedChange | null;
    stage_at: string | null;
  }>(
    `select zoho_id, summary, suggested_change, stage_at from case_summaries where zoho_id = any($1::text[])`,
    [ids],
  );
  const m = new Map<string, StoredSummary>();
  for (const r of rows) {
    m.set(r.zoho_id, {
      summary: r.summary,
      suggested_change: r.suggested_change,
      stage_at: r.stage_at,
    });
  }
  return m;
}

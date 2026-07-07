// Reactive-inbox triage. Every matched inbound message gets a rule-based triage
// (always, pure, no gate); when TRIAGE_AI_ENABLED is on, the case's open
// unanswered burst (capped) is refined once per ingest by Amazon Nova (Bedrock),
// which may suggest a low-risk one-click action. The AI result is only ever a
// prefill for the existing write gate; nothing auto-applies.
//
// PRIVACY (NHRA): the AI input is DE-IDENTIFIED. Each message body is passed
// through scrub() (strips emails/phones) and paired only with the case's
// structural state (step, stage, SLA clock) - never name, phone, zoho id, ref,
// or budget. Residual risk: free-text self-identification in the body; accepted
// at sign-off. Bedrock runs cross-region (Nova is not in me-south-1). The
// allowed next stages/statuses ride along; they are CRM vocabulary, not patient
// data.
//
// SERVER ONLY.
import { z } from 'zod';
import { getEnv } from '../env';
import { scrub } from '../errors';
import { converseJson } from '../integrations/bedrock';
import { LEAD_STATUSES } from './write-gate-changes';
import {
  allowedTargets,
  OPEN_STAGES,
  LOST_STAGE,
  type CockpitWritePipeline,
} from './write-gate-transitions';
import type { CockpitStep, ClockKind } from './sla';

export type TriageUrgency = 'urgent' | 'high' | 'normal' | 'low';
export type TriageBucket = 'sla_breach' | 'reply' | 'revival' | 'unmatched';
export type TriageIntent =
  | 'question'
  | 'reschedule'
  | 'confirmation'
  | 'refusal'
  | 'documents'
  | 'payment'
  | 'greeting'
  | 'other';

// The machine-suggestable subset of the write-gate ProposedChange vocabulary.
// Tier 1 kinds get an inline one-tap Confirm; tier 2 kinds (move_stage,
// convert_lead, park_lead) confirm through a modal. send_first_contact and
// edit_field are never AI-suggested.
export type SuggestedChange =
  | { kind: 'set_follow_up'; date: string }
  | { kind: 'set_lead_follow_up'; date: string }
  | { kind: 'set_lead_status'; status: string }
  | { kind: 'stamp'; event: 'first_contact' | 'quotation_sent' | 'partner_quote_requested' | 'partner_more_time' }
  | { kind: 'add_tag'; tag_names: string[] }
  | { kind: 'move_stage'; to_stage: string }
  | { kind: 'convert_lead'; pipeline: 'Treatment' | 'Telemedicine'; stage: string }
  | { kind: 'park_lead'; reason: string };

export interface Triage {
  source: 'rules' | 'ai';
  urgency: TriageUrgency;
  bucket: TriageBucket;
  intent?: TriageIntent;
  suggested_change?: SuggestedChange | null;
  draft_note?: string;
  // One-line status of where the case stands, for a glance on the list. May echo
  // message content, so it is gated to name-seers on the way out.
  summary?: string;
  model?: string;
  // The case's stage/status when this was triaged. The Confirm button compares
  // it to the live case and disables when they differ, so a stale suggestion
  // cannot silently regress state.
  stage_at_triage?: string | null;
}

/** The structural case context the triage reasons over. No patient identifiers. */
export interface TriageContext {
  matched: boolean;
  kind: 'lead' | 'deal' | null;
  step: CockpitStep | null;
  stage_or_status: string | null;
  pipeline: string | null;
  clock: { kind: ClockKind; sla_key: string } | null;
}

/** Rule-based triage. Pure, always runs, no gate. */
export function rulesTriage(ctx: TriageContext): Triage {
  const stage = ctx.stage_or_status;
  if (!ctx.matched) {
    // A number we do not recognise is talking to us: a new person, worth a look.
    return { source: 'rules', urgency: 'high', bucket: 'unmatched', stage_at_triage: stage };
  }
  if (ctx.step === 'parked') {
    return { source: 'rules', urgency: 'high', bucket: 'revival', stage_at_triage: stage };
  }
  if (ctx.clock && (ctx.clock.kind === 'due_now' || ctx.clock.kind === 'due_today')) {
    return { source: 'rules', urgency: 'urgent', bucket: 'sla_breach', stage_at_triage: stage };
  }
  return { source: 'rules', urgency: 'normal', bucket: 'reply', stage_at_triage: stage };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The real next options for this case, so the AI picks a valid target.
 *  Deals: legal move_stage targets (Lost excluded; it needs a loss reason and a
 *  double confirm, which a one-tap flow cannot carry). Leads: the status
 *  picklist plus the open convert stages per pipeline. Structural CRM
 *  vocabulary, not patient data. */
export function allowedOptions(ctx: TriageContext): {
  stage_targets: string[];
  convert_stages: Record<CockpitWritePipeline, string[]> | null;
} {
  if (ctx.kind === 'deal') {
    const p = ctx.pipeline;
    const targets =
      (p === 'Treatment' || p === 'Telemedicine') && ctx.stage_or_status
        ? allowedTargets(p, ctx.stage_or_status).filter((s) => s !== LOST_STAGE)
        : [];
    return { stage_targets: targets, convert_stages: null };
  }
  if (ctx.kind === 'lead') {
    return { stage_targets: [], convert_stages: OPEN_STAGES };
  }
  return { stage_targets: [], convert_stages: null };
}

const TAG = z.string().trim().min(1).max(30);

/** Per-context schema: a lead can never receive a deal kind, and any target
 *  outside the case's allowed set fails the parse (dropping to null). */
export function suggestedChangeSchema(ctx: TriageContext) {
  const { stage_targets, convert_stages } = allowedOptions(ctx);
  const variants: z.ZodTypeAny[] = [
    z.object({ kind: z.literal('add_tag'), tag_names: z.array(TAG).min(1).max(3) }),
  ];
  if (ctx.kind === 'deal') {
    variants.push(
      z.object({ kind: z.literal('set_follow_up'), date: z.string().regex(DATE_RE) }),
      z.object({
        kind: z.literal('stamp'),
        event: z.enum([
          'first_contact',
          'quotation_sent',
          'partner_quote_requested',
          'partner_more_time',
        ]),
      }),
    );
    if (stage_targets.length > 0) {
      variants.push(
        z.object({
          kind: z.literal('move_stage'),
          to_stage: z.enum(stage_targets as [string, ...string[]]),
        }),
      );
    }
  }
  if (ctx.kind === 'lead') {
    variants.push(
      z.object({ kind: z.literal('set_lead_follow_up'), date: z.string().regex(DATE_RE) }),
      z.object({
        kind: z.literal('set_lead_status'),
        status: z.enum([...LEAD_STATUSES] as [string, ...string[]]),
      }),
      z.object({ kind: z.literal('park_lead'), reason: z.string().trim().min(1).max(200) }),
      z
        .object({
          kind: z.literal('convert_lead'),
          pipeline: z.enum(['Treatment', 'Telemedicine']),
          stage: z.string(),
        })
        .refine((c) => (convert_stages?.[c.pipeline] ?? []).includes(c.stage), {
          message: 'stage must be an open stage of the chosen pipeline',
        }),
    );
  }
  return z.discriminatedUnion('kind', variants as never);
}

const URGENCY_VALUES: TriageUrgency[] = ['urgent', 'high', 'normal', 'low'];
const INTENT_VALUES: TriageIntent[] = [
  'question',
  'reschedule',
  'confirmation',
  'refusal',
  'documents',
  'payment',
  'greeting',
  'other',
];

const SYSTEM = [
  'You triage a patient WhatsApp conversation for a medical-travel case manager.',
  'You are given the patient\'s recent unanswered messages in order, oldest first,',
  'plus the case status only (no identity). Read them as ONE conversation and',
  'triage the combined meaning, not the last fragment alone.',
  'Reply with STRICT JSON, no prose, matching exactly:',
  '{"urgency":"urgent|high|normal|low","intent":"question|reschedule|confirmation|refusal|documents|payment|greeting|other",',
  '"suggested_change": null OR one of',
  'for a deal (case.kind is "deal"):',
  '{"kind":"set_follow_up","date":"YYYY-MM-DD"} , {"kind":"stamp","event":"first_contact|quotation_sent|partner_quote_requested|partner_more_time"},',
  '{"kind":"move_stage","to_stage":"<one of case.allowed.move_stage_targets>"},',
  'for a lead (case.kind is "lead"):',
  '{"kind":"set_lead_follow_up","date":"YYYY-MM-DD"} , {"kind":"set_lead_status","status":"<one of case.allowed.lead_statuses>"},',
  '{"kind":"convert_lead","pipeline":"Treatment|Telemedicine","stage":"<one of case.allowed.convert_stages for that pipeline>"},',
  '{"kind":"park_lead","reason":"<a short factual reason, <=200 chars>"},',
  'for either: {"kind":"add_tag","tag_names":["<1 to 3 short tags>"]},',
  '"draft_note":"<a short internal note the manager could log, <=500 chars>",',
  '"summary":"<one short line, at most 120 chars, plainly stating where this case now stands>"}',
  'Every to_stage, status, pipeline and stage value MUST be copied exactly from case.allowed in the input; if none fits, use null.',
  'For a lead, to advance the pipeline use convert_lead; never move_stage (move_stage is for deals only).',
  'Suggest a change only when the message clearly warrants it; otherwise null.',
  'Prefer the smallest change that fits. Suggest move_stage, convert_lead or park_lead only when the message states it plainly (for example a completed payment, an explicit refusal); when unsure, suggest a follow up or null.',
  'The input includes today as an ISO date. Compute any date from it and output a',
  'real calendar date (YYYY-MM-DD). NEVER output the literal text YYYY-MM-DD.',
].join('\n');

/** Refine a rules triage with Nova when the gate is on. De-identified input;
 *  keeps the rules bucket, adopts the AI urgency/intent/suggestion. Any failure
 *  (gate off, config missing, timeout, invalid JSON) returns the rules result. */
export async function aiRefine(
  base: Triage,
  ctx: TriageContext,
  bodies: string[],
): Promise<Triage> {
  if (!getEnv().TRIAGE_AI_ENABLED) return base;
  try {
    const opts = allowedOptions(ctx);
    // Cap the burst at 2000 chars total, dropping oldest first. The newest
    // message always stays (sliced if it alone exceeds the cap). The message
    // count cap is the caller's SQL LIMIT.
    const scrubbed = bodies.map((b) => scrub(b));
    const kept: string[] = [];
    let total = 0;
    for (let i = scrubbed.length - 1; i >= 0; i--) {
      let b = scrubbed[i];
      if (kept.length === 0 && b.length > 2000) b = b.slice(0, 2000);
      if (kept.length > 0 && total + b.length + 1 > 2000) break;
      kept.unshift(b);
      total += b.length + 1;
    }
    const burstBlob = kept.map((b, i) => `[${i + 1}] ${b}`).join('\n');
    const deidentified = {
      today: new Date().toISOString().slice(0, 10),
      messages: burstBlob,
      case: ctx.matched
        ? {
            kind: ctx.kind,
            step: ctx.step,
            stage_or_status: ctx.stage_or_status,
            pipeline: ctx.pipeline,
            clock: ctx.clock,
            allowed:
              ctx.kind === 'deal'
                ? { move_stage_targets: opts.stage_targets }
                : {
                    lead_statuses: LEAD_STATUSES,
                    convert_stages: opts.convert_stages,
                  },
          }
        : null,
    };
    const raw = await converseJson(SYSTEM, JSON.stringify(deidentified), {
      timeoutMs: 4000,
      purpose: 'triage',
    });
    // Lenient partial parse: keep whatever fields the model got right. A bad
    // suggested_change (e.g. a placeholder date) drops to null instead of
    // throwing away the whole AI read (urgency/intent/note).
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const urgency = URGENCY_VALUES.includes(obj.urgency as TriageUrgency)
      ? (obj.urgency as TriageUrgency)
      : base.urgency;
    const intent = INTENT_VALUES.includes(obj.intent as TriageIntent)
      ? (obj.intent as TriageIntent)
      : undefined;
    const draftNote =
      typeof obj.draft_note === 'string' ? obj.draft_note.slice(0, 500) : undefined;
    const summary =
      typeof obj.summary === 'string' ? obj.summary.slice(0, 120) : undefined;
    const sc = suggestedChangeSchema(ctx).safeParse(obj.suggested_change);
    const suggested = sc.success ? (sc.data as SuggestedChange) : null;

    return {
      source: 'ai',
      // Keep the rules bucket (routing), take the model's read of the rest.
      bucket: base.bucket,
      urgency,
      intent,
      suggested_change: suggested,
      draft_note: draftNote,
      summary,
      model: getEnv().BEDROCK_MODEL_ID,
      stage_at_triage: ctx.stage_or_status,
    };
  } catch (err) {
    console.warn(
      `triage AI fell back to rules: ${err instanceof Error ? err.message : 'error'}`,
    );
    return base;
  }
}

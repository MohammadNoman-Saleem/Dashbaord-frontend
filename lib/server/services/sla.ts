// The cockpit SLA engine: pure, framework free, unit testable. It owns the
// stage machine, the patient and provider SLA policy, the Bahrain business-day
// helpers, and the per-lead governing-clock computation. Nothing here imports
// any framework or touches Zoho directly; the service hands it plain records.
//
// Ported verbatim from the NestJS backend src/cockpit/sla.ts. It carried no
// @nestjs/* imports (it was already pure), so the only change in re-homing is
// the file location; every type, constant and function is unchanged.
//
// SLA model (status-based, 2026-06-25): every active clock is driven by ONE
// anchor, the time the record entered its CURRENT status/stage, so a case
// manager never marks an event by hand. For a deal that anchor is Zoho's
// Stage_Entry_Date; for a lead it is Last_Status_Change, stamped by a Zoho
// workflow on every Lead_Status change (and at creation). The per-step
// thresholds below are counted from that anchor. The only fallback is the
// record's created time, used when the status-change time is missing (older
// leads from before the field existed) and marked approx with a short reason.
// The earlier model read manual event stamps (welcome-message-sent,
// quotation-sent, last-patient-comm) that were rarely populated, so it leaned
// on proxies and marked nearly everything approx; those stamps are no longer
// read.
//
// SERVER ONLY by convention (it is consumed only by the cockpit service and its
// Node-runtime routes), though it imports nothing Node-specific.

// The six cockpit steps plus the parking lot. Order matters: the stepper and
// the queue sort rely on it.
export type CockpitStep =
  | 'first_contact'
  | 'info_collected'
  | 'partner_quotes'
  | 'quotation'
  | 'decision'
  | 'treatment'
  | 'parked';

export const COCKPIT_STEP_ORDER: CockpitStep[] = [
  'first_contact',
  'info_collected',
  'partner_quotes',
  'quotation',
  'decision',
  'treatment',
];

export const STEP_LABEL: Record<CockpitStep, string> = {
  first_contact: 'First contact',
  info_collected: 'Info collected',
  partner_quotes: 'Partner quotes',
  quotation: 'Quotation',
  decision: 'Decision',
  treatment: 'Treatment',
  parked: 'Parked',
};

// Plain-language SLA keys. Patient clocks plus the two provider clocks, kept
// as a closed union so the policy table, the queue rows and the case file all
// speak the same vocabulary.
export type SlaKey =
  | 'first_contact'
  | 'post_intro_followup'
  | 'reports_window'
  | 'post_quote_followup'
  | 'final_response'
  | 'not_qualified'
  | 'in_treatment'
  | 'provider_quote_followup'
  | 'provider_more_time_followup'
  // A manually set next-follow-up date governing the clock instead of the
  // status-based rule. Not a policy row: it is the case manager's own date.
  | 'follow_up';

export type ClockTone = 'warn' | 'info' | 'good' | 'mut';
export type ClockKind = 'due_now' | 'due_today' | 'soon' | 'on_track';
export type SlaCounting = 'business' | 'elapsed';
export type SlaParty = 'patient' | 'provider';

// One row of the policy table, authored here so /sla-policy serves it verbatim
// and the clocks read their thresholds from the same source.
export interface SlaPolicyRow {
  key: SlaKey;
  party: SlaParty;
  rule: string;
  threshold_label: string;
  counting: SlaCounting;
  anchor: string;
  proxy: string;
  applies_in: string;
}

// The patient and provider SLA policy, typed. threshold_hours carries the
// machine value the clocks count against; the *_label fields carry the words
// the cockpit displays. reports_window is a band (nothing due before day 7,
// overdue past day 10), so it carries both bounds.
export interface SlaThresholds {
  first_contact_hours: number;
  post_intro_followup_hours: number;
  reports_window_min_days: number;
  reports_window_max_days: number;
  post_quote_followup_hours: number;
  final_response_hours: number;
  not_qualified_hours: number;
  provider_quote_followup_days: number;
  provider_more_time_followup_days: number;
}

export interface SlaPolicy {
  thresholds: SlaThresholds;
  patient: SlaPolicyRow[];
  provider: SlaPolicyRow[];
}

export const SLA_POLICY: SlaPolicy = {
  thresholds: {
    first_contact_hours: 24,
    post_intro_followup_hours: 48,
    reports_window_min_days: 7,
    reports_window_max_days: 10,
    post_quote_followup_hours: 24,
    final_response_hours: 48,
    not_qualified_hours: 36,
    provider_quote_followup_days: 3,
    provider_more_time_followup_days: 7,
  },
  patient: [
    {
      key: 'first_contact',
      party: 'patient',
      rule: 'First contact',
      threshold_label: '24 hours',
      counting: 'business',
      anchor: 'Time the lead status last changed (a new lead: its creation time)',
      proxy: 'Lead created time, when no status-change time is recorded yet',
      applies_in: 'First contact',
    },
    {
      key: 'post_intro_followup',
      party: 'patient',
      rule: 'Follow up after the intro message',
      threshold_label: '48 hours',
      counting: 'elapsed',
      anchor: 'Time the lead entered the info-collected status',
      proxy: 'Created time, when no status-change time is recorded yet',
      applies_in: 'Info collected',
    },
    {
      key: 'reports_window',
      party: 'patient',
      rule: 'Waiting for medical reports',
      threshold_label: '7 to 10 days',
      counting: 'elapsed',
      anchor: 'Time the record entered its current stage or status',
      proxy: 'Created time, when no status-change time is recorded yet',
      applies_in:
        'Info collected. Nothing is due before day 7, overdue past day 10.',
    },
    {
      key: 'post_quote_followup',
      party: 'patient',
      rule: 'Follow up after the quotation',
      threshold_label: '24 hours',
      counting: 'elapsed',
      anchor: 'Time the deal entered the quote stage (stage entry date)',
      proxy: 'Created time, when no stage entry date is recorded',
      applies_in: 'Quotation',
    },
    {
      key: 'final_response',
      party: 'patient',
      rule: 'Final response after the last follow-up',
      threshold_label: '48 hours',
      counting: 'elapsed',
      anchor: 'Time the deal entered the decision stage (stage entry date)',
      proxy: 'Created time, when no stage entry date is recorded',
      applies_in: 'Decision',
    },
    {
      key: 'not_qualified',
      party: 'patient',
      rule: 'Park if quiet, or on refusal',
      threshold_label: '36 hours',
      counting: 'business',
      anchor: 'Reason not qualified set means a refusal now',
      proxy: 'Created time for the 36 hour timer',
      applies_in: 'Any active step. Drives the park if quiet suggestion.',
    },
  ],
  provider: [
    {
      key: 'provider_quote_followup',
      party: 'provider',
      rule: 'Follow up after requesting the partner quote',
      threshold_label: '3 days',
      counting: 'elapsed',
      anchor: 'Time the lead reached Deal Ready or Quote Shared (status change)',
      proxy: 'Created time, when no status-change time is recorded yet',
      applies_in: 'Partner quotes',
    },
    {
      key: 'provider_more_time_followup',
      party: 'provider',
      rule: 'Follow up if the partner needs more time',
      threshold_label: '1 week',
      counting: 'elapsed',
      anchor: 'Not tracked in Zoho yet',
      proxy: 'Not tracked in Zoho yet',
      applies_in: 'Partner quotes',
    },
  ],
};

// ---------------------------------------------------------------------------
// Business-day helpers. Working week is Sunday to Thursday, Asia/Bahrain;
// Friday and Saturday are non-working. JavaScript getUTCDay: 0 Sun .. 6 Sat.
// Bahrain is UTC+3 with no daylight saving, so the day of week is computed by
// shifting the instant by three hours and reading the UTC day. Counting runs
// hour by hour, which is exact enough for the SLA windows and keeps the helper
// trivially testable. addBusinessHours and businessHoursElapsed are the only
// two helpers the spec asks for.
// ---------------------------------------------------------------------------

const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** True when the given instant lands on Fri or Sat in Bahrain local time. */
export function isBahrainWeekend(at: Date): boolean {
  const day = new Date(at.getTime() + BAHRAIN_OFFSET_MS).getUTCDay();
  return day === 5 || day === 6; // 5 Fri, 6 Sat
}

/** Add a number of business hours to a start instant, skipping Fri and Sat in
 *  Bahrain. Walks one hour at a time; only working hours are counted down. */
export function addBusinessHours(start: Date, hours: number): Date {
  let remaining = Math.max(0, hours);
  let cursor = start.getTime();
  // If the deadline is zero hours away, it is simply the start instant.
  while (remaining > 0) {
    cursor += HOUR_MS;
    if (!isBahrainWeekend(new Date(cursor))) remaining -= 1;
  }
  return new Date(cursor);
}

/** Count the business hours elapsed between start and now, skipping Fri and
 *  Sat in Bahrain. The mirror of addBusinessHours. Returns 0 when now is at
 *  or before start. */
export function businessHoursElapsed(start: Date, now: Date): number {
  if (now <= start) return 0;
  let counted = 0;
  let cursor = start.getTime();
  const end = now.getTime();
  while (cursor + HOUR_MS <= end) {
    cursor += HOUR_MS;
    if (!isBahrainWeekend(new Date(cursor))) counted += 1;
  }
  return counted;
}

// ---------------------------------------------------------------------------
// Stage machine. Derives the cockpit step from the Lead_Status (pre conversion)
// and the Deal Stage + Pipeline (post conversion). The mapping is PIPELINE-AWARE
// because the same stage string lands in different steps per pipeline (e.g.
// "Consultation Scheduled" and "TeleConsult Completed" are Decision on Treatment
// but Treatment on Telemedicine).
//
// Mapping CONFIRMED with Mohammad (2026-06-25):
//   Leads  -> first_contact:  New, Intro Call Scheduled, Waiting Response
//             info_collected: Intro Call Done, Doctor Consultation Scheduled/Done
//             partner_quotes: Deal Ready, Quote Shared
//             parked:         Not Qualified, Junk Lead, Lost Lead
//   Treatment deal -> quotation: New Deal
//             decision:  Quote Proposed, Consultation Scheduled, Consult Payment,
//                        TeleConsult Completed, Treatment Quote
//             treatment: Treatment Payment, Treatment Scheduled, Treatment in
//                        Progress, Treatment Completed  (treatment begins at payment)
//   Telemedicine deal -> quotation: New Deal; decision: Quote Proposed;
//             treatment: Payment Done, Consultation Scheduled, TeleConsult Completed
//   Either pipeline -> parked: Lost / Inactive
// Live stage strings are the verified ones in PIPELINE_STAGES (crm-read.ts).
// ---------------------------------------------------------------------------

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const PARKED_LEAD_STATUSES = new Set([
  'not qualified',
  'junk lead',
  'lost lead',
]);
const PARKED_DEAL_STAGES = new Set([
  'lost / inactive',
  'lost',
  'inactive',
  'closed lost',
]);

// Lead statuses (pre-conversion) grouped to cockpit steps.
const FIRST_CONTACT_LEAD = new Set([
  'new',
  'intro call scheduled',
  'waiting response',
]);
const INFO_COLLECTED_LEAD = new Set([
  'intro call done',
  'doctor consultation scheduled',
  'doctor consultation done',
]);
const PARTNER_QUOTES_LEAD = new Set(['deal ready', 'quote shared']);

// Treatment-pipeline deal stages grouped to cockpit steps.
const TREATMENT_DECISION = new Set([
  'quote proposed',
  'consultation scheduled',
  'consult payment',
  'teleconsult completed',
  'treatment quote',
]);
const TREATMENT_TREATMENT = new Set([
  'treatment payment',
  'treatment scheduled',
  'treatment in progress',
  'treatment completed',
]);

// Telemedicine-pipeline deal stages grouped to cockpit steps. Treatment begins
// at Payment Done; the tele-consult is the telemedicine "treatment".
const TELEMED_DECISION = new Set(['quote proposed']);
const TELEMED_TREATMENT = new Set([
  'payment done',
  'consultation scheduled',
  'teleconsult completed',
]);

export interface StageInputs {
  /** Lead_Status on the originating lead, or null when starting from a deal. */
  leadStatus: string | null;
  /** Deal Stage on the linked deal, or null when lead only. */
  dealStage: string | null;
  /** Deal Pipeline (Treatment | Telemedicine), or null when lead only. The
   *  stage->step map differs per pipeline, so this is required for a deal. */
  pipeline: string | null;
  /** Whether a Deal exists at all. */
  hasDeal: boolean;
}

/** Resolve the current cockpit step. The deal stage wins when present (a
 *  converted lead lives in the deal); the lead status drives pre-conversion
 *  rows. Parked is detected first from either side. Deal stages are read against
 *  the pipeline-specific map. An unrecognized deal stage reads as Quotation (a
 *  converted deal is at least at the first deal step), never guessed forward. */
export function stepOf(inputs: StageInputs): CockpitStep {
  const lead = norm(inputs.leadStatus);
  const stage = norm(inputs.dealStage);
  const pipeline = norm(inputs.pipeline);

  if (PARKED_LEAD_STATUSES.has(lead) || PARKED_DEAL_STAGES.has(stage)) {
    return 'parked';
  }

  if (inputs.hasDeal && stage) {
    if (pipeline === 'telemedicine') {
      if (TELEMED_TREATMENT.has(stage)) return 'treatment';
      if (TELEMED_DECISION.has(stage)) return 'decision';
      return 'quotation';
    }
    // Treatment (and any other patient pipeline) uses the Treatment map.
    if (TREATMENT_TREATMENT.has(stage)) return 'treatment';
    if (TREATMENT_DECISION.has(stage)) return 'decision';
    return 'quotation';
  }

  // Pre-conversion: drive off the lead status.
  if (PARTNER_QUOTES_LEAD.has(lead)) return 'partner_quotes';
  if (INFO_COLLECTED_LEAD.has(lead)) return 'info_collected';
  if (FIRST_CONTACT_LEAD.has(lead)) return 'first_contact';
  // Blank or unrecognized status on an unconverted lead reads as first contact:
  // a new, untouched lead still owes the first call.
  return 'first_contact';
}

/** The stepper states for the case file: every step before the current is
 *  done, the current is cur, the rest are todo. Parked rows return all todo
 *  with no current, since a parked lead has left the active path. */
export function stepperFor(
  step: CockpitStep,
): Array<{ key: CockpitStep; label: string; state: 'done' | 'cur' | 'todo' }> {
  const currentIndex =
    step === 'parked' ? -1 : COCKPIT_STEP_ORDER.indexOf(step);
  return COCKPIT_STEP_ORDER.map((key, index) => {
    let state: 'done' | 'cur' | 'todo' = 'todo';
    if (currentIndex >= 0) {
      if (index < currentIndex) state = 'done';
      else if (index === currentIndex) state = 'cur';
    }
    return { key, label: STEP_LABEL[key], state };
  });
}

// ---------------------------------------------------------------------------
// Governing-clock computation. For an active lead, compute the single clock
// that governs its current step, anchored on the real field when populated,
// else the proxy with approx true, else null with an authored reason.
// ---------------------------------------------------------------------------

export interface ClockResult {
  sla_key: SlaKey;
  /** Plain due label, e.g. "Due now", "In 18h", "Tomorrow", "Day 4 of 10". */
  due_label: string;
  tone: ClockTone;
  kind: ClockKind;
  /** True when the clock used a proxy anchor, not the precise event field. */
  approx: boolean;
  /** Authored reason, set when the clock is null or when approx needs words. */
  reason: string | null;
}

// The record shape the engine reads. The service maps a Lead or Deal onto it.
export interface ClockInputs {
  step: CockpitStep;
  /** When the record entered its CURRENT status/stage: the deal's
   *  Stage_Entry_Date or the lead's Last_Status_Change. The single anchor every
   *  active clock now runs from (no manual event stamps). */
  statusChange: string | null;
  /** Created time, the only fallback when statusChange is absent (older records
   *  from before the status-change field was populated). */
  createdTime: string | null;
  /** A manually set next-follow-up date (Next_Follow_up, a calendar date
   *  YYYY-MM-DD), or null. When present on an ACTIVE case it OVERRIDES the
   *  status clock: it is the case manager's stated next-action time, so it
   *  becomes the one "when to act next" indicator (and flows through the queue
   *  sort and the due-now / due-today tiles). Parked cases ignore it. */
  nextFollowUp: string | null;
  /** The record's Modified_Time (ISO), used ONLY as the time of day for a
   *  follow-up date, since Next_Follow_up carries no time. It is the moment the
   *  follow-up was saved; read in Bahrain. Null falls back to 09:00 Bahrain. */
  modifiedTime: string | null;
}

function parse(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY_MS = 24 * HOUR_MS;

/** Round a positive hour count to a friendly "in Nh" / "in Nd" label. */
function aheadLabel(ms: number): string {
  const hours = Math.ceil(ms / HOUR_MS);
  if (hours <= 1) return 'Within the hour';
  if (hours < 24) return `In ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Tomorrow';
  return `In ${days}d`;
}

// Classify an elapsed-vs-threshold position into tone and kind. Past the
// deadline is due_now; within the final business slot (under 8h) is due_today;
// otherwise soon or on_track.
function classify(
  deadline: Date,
  now: Date,
): {
  kind: ClockKind;
  tone: ClockTone;
  due_label: string;
} {
  const remaining = deadline.getTime() - now.getTime();
  if (remaining <= 0) {
    return { kind: 'due_now', tone: 'warn', due_label: 'Due now' };
  }
  if (remaining <= 8 * HOUR_MS) {
    return {
      kind: 'due_today',
      tone: 'info',
      due_label: aheadLabel(remaining),
    };
  }
  if (remaining <= DAY_MS) {
    return { kind: 'soon', tone: 'info', due_label: aheadLabel(remaining) };
  }
  return { kind: 'on_track', tone: 'good', due_label: aheadLabel(remaining) };
}

// Combine a follow-up calendar date (YYYY-MM-DD) with the Bahrain-local time of
// day the follow-up was saved (the record's Modified_Time), into a single
// instant. Next_Follow_up carries no time, so the modified time supplies the
// hour, which lets a follow-up under 24 hours away be shown in hours. Bahrain is
// UTC+3 with no daylight saving. Returns null on an unparseable date. When no
// modified time is available the follow-up is anchored at 09:00 Bahrain (the
// start of the working day) rather than midnight.
function followUpInstant(dateStr: string, modifiedIso: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  let hour = 9;
  let minute = 0;
  let second = 0;
  const mod = modifiedIso ? new Date(modifiedIso) : null;
  if (mod && !Number.isNaN(mod.getTime())) {
    const bahrain = new Date(mod.getTime() + BAHRAIN_OFFSET_MS);
    hour = bahrain.getUTCHours();
    minute = bahrain.getUTCMinutes();
    second = bahrain.getUTCSeconds();
  }
  // Bahrain-local (year-month-day hour:minute:second) to a UTC instant: subtract
  // the +3 offset. Date.UTC normalizes a negative hour by rolling the day back.
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
}

// The follow-up date rendered as a short "Jul 12" (month and day in Bahrain),
// matching the cockpit date format. Used for a follow-up more than a day out.
function followUpDateLabel(instant: Date): string {
  return instant.toLocaleDateString('en-US', {
    timeZone: 'Asia/Bahrain',
    month: 'short',
    day: 'numeric',
  });
}

// The clock when a manual follow-up governs. Kind and tone come from the shared
// classify() (so it sorts and tiles exactly like a status clock), and only the
// label is tailored: "Due now" once past, hours when under a day out, else the
// short date. approx is false; this is an exact date the case manager set.
function followUpClock(instant: Date, now: Date): ClockResult {
  const c = classify(instant, now);
  const remaining = instant.getTime() - now.getTime();
  let due_label: string;
  if (remaining <= 0) {
    due_label = 'Due now';
  } else if (remaining < DAY_MS) {
    // Under 24 hours: reuse classify's hour label ("Within the hour" / "In Nh").
    due_label = c.due_label;
  } else {
    due_label = followUpDateLabel(instant);
  }
  return {
    sla_key: 'follow_up',
    due_label,
    tone: c.tone,
    kind: c.kind,
    approx: false,
    reason: null,
  };
}

/** Compute the governing clock for a row from its step and the time it entered
 *  its current status/stage. Every active step runs from one anchor: the
 *  statusChange time, with the created time as the only fallback (marked approx
 *  when used). No manual event stamps are read.
 *
 *  Exception: a manually set next-follow-up date OVERRIDES the status clock for
 *  any active (non-parked) case. It is the case manager's stated next-action
 *  time, so it becomes the single "when to act next" indicator and drives the
 *  queue sort and the due-now / due-today tiles the same way a status clock
 *  would. Parked cases keep their parked state. */
export function governingClock(inputs: ClockInputs, now: Date): ClockResult {
  if (inputs.step !== 'parked' && inputs.nextFollowUp) {
    const instant = followUpInstant(inputs.nextFollowUp, inputs.modifiedTime);
    if (instant) return followUpClock(instant, now);
  }

  const t = SLA_POLICY.thresholds;
  const precise = parse(inputs.statusChange);
  const created = parse(inputs.createdTime);
  const anchor = precise ?? created;
  const approx = !precise && !!created;
  const fallbackReason =
    'No status-change time recorded yet, so the clock counts from when the record was created.';

  switch (inputs.step) {
    case 'first_contact': {
      // 24 business hours from when the lead entered its current status (a brand
      // new lead: from creation, since On-Create stamps Last_Status_Change).
      if (!anchor) {
        return nullClock(
          'first_contact',
          'No status-change or created time on this lead to start the first-contact clock.',
        );
      }
      const deadline = addBusinessHours(anchor, t.first_contact_hours);
      const c = classify(deadline, now);
      return {
        sla_key: 'first_contact',
        ...c,
        approx,
        reason: approx ? fallbackReason : null,
      };
    }

    case 'info_collected': {
      // Reports window: nothing due before day 7, overdue past day 10, counted
      // from when the record entered its current status/stage.
      if (!anchor) {
        return nullClock(
          'reports_window',
          'No status-change or created time to anchor the reports window.',
        );
      }
      const days = (now.getTime() - anchor.getTime()) / DAY_MS;
      const reason = approx ? fallbackReason : null;
      if (days < t.reports_window_min_days) {
        return {
          sla_key: 'reports_window',
          due_label: `Day ${Math.floor(days)} of ${t.reports_window_max_days}`,
          tone: 'good',
          kind: 'on_track',
          approx,
          reason,
        };
      }
      if (days <= t.reports_window_max_days) {
        return {
          sla_key: 'reports_window',
          due_label: `Day ${Math.floor(days)} of ${t.reports_window_max_days}`,
          tone: 'info',
          kind: 'due_today',
          approx,
          reason,
        };
      }
      return {
        sla_key: 'reports_window',
        due_label: 'Reports overdue',
        tone: 'warn',
        kind: 'due_now',
        approx,
        reason,
      };
    }

    case 'partner_quotes': {
      // 3-day partner follow-up, counted from when the lead reached Deal Ready /
      // Quote Shared (its Last_Status_Change).
      if (!anchor) {
        return nullClock(
          'provider_quote_followup',
          'No status-change or created time to start the partner follow-up clock.',
        );
      }
      const deadline = new Date(
        anchor.getTime() + t.provider_quote_followup_days * DAY_MS,
      );
      const remaining = deadline.getTime() - now.getTime();
      const c = classify(deadline, now);
      const dayN = Math.min(
        t.provider_quote_followup_days,
        Math.max(1, Math.ceil((now.getTime() - anchor.getTime()) / DAY_MS)),
      );
      return {
        sla_key: 'provider_quote_followup',
        due_label:
          remaining > 0
            ? `Day ${dayN} of ${t.provider_quote_followup_days}`
            : 'Partner chase due',
        tone: c.tone,
        kind: c.kind,
        approx,
        reason: approx ? fallbackReason : null,
      };
    }

    case 'quotation': {
      // 24h follow-up, counted from when the deal entered the quote stage
      // (New Deal -> Stage_Entry_Date).
      if (!anchor) {
        return nullClock(
          'post_quote_followup',
          'No status-change or created time to start the quotation follow-up clock.',
        );
      }
      const deadline = new Date(
        anchor.getTime() + t.post_quote_followup_hours * HOUR_MS,
      );
      const c = classify(deadline, now);
      return {
        sla_key: 'post_quote_followup',
        ...c,
        approx,
        reason: approx ? fallbackReason : null,
      };
    }

    case 'decision': {
      // 48h final response, counted from when the deal entered the decision stage
      // (Quote Proposed -> Stage_Entry_Date).
      if (!anchor) {
        return nullClock(
          'final_response',
          'No status-change or created time to start the final-response clock.',
        );
      }
      const deadline = new Date(
        anchor.getTime() + t.final_response_hours * HOUR_MS,
      );
      const c = classify(deadline, now);
      return {
        sla_key: 'final_response',
        ...c,
        approx,
        reason: approx ? fallbackReason : null,
      };
    }

    case 'treatment': {
      // The active SLA clocks stop at the decision; treatment is in delivery.
      // Honest on-track with no fabricated due time, and an in_treatment key so
      // the case file does not show a final-response rule that no longer applies.
      return {
        sla_key: 'in_treatment',
        due_label: 'In treatment',
        tone: 'good',
        kind: 'on_track',
        approx: false,
        reason: null,
      };
    }

    case 'parked':
    default: {
      return {
        sla_key: 'not_qualified',
        due_label: 'Parked',
        tone: 'mut',
        kind: 'on_track',
        approx: false,
        reason: null,
      };
    }
  }
}

function nullClock(sla_key: SlaKey, reason: string): ClockResult {
  return {
    sla_key,
    due_label: 'Not tracked in Zoho yet',
    tone: 'mut',
    kind: 'on_track',
    approx: false,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Provider clocks, exposed for the case file. Both are null in v1: there is no
// Zoho field behind either. The Partner quotes governing clock above is the
// one approximate provider clock the spec sanctions, and it carries approx.
// ---------------------------------------------------------------------------

export function providerClocks(): Array<{
  sla_key: SlaKey;
  label: string;
  detail: string;
  state: 'null';
}> {
  return [
    {
      sla_key: 'provider_quote_followup',
      label: 'Follow up after requesting the partner quote',
      detail: 'Not tracked in Zoho yet',
      state: 'null',
    },
    {
      sla_key: 'provider_more_time_followup',
      label: 'Follow up if the partner needs more time',
      detail: 'Not tracked in Zoho yet',
      state: 'null',
    },
  ];
}

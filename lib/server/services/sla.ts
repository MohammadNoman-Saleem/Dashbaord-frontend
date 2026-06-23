// The cockpit SLA engine: pure, framework free, unit testable. It owns the
// stage machine, the patient and provider SLA policy, the Bahrain business-day
// helpers, and the per-lead governing-clock computation. Nothing here imports
// any framework or touches Zoho directly; the service hands it plain records.
//
// Ported verbatim from the NestJS backend src/cockpit/sla.ts. It carried no
// @nestjs/* imports (it was already pure), so the only change in re-homing is
// the file location; every type, constant and function is unchanged.
//
// Honesty rule (cockpit-sla-spec.md): every clock is driven by the best
// available Zoho timestamp. The precise event field wins when populated; when
// it is empty the listed proxy is used and the clock is marked approx with a
// short authored reason. When there is no backing field at all (the provider
// clocks, and the reports-requested signal) the clock is null with the reason
// "Not tracked in Zoho yet". A fabricated due time is never shown as exact.
//
// Field discovery (live, Jun 14 2026): on Leads only Intro_Call_Date_Time,
// Reason_Not_Qualified, Last_Activity_Time and Created_Time exist of the SLA
// set, and Intro_Call_Date_Time is ~0% populated, so the first_contact stop
// always falls to the proxy. On Deals the event fields exist
// (Stage_Entry_Date, Last_Patient_Comm_Date, Welcome_Message_Sent_Date) but
// live population of the precise comm fields is sparse, so most deal clocks
// resolve to their proxy and mark approx. This is the spec's honesty rule in
// action, not a gap in the engine.
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
  | 'provider_quote_followup'
  | 'provider_more_time_followup';

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
      anchor: 'Intro call date and time, when set',
      proxy: 'Lead created time, for a lead not yet contacted',
      applies_in: 'First contact',
    },
    {
      key: 'post_intro_followup',
      party: 'patient',
      rule: 'Follow up after the intro message',
      threshold_label: '48 hours',
      counting: 'elapsed',
      anchor: 'Welcome message sent date, when set',
      proxy: 'Last activity time',
      applies_in: 'Info collected',
    },
    {
      key: 'reports_window',
      party: 'patient',
      rule: 'Waiting for medical reports',
      threshold_label: '7 to 10 days',
      counting: 'elapsed',
      anchor: 'Stage entry date, when set',
      proxy: 'Last activity time',
      applies_in:
        'Info collected and Partner quotes. Nothing is due before day 7, overdue past day 10.',
    },
    {
      key: 'post_quote_followup',
      party: 'patient',
      rule: 'Follow up after the quotation',
      threshold_label: '24 hours',
      counting: 'elapsed',
      anchor: 'No quotation-sent field exists in Zoho yet',
      proxy: 'Stage entry date into the quote stage, else last activity time',
      applies_in: 'Quotation',
    },
    {
      key: 'final_response',
      party: 'patient',
      rule: 'Final response after the last follow-up',
      threshold_label: '48 hours',
      counting: 'elapsed',
      anchor: 'Last patient comm date, when set',
      proxy: 'Last activity time',
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
      anchor: 'Not tracked in Zoho yet',
      proxy:
        'When a deal is in the Partner quotes step, an approximate clock off stage entry date, clearly marked approx',
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
// Stage machine. Derives the cockpit step from the Lead_Status (pre
// conversion) and the Deal Stage (post conversion, Treatment pipeline).
//
// Mapping is PROPOSED in the spec; flagged for the lead to confirm in the PR.
// It is written against both the spec vocabulary and the live Treatment stage
// strings verified Jun 14 2026 (New Deal, Quote Proposed, Consultation
// Scheduled, Consult Payment, TeleConsult Completed, Treatment Quote,
// Treatment Payment, Treatment Scheduled, Treatment in Progress, Treatment
// Completed, Lost / Inactive), so it resolves whichever wording the record
// carries. The Partner quotes step is the weakest link: there is no clean
// partner-request field, so a Treatment deal sitting between Info collected
// and Quotation is treated as Partner quotes.
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

const FIRST_CONTACT_LEAD = new Set(['new', 'intro call scheduled']);
const INFO_COLLECTED_LEAD = new Set([
  'intro call done',
  'doctor consultation scheduled',
  'doctor consultation done',
  'contacted',
  'pre-qualified',
]);
const QUOTATION_LEAD = new Set(['quote shared']);
const DECISION_LEAD = new Set(['waiting response']);

// Deal stages grouped to cockpit steps. Spec names plus the live strings.
const INFO_COLLECTED_DEAL = new Set([
  'new deal',
  'consultation scheduled',
  'consultation completed',
  'consult payment',
  'teleconsult completed',
]);
const QUOTATION_DEAL = new Set(['quote proposed', 'treatment quote']);
const DECISION_DEAL = new Set([
  'deposit payment',
  'treatment payment',
  'payment done',
]);
const TREATMENT_DEAL = new Set([
  'treatment scheduled',
  'treatment in progress',
  'treatment completed',
]);

export interface StageInputs {
  /** Lead_Status on the originating lead, or null when starting from a deal. */
  leadStatus: string | null;
  /** Deal Stage on the linked Treatment deal, or null when lead only. */
  dealStage: string | null;
  /** Whether a Deal exists at all (drives the Partner quotes inference). */
  hasDeal: boolean;
}

/** Resolve the current cockpit step. The deal stage wins when present, because
 *  a converted lead lives in the deal; the lead status drives pre-conversion
 *  rows. Parked is detected first from either side. */
export function stepOf(inputs: StageInputs): CockpitStep {
  const lead = norm(inputs.leadStatus);
  const stage = norm(inputs.dealStage);

  if (PARKED_LEAD_STATUSES.has(lead) || PARKED_DEAL_STAGES.has(stage)) {
    return 'parked';
  }

  if (inputs.hasDeal && stage) {
    if (TREATMENT_DEAL.has(stage)) return 'treatment';
    if (DECISION_DEAL.has(stage)) return 'decision';
    if (QUOTATION_DEAL.has(stage)) return 'quotation';
    // A live Treatment deal that is past Info collected but not yet at the
    // Quotation stage is the Partner quotes window. This is the weakest
    // mapping (no partner-request field exists), flagged in the PR.
    if (INFO_COLLECTED_DEAL.has(stage)) return 'partner_quotes';
    // An unknown deal stage falls back to Info collected rather than guessing
    // a later step; surfaced honestly, never silently advanced.
    return 'info_collected';
  }

  // Pre-conversion: drive off the lead status.
  if (QUOTATION_LEAD.has(lead)) return 'quotation';
  if (DECISION_LEAD.has(lead)) return 'decision';
  if (INFO_COLLECTED_LEAD.has(lead)) return 'info_collected';
  if (FIRST_CONTACT_LEAD.has(lead)) return 'first_contact';
  // Blank or unrecognized status on an unconverted lead reads as first
  // contact: a new, untouched lead still owes the first call.
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
  /** Lead created time, the universal fallback anchor. */
  createdTime: string | null;
  lastActivityTime: string | null;
  introCallDateTime: string | null;
  welcomeMessageSentDate: string | null;
  stageEntryDate: string | null;
  lastPatientCommDate: string | null;
  reasonNotQualified: string | null;
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

/** Compute the governing clock for a row, given its step and timestamps. */
export function governingClock(inputs: ClockInputs, now: Date): ClockResult {
  const t = SLA_POLICY.thresholds;
  const created = parse(inputs.createdTime);
  const lastActivity = parse(inputs.lastActivityTime);

  switch (inputs.step) {
    case 'first_contact': {
      // Anchor: Intro_Call_Date_Time when set (the stop). Live population is
      // ~0%, so in practice this is a not-yet-contacted lead counting 24
      // business hours from creation, marked approx.
      const stop = parse(inputs.introCallDateTime);
      if (stop) {
        return {
          sla_key: 'first_contact',
          due_label: 'Contacted',
          tone: 'good',
          kind: 'on_track',
          approx: false,
          reason: null,
        };
      }
      if (!created) {
        return nullClock(
          'first_contact',
          'No created time on this lead to start the first-contact clock.',
        );
      }
      const deadline = addBusinessHours(created, t.first_contact_hours);
      const c = classify(deadline, now);
      return {
        sla_key: 'first_contact',
        ...c,
        approx: true,
        reason:
          'Intro call date is not recorded, so the 24 business hour clock counts from when the lead arrived.',
      };
    }

    case 'info_collected': {
      // Reports window governs once info collection is under way: nothing due
      // before day 7, overdue past day 10. Anchor Stage_Entry_Date, else the
      // proxy Last_Activity_Time. The post-intro 48h follow-up is the earlier
      // sub-step; the reports band is the governing clock for the step.
      const anchorPrecise = parse(inputs.stageEntryDate);
      const anchor = anchorPrecise ?? lastActivity ?? created;
      if (!anchor) {
        return nullClock(
          'reports_window',
          'No stage entry or activity time to anchor the reports window.',
        );
      }
      const days = (now.getTime() - anchor.getTime()) / DAY_MS;
      const approx = !anchorPrecise;
      const reason = approx
        ? 'No stage entry date, so the reports window counts from the last activity instead.'
        : null;
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
      // The governing clock is a provider clock: follow up 3 days after the
      // partner quote request. There is NO Zoho field for the request, so the
      // spec allows an approximate clock off Stage_Entry_Date when the deal
      // sits in this step, clearly marked approx. With no stage entry date the
      // clock is null with the authored reason.
      const anchor = parse(inputs.stageEntryDate);
      if (!anchor) {
        return nullClock(
          'provider_quote_followup',
          'Not tracked in Zoho yet. There is no partner quote request field to start the 3 day clock.',
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
        approx: true,
        reason:
          'No partner quote request field exists, so the 3 day clock is approximated from when the deal entered this stage.',
      };
    }

    case 'quotation': {
      // 24h follow-up after the quotation. No quotation-sent field exists, so
      // the anchor is the stage entry into the quote stage, else last
      // activity. Always approx.
      const anchorPrecise = parse(inputs.stageEntryDate);
      const anchor = anchorPrecise ?? lastActivity ?? created;
      if (!anchor) {
        return nullClock(
          'post_quote_followup',
          'No stage entry or activity time to start the quotation follow-up clock.',
        );
      }
      const deadline = new Date(
        anchor.getTime() + t.post_quote_followup_hours * HOUR_MS,
      );
      const c = classify(deadline, now);
      return {
        sla_key: 'post_quote_followup',
        ...c,
        approx: true,
        reason:
          'No quotation-sent field exists in Zoho, so the 24 hour clock counts from when the deal entered the quote stage.',
      };
    }

    case 'decision': {
      // 48h final response after the last follow-up. Anchor Last_Patient_Comm
      // _Date when set, else the proxy Last_Activity_Time.
      const precise = parse(inputs.lastPatientCommDate);
      const anchor = precise ?? lastActivity ?? created;
      if (!anchor) {
        return nullClock(
          'final_response',
          'No last patient comm or activity time to start the final response clock.',
        );
      }
      const deadline = new Date(
        anchor.getTime() + t.final_response_hours * HOUR_MS,
      );
      const c = classify(deadline, now);
      return {
        sla_key: 'final_response',
        ...c,
        approx: !precise,
        reason: precise
          ? null
          : 'No last patient comm date, so the 48 hour clock counts from the last activity instead.',
      };
    }

    case 'treatment': {
      // The active SLA clocks stop at the decision; treatment is in delivery.
      // Honest on-track with no fabricated due time.
      return {
        sla_key: 'final_response',
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

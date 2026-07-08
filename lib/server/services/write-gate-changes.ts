// The proposed-change vocabulary the write gate understands, plus the pure
// helpers that turn a change into a plain-language line and a stable
// idempotency key. Ported VERBATIM from the NestJS backend
// src/write-gate/changes.ts (pure: no Zoho, no IO, no DI), with the field
// allowlist (COCKPIT_DEAL_FIELDS) inlined here since the self-contained app
// keeps the gate's field config alongside the gate.
//
// There is deliberately no delete kind: the gate cannot express a Zoho delete.
//
// SERVER ONLY by convention; node:crypto for the deterministic idempotency key.
import { createHash } from 'node:crypto';

// Confirmed Zoho Deals field api_names for the cockpit write gate. From the
// backend src/write-gate/cockpit-fields.config.ts (Zoho kept every suggested
// api_name exactly). Centralized here so the gate reads field names from config
// and never hardcodes or invents one.
export const COCKPIT_DEAL_FIELDS = {
  // Existing fields (verified present).
  next_follow_up: 'Next_Follow_up', // date
  welcome_message_sent: 'Welcome_Message_Sent_Date', // date
  last_patient_comm: 'Last_Patient_Comm_Date', // datetime
  // Created 2026-06-17 (datetime), anchoring the SLA stamps.
  quotation_sent: 'Quotation_Sent_Date',
  partner_quote_requested: 'Partner_Quote_Requested_Date',
  partner_more_time: 'Partner_More_Time_Date',
  // Created 2026-06-17 (currency, BHD).
  provider_cost_price: 'Provider_Cost_Price', // internal-only (FLS restricted)
  patient_budget: 'Patient_Budget',
  // Existing Zoho date fields on the Deals layout.
  treatment_start_date: 'Treatment_Start_Date',
  treatment_end_date: 'Treatment_End_Date',
} as const;

export type StampEvent =
  | 'first_contact'
  | 'quotation_sent'
  | 'partner_quote_requested'
  | 'partner_more_time';

export type EditableField =
  | 'patient_budget'
  | 'treatment_start'
  | 'treatment_end';

export type ProposedChange =
  | { kind: 'set_follow_up'; date: string } // date as YYYY-MM-DD
  | { kind: 'move_stage'; to_stage: string; reason_for_loss?: string | null }
  | { kind: 'stamp'; event: StampEvent }
  | { kind: 'send_first_contact' }
  | { kind: 'edit_field'; field: EditableField; value: string }
  // Lead change kinds (resourceType 'lead'): convert an unconverted lead into a
  // deal at a chosen open stage, set the raw Lead_Status, or park the lead as
  // Not Qualified with a reason. Deal kinds above stay deal-only.
  | {
      kind: 'convert_lead';
      pipeline: 'Treatment' | 'Telemedicine';
      stage: string;
    }
  | { kind: 'set_lead_status'; status: string }
  | { kind: 'set_lead_follow_up'; date: string } // date as YYYY-MM-DD
  | { kind: 'park_lead'; reason: string }
  // add_tag applies to BOTH deals and leads (a tag is case metadata, not
  // module-specific). The write service detects the module from the id, so there
  // is no separate lead kind. tag_names is a non-empty list of tag names.
  | { kind: 'add_tag'; tag_names: string[] }
  // remove_tag also applies to both modules; one tag per call (each chip's
  // remove control sends the one tag it represents).
  | { kind: 'remove_tag'; tag_name: string };

export const ACTIVE_CHANGE_KINDS: ReadonlyArray<ProposedChange['kind']> = [
  'set_follow_up',
  'move_stage',
  'stamp',
  'send_first_contact',
  'edit_field',
  'convert_lead',
  'set_lead_status',
  'set_lead_follow_up',
  'park_lead',
  'add_tag',
  'remove_tag',
];

// The Lead_Status values (Leads module) offered in the cockpit, matching the
// live Zoho leads board (verified 2026-07-08), in board order. In Zoho these
// display labels sit on top of legacy stored values (for example New over
// "Attempted to Contact"), so the strings here are the display labels live
// records hold. Excluded: Doctor Consultation Scheduled/Done and Quote Shared
// (unused phantom labels, zero leads) and Service not available (not on the
// board; the read side still classifies it defensively). The cockpit step
// placement for Searching Providers (sla.ts) is interim pending the step
// alignment. set_lead_status validates its target against this list; nothing
// outside it is written. Keep in sync with LEAD_STATUSES in
// components/cockpit/LeadActions.tsx.
export const LEAD_STATUSES = [
  'New',
  'Waiting Response',
  'Intro Call Scheduled',
  'Intro Call Done',
  'Searching Providers',
  'Deal Ready',
  'Not Qualified',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** The single Zoho field a stamp writes and its value shape. The field comes
 *  from config (never invented); 'date' writes today's Bahrain YYYY-MM-DD into
 *  a Zoho DATE field, 'datetime' writes an ISO instant into a DATETIME field. */
export const STAMP_FIELD: Record<
  StampEvent,
  { field: string; format: 'date' | 'datetime' }
> = {
  first_contact: {
    field: COCKPIT_DEAL_FIELDS.welcome_message_sent,
    format: 'date',
  },
  quotation_sent: {
    field: COCKPIT_DEAL_FIELDS.quotation_sent,
    format: 'datetime',
  },
  partner_quote_requested: {
    field: COCKPIT_DEAL_FIELDS.partner_quote_requested,
    format: 'datetime',
  },
  partner_more_time: {
    field: COCKPIT_DEAL_FIELDS.partner_more_time,
    format: 'datetime',
  },
};

/** The single Zoho field set_follow_up and move_stage write, for the field
 *  allowlist. Stamps resolve their field via STAMP_FIELD instead, so they have
 *  no entry here. The gate writes nothing outside these two maps. */
export const CHANGE_FIELD: Record<'set_follow_up' | 'move_stage', string> = {
  set_follow_up: COCKPIT_DEAL_FIELDS.next_follow_up,
  move_stage: 'Stage',
};

/** The allowlist of progressive case fields edit_field may write, mapping each
 *  field key to its Zoho api_name (from config, never invented) and value type:
 *  'currency' writes a BHD Number, 'date' writes a YYYY-MM-DD string. The gate
 *  writes nothing outside this map. */
export const EDIT_FIELD_SPEC: Record<
  EditableField,
  { field: string; type: 'currency' | 'date' }
> = {
  patient_budget: {
    field: COCKPIT_DEAL_FIELDS.patient_budget,
    type: 'currency',
  },
  treatment_start: { field: 'Treatment_Start_Date', type: 'date' },
  treatment_end: { field: 'Treatment_End_Date', type: 'date' },
};

/** Stable, deterministic key for "the same logical change", so committing it
 *  twice is a no-op that replays the first result. Hashes the resource and the
 *  change, not the changeId. */
export function idempotencyKeyOf(
  resourceType: string,
  resourceId: string,
  change: ProposedChange,
): string {
  const canonical = JSON.stringify({ resourceType, resourceId, change });
  return createHash('sha256').update(canonical).digest('hex');
}

/** "18 Jun 2026" from a YYYY-MM-DD string, parsed by parts so no timezone
 *  shift can roll the day. Returns the raw value if it is not a plain date. */
export function formatFollowUpDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return date;
  return `${day} ${months[month - 1]} ${year}`;
}

/** True when a string is a plain YYYY-MM-DD calendar date. */
export function isPlainDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Context the describer needs from the current record to phrase the change.
 *  currentPatientBudget is the deal's current Patient_Budget, so an edit can
 *  read "change from X to Y"; budget and dates are case data, not identifiers.
 *  NHRA: the change-list text may carry dates and budget, never a patient name. */
export interface ChangeContext {
  currentFollowUp: string | null;
  currentStage: string | null;
  currentPatientBudget: number | null;
}

/** True when an edit_field value is well-formed for its type: currency parses
 *  to a finite number at or above zero; date is a plain YYYY-MM-DD with an
 *  in-range month and day (so 2026-13-40 is rejected, not just non-numeric
 *  text). The field allowlist itself is checked separately against
 *  EDIT_FIELD_SPEC. */
export function isValidEditValue(field: EditableField, value: string): boolean {
  const type = EDIT_FIELD_SPEC[field].type;
  if (type === 'currency') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** The plain-language change list the case manager confirms. One line today;
 *  the gate returns it as a single-element list to leave room for batched
 *  changes later. */
export function describeChange(
  change: ProposedChange,
  ctx: ChangeContext,
): string {
  switch (change.kind) {
    case 'set_follow_up': {
      const to = formatFollowUpDate(change.date);
      if (ctx.currentFollowUp) {
        const from = formatFollowUpDate(ctx.currentFollowUp.slice(0, 10));
        if (from === to) return `Next follow-up stays ${to}`;
        return `Change next follow-up from ${from} to ${to}`;
      }
      return `Set next follow-up to ${to}`;
    }
    case 'move_stage': {
      const from = ctx.currentStage ?? 'its current stage';
      if (change.to_stage === 'Lost / Inactive') {
        const reason = change.reason_for_loss
          ? ` (reason: ${change.reason_for_loss})`
          : '';
        return `Mark deal Lost / Inactive${reason}`;
      }
      return `Move deal from ${from} to ${change.to_stage}`;
    }
    case 'stamp': {
      switch (change.event) {
        case 'first_contact':
          return 'Mark first contact sent (stamps Welcome Message Sent Date)';
        case 'quotation_sent':
          return 'Mark quotation sent (stamps Quotation Sent Date)';
        case 'partner_quote_requested':
          return 'Mark partner quote requested (stamps Partner Quote Requested Date)';
        case 'partner_more_time':
          return 'Mark partner needs more time (stamps Partner More Time Date)';
      }
      break;
    }
    case 'send_first_contact':
      return 'Send the first-contact template to the patient on WhatsApp and log it on the deal, stamping the last-comm date.';
    case 'edit_field': {
      switch (change.field) {
        case 'patient_budget': {
          if (ctx.currentPatientBudget != null) {
            return `Change patient budget from BHD ${ctx.currentPatientBudget} to BHD ${change.value}`;
          }
          return `Set patient budget to BHD ${change.value}`;
        }
        case 'treatment_start':
          return `Set treatment start date to ${formatFollowUpDate(change.value)}`;
        case 'treatment_end':
          return `Set treatment end date to ${formatFollowUpDate(change.value)}`;
      }
      break;
    }
    case 'convert_lead':
      return `Convert this lead to a ${change.pipeline} deal at ${change.stage}`;
    case 'set_lead_status':
      return `Set lead status to ${change.status}`;
    case 'set_lead_follow_up': {
      const to = formatFollowUpDate(change.date);
      if (ctx.currentFollowUp) {
        const from = formatFollowUpDate(ctx.currentFollowUp.slice(0, 10));
        if (from === to) return `Next follow-up stays ${to}`;
        return `Change next follow-up from ${from} to ${to}`;
      }
      return `Set next follow-up to ${to}`;
    }
    case 'park_lead':
      return `Park this lead as Not Qualified (reason: ${change.reason})`;
    case 'add_tag': {
      const label = change.tag_names.length === 1 ? 'tag' : 'tags';
      return `Add ${label}: ${change.tag_names.join(', ')}`;
    }
    case 'remove_tag':
      return `Remove tag: ${change.tag_name}`;
  }
  // Unreachable for known kinds; satisfies the exhaustive return contract.
  return 'Apply the requested change';
}

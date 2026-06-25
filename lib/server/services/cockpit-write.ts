// The cockpit write service. ONE audited path from a cockpit control to a Zoho
// CRM write, in a SINGLE call: a control sends its change, the route validates
// it and calls applyChange, which writes straight to Zoho and audits. This is
// the one-step replacement for the former two-step write gate (prepare ->
// confirm -> commit with a Supabase write_intents ledger).
//
// WHAT CHANGED FROM THE OLD GATE (deliberate, team-accepted): there is no
// write_intents row, no prepare/commit split, no short-lived changeId, no
// idempotency lock, and no Modified_Time conflict re-check. A control posts its
// change and the write happens. The field logic is UNCHANGED: validation reuses
// write-gate-changes (and write-gate-transitions for stage moves) verbatim, and
// the Zoho field payload is the SAME fieldsFor() the old commit wrote, so the
// effect in Zoho is identical field-for-field.
//
// WHAT IS KEPT: the route still refuses every write while WRITE_GATE_ENABLED is
// false (the hard cutover switch), still rejects the MCP service viewer
// (assertPerson, in the route), still validates the change shape, and still
// audits KEYS-only (action, actor, entity, field KEYS and non-PII context;
// NEVER field values, the patient name, phone, or budget).
//
// THE ONE SAFETY KEPT (convert guard): convert_lead is the only non-idempotent
// create (a repeat POST makes a SECOND deal). Before calling convertLead the
// server re-reads the lead and refuses with a ConflictError if it is already
// converted, so a double submission cannot create two deals. The UI also
// disables the submit button while the request is in flight. No ledger backs
// this; the re-read is the guard.
//
// PRIVACY (NHRA): the audit records field KEYS and non-PII context only, never
// field values, the patient name, phone, or budget. The patient mobile read for
// the send path is never logged, returned, or audited.
//
// SERVER ONLY. Routes that call this declare export const runtime = 'nodejs'
// (this pulls in pg/Zoho through the foundation singletons).
import { getAudit } from '../audit';
import { getCrmRead } from '../crm-read';
import { getZohoClient, getZohoWriteClient } from '../integrations/zoho/client';
import { getWhatsApp } from '../integrations/whatsapp';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../errors';
import type { RequestViewer } from '../auth/viewer';
import {
  ACTIVE_CHANGE_KINDS,
  CHANGE_FIELD,
  COCKPIT_DEAL_FIELDS,
  EDIT_FIELD_SPEC,
  LEAD_STATUSES,
  STAMP_FIELD,
  describeChange,
  isPlainDate,
  isValidEditValue,
  type ProposedChange,
  type StampEvent,
} from './write-gate-changes';
import { OPEN_STAGES, validateStageTransition } from './write-gate-transitions';

const STAMP_EVENTS: ReadonlyArray<StampEvent> = [
  'first_contact',
  'quotation_sent',
  'partner_quote_requested',
  'partner_more_time',
];

const CRM = 'https://www.zohoapis.com/crm/v3';

// The lead change kinds (lead-only). A lead kind only runs against a lead, a
// deal kind only against a deal; the resource is inferred from the kind so the
// route does not need to pass a separate resourceType.
const LEAD_CHANGE_KINDS: ReadonlyArray<ProposedChange['kind']> = [
  'convert_lead',
  'set_lead_status',
  'park_lead',
];

/** The shape applyChange returns to a control. Identical in spirit to the old
 *  CommitResult so the controls keep reading { change_list, resource_id }.
 *  Defined locally (contract.ts / keys.ts are off-limits). */
export interface ApplyChangeResult {
  committed: boolean;
  change_list: string[];
  resource_id: string;
}

interface DealSnapshot {
  id: string;
  stage: string | null;
  pipeline: string | null;
  nextFollowUp: string | null;
  // The patient phone (patient data). Used only by the send path; never logged,
  // returned, or audited.
  patientMobile: string | null;
  // Current Patient_Budget, so an edit_field change can phrase "change from X to
  // Y". Case data, not an identifier; reaches only the change-list text, never
  // the audit values.
  patientBudget: number | null;
}

interface LeadSnapshot {
  id: string;
  leadStatus: string | null;
  // The lead phone (patient data). Carried for parity; never logged, returned,
  // or audited.
  phone: string | null;
  // The lead's name (patient data). Used ONLY to name the deal Zoho creates on
  // conversion (Deal_Name is system-mandatory on Deals). Like phone, it is never
  // logged, returned to the client, or written to the audit value; it reaches
  // only the Zoho convert payload, the same place a manual Zoho conversion puts
  // it.
  name: string | null;
  // Whether the lead is already converted (Leads Converted__s). A converted
  // lead cannot be converted again.
  converted: boolean;
}

// ---------------------------------------------------------------------------
// applyChange: validate, then write to Zoho directly, then audit. One call.
// ---------------------------------------------------------------------------

/** Validate a proposed change and apply it to Zoho in a single call. The
 *  resource (deal vs lead) is inferred from the change kind. Returns the
 *  plain-language change list and the resource id the control expects.
 *
 *  WRITE_GATE_ENABLED is NOT checked here; the route refuses outright while the
 *  flag is off (the hard cutover switch), the same place assertPerson runs. */
export async function applyChange(
  viewer: RequestViewer,
  resourceId: string,
  change: ProposedChange,
): Promise<ApplyChangeResult> {
  if (!ACTIVE_CHANGE_KINDS.includes(change.kind)) {
    throw new BadRequestError(`Unsupported change "${String(change.kind)}".`);
  }

  if (LEAD_CHANGE_KINDS.includes(change.kind)) {
    return applyLeadChange(viewer, resourceId, change);
  }
  return applyDealChange(viewer, resourceId, change);
}

// ---------------------------------------------------------------------------
// Deal changes (set_follow_up, move_stage, stamp, edit_field, send_first_contact)
// ---------------------------------------------------------------------------

async function applyDealChange(
  viewer: RequestViewer,
  resourceId: string,
  change: ProposedChange,
): Promise<ApplyChangeResult> {
  // Shape validation, identical to what prepare validated before persisting an
  // intent.
  if (change.kind === 'set_follow_up' && !isPlainDate(change.date)) {
    throw new BadRequestError(
      'A follow-up date must be a calendar date (YYYY-MM-DD).',
    );
  }
  if (change.kind === 'stamp' && !STAMP_EVENTS.includes(change.event)) {
    throw new BadRequestError(`Unknown stamp event "${String(change.event)}".`);
  }
  if (change.kind === 'edit_field') {
    if (!(change.field in EDIT_FIELD_SPEC)) {
      throw new BadRequestError(`Cannot edit field "${String(change.field)}".`);
    }
    if (!isValidEditValue(change.field, change.value)) {
      const spec = EDIT_FIELD_SPEC[change.field];
      throw new BadRequestError(
        spec.type === 'currency'
          ? 'A budget must be a number at or above zero.'
          : 'A treatment date must be a calendar date (YYYY-MM-DD).',
      );
    }
  }

  const deal = await readDeal(resourceId);
  if (!deal) {
    throw new NotFoundError('That deal does not exist in Zoho.');
  }

  // A stage move runs the drafted transition map. Only the two cockpit
  // pipelines move here; the loss reason (when into Lost) is validated by the
  // same check against LOSS_REASONS.
  if (change.kind === 'move_stage') {
    const pipeline = deal.pipeline;
    if (pipeline !== 'Treatment' && pipeline !== 'Telemedicine') {
      throw new BadRequestError(
        'The cockpit only moves Treatment and Telemedicine deals.',
      );
    }
    const check = validateStageTransition(
      pipeline,
      deal.stage ?? '',
      change.to_stage,
      change.reason_for_loss ?? null,
    );
    if (!check.ok) {
      throw new BadRequestError(check.reason ?? 'That move is not allowed.');
    }
  }

  const changeText = describeChange(change, {
    currentFollowUp: deal.nextFollowUp,
    currentStage: deal.stage,
    currentPatientBudget: deal.patientBudget,
  });

  // send_first_contact does its own send-then-stamp write; the rest are a single
  // allowlisted updateRecord (the SAME fieldsFor the old commit wrote).
  if (change.kind === 'send_first_contact') {
    return sendFirstContact(viewer, deal, changeText);
  }

  const fields = fieldsFor(change);
  const writeResult = await getZohoWriteClient().updateRecord(
    'Deals',
    resourceId,
    fields,
  );

  if (!writeResult.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_deals',
      entity_id: resourceId,
      before: null,
      after: null,
      context: {
        change_kind: change.kind,
        zoho_code: writeResult.code,
      },
    });
    throw new ConflictError(
      'Zoho refused the write. Nothing was changed; try again or tell Al Saeed.',
    );
  }

  // Audit field KEYS only; never the field values, the patient name, phone, or
  // budget. The change_list text (which for an edit can read back a budget) is
  // the UI confirm line and is RETURNED to the control, never written here.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_deals',
    entity_id: resourceId,
    before: null,
    after: { fields: Object.keys(fields) },
    context: {
      change_kind: change.kind,
      zoho_code: writeResult.code,
    },
  });

  // The write changed live Zoho data; bust the crm-read cache so the next read
  // serves the new value instead of the pre-write copy until the TTL.
  await getCrmRead().invalidate();

  return { committed: true, change_list: [changeText], resource_id: resourceId };
}

/** Send the fixed first-contact template to the patient's WhatsApp number, and
 *  only on a confirmed send write the two stamp fields in one updateRecord
 *  call. A send failure audits (no patient data) and throws; it never stamps
 *  success. The patient number is read from the snapshot, passed to the port,
 *  and never logged, returned, or audited. Ported from the old
 *  commitFirstContact minus the intent/lock/Modified_Time bits. */
async function sendFirstContact(
  viewer: RequestViewer,
  deal: DealSnapshot,
  changeText: string,
): Promise<ApplyChangeResult> {
  // No number on file: audit a failure (no phone value) and refuse.
  if (!deal.patientMobile) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.whatsapp.failed',
      entity_type: 'zoho_deals',
      entity_id: deal.id,
      before: null,
      after: null,
      context: {
        change_kind: 'send_first_contact',
        reason: 'no_patient_phone',
      },
    });
    throw new ConflictError('No WhatsApp number on file for this patient.');
  }

  const result = await getWhatsApp().sendTemplate(
    deal.patientMobile,
    'first_contact',
    {},
  );

  // A send that did not go through: audit (provider error only, which by the
  // port contract carries no patient data) and refuse without stamping.
  if (!result.sent) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.whatsapp.failed',
      entity_type: 'zoho_deals',
      entity_id: deal.id,
      before: null,
      after: null,
      context: {
        change_kind: 'send_first_contact',
        provider_error: result.error ?? null,
      },
    });
    throw new ConflictError("Couldn't send on WhatsApp. Nothing was logged.");
  }

  // Sent: stamp the welcome-message date (Bahrain calendar date) and the
  // last-comm instant in one write. The SAME fields the old commit wrote.
  const fields: Record<string, unknown> = {
    [COCKPIT_DEAL_FIELDS.welcome_message_sent]: bahrainToday(),
    [COCKPIT_DEAL_FIELDS.last_patient_comm]: new Date().toISOString(),
  };
  const writeResult = await getZohoWriteClient().updateRecord(
    'Deals',
    deal.id,
    fields,
  );

  if (!writeResult.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_deals',
      entity_id: deal.id,
      before: null,
      after: null,
      context: {
        change_kind: 'send_first_contact',
        zoho_code: writeResult.code,
        provider_message_id: result.provider_message_id,
      },
    });
    throw new ConflictError(
      'Zoho refused the write. Nothing was changed; try again or tell Al Saeed.',
    );
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_deals',
    entity_id: deal.id,
    before: null,
    after: { fields: Object.keys(fields) },
    context: {
      change_kind: 'send_first_contact',
      zoho_code: writeResult.code,
      provider_message_id: result.provider_message_id,
    },
  });

  // The write changed live Zoho data; bust the crm-read cache so the next read
  // serves the new value instead of the pre-write copy until the TTL.
  await getCrmRead().invalidate();

  return { committed: true, change_list: [changeText], resource_id: deal.id };
}

// ---------------------------------------------------------------------------
// Lead changes (convert_lead, set_lead_status, park_lead)
// ---------------------------------------------------------------------------

async function applyLeadChange(
  viewer: RequestViewer,
  resourceId: string,
  change: ProposedChange,
): Promise<ApplyChangeResult> {
  // Shape validation, identical to what prepareLead validated.
  if (change.kind === 'convert_lead') {
    if (change.pipeline !== 'Treatment' && change.pipeline !== 'Telemedicine') {
      throw new BadRequestError(
        'A lead converts into a Treatment or Telemedicine deal.',
      );
    }
    if (!OPEN_STAGES[change.pipeline].includes(change.stage)) {
      throw new BadRequestError(
        `"${change.stage}" is not an open ${change.pipeline} stage.`,
      );
    }
  }
  if (
    change.kind === 'set_lead_status' &&
    !(LEAD_STATUSES as readonly string[]).includes(change.status)
  ) {
    throw new BadRequestError(`"${change.status}" is not a valid lead status.`);
  }
  if (change.kind === 'park_lead' && change.reason.trim().length === 0) {
    throw new BadRequestError('Parking a lead needs a reason.');
  }

  // The lead describer needs no deal context (budget, stage, follow-up).
  const changeText = describeChange(change, {
    currentFollowUp: null,
    currentStage: null,
    currentPatientBudget: null,
  });

  if (change.kind === 'convert_lead') {
    return convertLead(viewer, resourceId, change, changeText);
  }

  // set_lead_status and park_lead are a single Lead_Status write (a park also
  // records the not-qualified reason). The field map is the allowlist; no other
  // field is written. Identical to the old commitLead non-convert path.
  let fields: Record<string, unknown>;
  if (change.kind === 'park_lead') {
    fields = {
      Lead_Status: 'Not Qualified',
      Reason_Not_Qualified: change.reason,
    };
  } else if (change.kind === 'set_lead_status') {
    fields = { Lead_Status: change.status };
  } else {
    // Unreachable: convert_lead is handled above and deal kinds never route
    // here. Keeps the switch exhaustive.
    throw new BadRequestError('Only lead changes are applied by the lead path.');
  }

  const writeResult = await getZohoWriteClient().updateRecord(
    'Leads',
    resourceId,
    fields,
  );
  if (!writeResult.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_leads',
      entity_id: resourceId,
      before: null,
      after: null,
      context: {
        change_kind: change.kind,
        zoho_code: writeResult.code,
      },
    });
    throw new ConflictError(
      'Zoho refused the write. Nothing was changed; try again or tell Al Saeed.',
    );
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_leads',
    entity_id: resourceId,
    before: null,
    after: { fields: Object.keys(fields) },
    context: {
      change_kind: change.kind,
      zoho_code: writeResult.code,
      new_deal_id: null,
    },
  });

  // The write changed live Zoho data; bust the crm-read cache so the next read
  // serves the new value instead of the pre-write copy until the TTL.
  await getCrmRead().invalidate();

  return { committed: true, change_list: [changeText], resource_id: resourceId };
}

/** Convert a lead into a deal. THE CONVERT GUARD: re-read the lead first and
 *  refuse with a ConflictError if it is already converted, so a double
 *  submission cannot create two deals (convertLead is a non-idempotent POST).
 *  This re-read is the only safety kept from the old gate; there is no ledger.
 *  The UI also disables the submit button while the request is in flight. */
async function convertLead(
  viewer: RequestViewer,
  resourceId: string,
  change: Extract<ProposedChange, { kind: 'convert_lead' }>,
  changeText: string,
): Promise<ApplyChangeResult> {
  const lead = await readLead(resourceId);
  if (!lead) {
    throw new NotFoundError('That lead does not exist in Zoho.');
  }
  // CONVERT GUARD: an already-converted lead cannot be converted again. A
  // double-click that slips past the in-flight button still finds the lead
  // converted and stops here, so no second deal is created.
  if (lead.converted) {
    throw new ConflictError('That lead has already been converted to a deal.');
  }

  // Deal_Name is system-mandatory on Deals, so the convert payload MUST carry
  // one or Zoho 400s (MANDATORY_NOT_FOUND on Deal_Name). Name the deal after the
  // lead, matching what Zoho's manual Convert produces. Fall back to the pipeline
  // label if the name is somehow blank, and cap at the field's 120-char limit.
  // PRIVACY: this VALUE (the patient name) is never logged, returned, or audited;
  // it lives only in the Zoho payload below.
  const dealName = (lead.name ?? `${change.pipeline} deal`).slice(0, 120);
  const convert = await getZohoWriteClient().convertLead(resourceId, {
    Deal_Name: dealName,
    Pipeline: change.pipeline,
    Stage: change.stage,
  });
  // Breadcrumb for tracing the convert outcome in the server log. Flags only,
  // never the lead/deal id value or any patient data (the client logs the
  // response structure on the no-id anomaly).
  console.info('[cockpit.convertLead] result', {
    ok: convert.ok,
    hasDealId: !!convert.dealId,
  });
  if (!convert.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_leads',
      entity_id: resourceId,
      before: null,
      after: null,
      context: { change_kind: change.kind },
    });
    throw new ConflictError(
      'Zoho refused the conversion. Nothing was changed; try again or tell Al Saeed.',
    );
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_leads',
    entity_id: resourceId,
    before: null,
    // Field KEYS only (never the Deal_Name VALUE, which is the patient name).
    after: { fields: ['Deal_Name', 'Pipeline', 'Stage'] },
    context: {
      change_kind: change.kind,
      zoho_code: 'SUCCESS',
      new_deal_id: convert.dealId,
    },
  });

  // The write changed live Zoho data; bust the crm-read cache so the next read
  // serves the new value instead of the pre-write copy until the TTL.
  await getCrmRead().invalidate();

  return { committed: true, change_list: [changeText], resource_id: resourceId };
}

// ---------------------------------------------------------------------------
// Reads and the field payload (ported from write-gate.ts)
// ---------------------------------------------------------------------------

/** Fresh, uncached single-deal read. Pulls the gate fields plus Patient_Mobile
 *  (the send path needs it) and Patient_Budget (so an edit_field change can
 *  phrase "change from X to Y"). The mobile is patient data and lives only on
 *  the snapshot; the budget is case data, not an identifier, and reaches only
 *  the change-list text, never the audit. */
async function readDeal(id: string): Promise<DealSnapshot | null> {
  const res = await getZohoClient().get<{
    data?: Array<Record<string, unknown>>;
  }>(`${CRM}/Deals/${encodeURIComponent(id)}`, {
    fields:
      'Stage,Pipeline,Next_Follow_up,Patient_Mobile,Patient_Budget,Treatment_Start_Date,Treatment_End_Date',
  });
  const record = res.data?.[0];
  if (!record) return null;
  return {
    id,
    stage: asString(record.Stage),
    pipeline: asString(record.Pipeline),
    nextFollowUp: asString(record.Next_Follow_up),
    patientMobile: asString(record.Patient_Mobile),
    patientBudget: asNumber(record.Patient_Budget),
  };
}

/** Fresh, uncached single-lead read for the converted gate. Pulls Lead_Status,
 *  Phone (patient data, carried for parity but never logged or audited),
 *  Converted__s (the live Leads conversion flag, api_name Converted__s, label
 *  "Is Converted"; the bare "Converted" name does not exist on the module), and
 *  Full_Name/Last_Name (patient data; used only to name the converted deal). */
async function readLead(id: string): Promise<LeadSnapshot | null> {
  const res = await getZohoClient().get<{
    data?: Array<Record<string, unknown>>;
  }>(`${CRM}/Leads/${encodeURIComponent(id)}`, {
    fields: 'Lead_Status,Phone,Converted__s,Full_Name,Last_Name',
  });
  const record = res.data?.[0];
  if (!record) return null;
  // Prefer the composite Full_Name; fall back to Last_Name (mandatory on Leads,
  // so one of these is always present). Patient data, carried for the convert
  // Deal_Name only.
  const name = asString(record.Full_Name) ?? asString(record.Last_Name);
  return {
    id,
    leadStatus: asString(record.Lead_Status),
    phone: asString(record.Phone),
    name,
    converted: record.Converted__s === true,
  };
}

/** The Zoho field payload for a change, drawn only from the allowlist. IDENTICAL
 *  to the old write-gate fieldsFor, so the Zoho write is unchanged field-for-
 *  field. send_first_contact and the lead kinds do their own writes and never
 *  reach this generic single-field path. */
function fieldsFor(change: ProposedChange): Record<string, unknown> {
  switch (change.kind) {
    case 'set_follow_up':
      return { [CHANGE_FIELD.set_follow_up]: change.date };
    case 'move_stage': {
      const fields: Record<string, unknown> = {
        [CHANGE_FIELD.move_stage]: change.to_stage,
      };
      // A move into Lost also writes the reason; it has already been validated
      // against LOSS_REASONS.
      if (change.to_stage === 'Lost / Inactive') {
        fields.Reason_For_Loss__s = change.reason_for_loss;
      }
      return fields;
    }
    case 'stamp': {
      const { field, format } = STAMP_FIELD[change.event];
      const value =
        format === 'date' ? bahrainToday() : new Date().toISOString();
      return { [field]: value };
    }
    case 'edit_field': {
      const spec = EDIT_FIELD_SPEC[change.field];
      // currency writes a BHD Number; date writes the YYYY-MM-DD string. Both
      // were validated by isValidEditValue.
      const value =
        spec.type === 'currency' ? Number(change.value) : change.value;
      return { [spec.field]: value };
    }
    case 'send_first_contact':
      throw new BadRequestError(
        'send_first_contact is applied by its own send path.',
      );
    case 'convert_lead':
    case 'set_lead_status':
    case 'park_lead':
      throw new BadRequestError(
        'Lead changes are applied by their own lead path.',
      );
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Today's calendar date in Bahrain as YYYY-MM-DD, for the DATE-typed stamp.
 *  en-CA renders ISO-ordered parts, so this is the plain date Zoho expects. */
function bahrainToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bahrain' });
}

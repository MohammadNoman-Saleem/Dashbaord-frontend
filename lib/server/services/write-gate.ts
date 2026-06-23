// The cockpit write gate. One audited path from the cockpit to a Zoho CRM
// write, in two steps with a human confirming in between:
//
//   prepare -> validate the change, read the deal/lead to capture Modified_Time,
//              compute the plain-language change list, persist a pending intent,
//              return a short-lived changeId. Writes nothing to Zoho.
//   commit  -> re-read the record, refuse with a conflict if Modified_Time moved
//              since prepare, write via the write-scoped client, write the audit
//              row, mark the intent committed. Committing the same logical
//              change twice replays the first result (no second Zoho write).
//
// Ported from the NestJS backend src/write-gate/write-gate.service.ts. The
// @Injectable class with constructor DI (Pool, Env, ZohoClient, ZohoWriteClient,
// AuditService, WhatsAppPort) becomes a plain exported object whose methods read
// the foundation singletons: getPool(), getEnv(), getZohoClient(),
// getZohoWriteClient(), getAudit(), getWhatsApp(). Every guard, the TTL, the
// confirmation-count logic, the concurrency check, and the keys-only audit are
// unchanged.
//
// THE ONE DELIBERATE CHANGE (idempotency rework): the backend serialized the
// commit critical section with a Postgres SESSION advisory lock taken on a
// pinned pool.connect() connection (withIdempotencyLock). That breaks on the
// Supabase serverless TRANSACTION pooler, where pool.query() hands out an
// arbitrary backend per call and a session lock taken on one cannot be released
// on another. This port removes the advisory lock and the pinned session
// entirely. Correctness now rests on:
//   1. A pre-write replay check (findCommittedSibling by idempotency_key): a
//      committed sibling means the same logical change already landed, so we
//      replay its stored result and never write to Zoho again.
//   2. The existing partial unique index write_intents_committed_idem
//      (idempotency_key WHERE status = 'committed') as the authoritative
//      serializer: markCommitted flips the row to committed in ONE statement;
//      a concurrent committer that won the race makes this UPDATE trip 23505,
//      and the backstop re-queries the committed sibling and replays it instead
//      of double-writing or surfacing a 500.
// All queries go through getPool() (no pool.connect-pinned session, no
// pg_advisory_lock, no DATABASE_URL_SESSION). The no-double-write guarantee is
// preserved: the unique index admits exactly one committed row per logical
// change, and the only path that issues the Zoho write is the one that then
// wins the unique-index race; the loser replays the winner's result.
//
// Guards: the whole commit refuses unless WRITE_GATE_ENABLED is true (prepare
// may run with it false, for testing); the caller (route) rejects the MCP
// service viewer via assertPerson so no MCP caller can fire a write; there is no
// delete path. The actor check enforces that only the viewer who prepared an
// intent may commit it.
//
// PRIVACY (NHRA): the audit records field KEYS and non-PII context only, never
// field values, the patient name, phone, or budget. The change_list_text stored
// in write_intents may carry dates/budget for the confirm modal but never a
// patient name. The patient mobile read for the send path is never logged,
// returned, or audited.
//
// SERVER ONLY. Routes that call this declare export const runtime = 'nodejs'
// (this pulls in pg/Zoho through the foundation singletons).
import { randomUUID } from 'node:crypto';
import { getPool } from '../db';
import { getEnv } from '../env';
import { getZohoClient, getZohoWriteClient } from '../integrations/zoho/client';
import { getAudit } from '../audit';
import { getWhatsApp } from '../integrations/whatsapp';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  GoneError,
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
  idempotencyKeyOf,
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
const INTENT_TTL_MS = 10 * 60 * 1000; // a prepared intent is good for 10 minutes

export interface PrepareInput {
  resourceType: 'deal' | 'lead';
  resourceId: string;
  change: ProposedChange;
}

// The deal change kinds (deal-only) and the lead change kinds (lead-only). The
// gate matches resourceType to the kind so a deal kind can never run against a
// lead, nor the reverse.
const LEAD_CHANGE_KINDS: ReadonlyArray<ProposedChange['kind']> = [
  'convert_lead',
  'set_lead_status',
  'park_lead',
];

export interface PrepareResult {
  change_id: string;
  change_list: string[];
  confirmations_required: number;
  base_modified_time: string | null;
  /** The flag state, so the UI can warn that commit will refuse while off. */
  writes_enabled: boolean;
}

export interface CommitInput {
  change_id: string;
  confirmations: number;
}

export interface CommitResult {
  committed: boolean;
  change_list: string[];
  resource_id: string;
}

interface DealSnapshot {
  id: string;
  modifiedTime: string | null;
  stage: string | null;
  pipeline: string | null;
  nextFollowUp: string | null;
  // The patient phone (patient data). Used only by the send path; never logged,
  // never returned, never audited.
  patientMobile: string | null;
  // Current progressive case fields, so an edit_field change can phrase "change
  // from X to Y". Budget and dates are case data, not identifiers; they reach
  // only the change-list text, never the audit values.
  patientBudget: number | null;
}

interface LeadSnapshot {
  id: string;
  modifiedTime: string | null;
  leadStatus: string | null;
  // The lead phone (patient data). Carried for parity with the deal snapshot
  // and the future lead send path; never logged, returned, or audited.
  phone: string | null;
  // Whether the lead is already converted (Leads Converted__s). A converted
  // lead cannot be converted again.
  converted: boolean;
}

interface IntentRow {
  id: string;
  actor_user_id: string;
  resource_type: string;
  resource_id: string;
  proposed_change: ProposedChange;
  change_list_text: string;
  base_modified_time: Date | null;
  status: 'pending' | 'committed' | 'expired' | 'conflict';
  result: CommitResult | null;
  expires_at: Date;
}

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

export async function prepare(
  viewer: RequestViewer,
  input: PrepareInput,
): Promise<PrepareResult> {
  // Opportunistic retention sweep. Non-blocking and never allowed to break a
  // prepare: sweepExpiredIntents swallows its own errors.
  await sweepExpiredIntents();

  if (input.resourceType !== 'deal' && input.resourceType !== 'lead') {
    throw new BadRequestError('The write gate handles deals and leads.');
  }
  const change = input.change;
  if (!ACTIVE_CHANGE_KINDS.includes(change.kind)) {
    throw new BadRequestError(`Unsupported change "${String(change.kind)}".`);
  }

  // Resource and kind must agree: a lead kind only runs against a lead, a deal
  // kind only against a deal.
  const isLeadKind = LEAD_CHANGE_KINDS.includes(change.kind);
  if (isLeadKind && input.resourceType !== 'lead') {
    throw new BadRequestError(
      `"${change.kind}" is a lead change; resourceType must be "lead".`,
    );
  }
  if (!isLeadKind && input.resourceType !== 'deal') {
    throw new BadRequestError(
      `"${change.kind}" is a deal change; resourceType must be "deal".`,
    );
  }

  if (input.resourceType === 'lead') {
    return prepareLead(input, change, viewer);
  }

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

  const deal = await readDeal(input.resourceId);
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
  return persistIntent(input, change, changeText, deal.modifiedTime, viewer);
}

/** Prepare a lead change (convert_lead, set_lead_status, park_lead). Reads the
 *  lead fresh for the Modified_Time concurrency anchor and the converted gate,
 *  validates the change, then persists the pending intent the same way the deal
 *  path does. Writes nothing to Zoho. */
async function prepareLead(
  input: PrepareInput,
  change: ProposedChange,
  viewer: RequestViewer,
): Promise<PrepareResult> {
  const lead = await readLead(input.resourceId);
  if (!lead) {
    throw new NotFoundError('That lead does not exist in Zoho.');
  }
  // An already-converted lead cannot be converted (or re-worked) again.
  if (lead.converted) {
    throw new BadRequestError(
      'That lead has already been converted to a deal.',
    );
  }

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
  return persistIntent(input, change, changeText, lead.modifiedTime, viewer);
}

/** Persist a validated pending intent and return the prepare result. Shared by
 *  the deal and lead prepare paths so the changeId, idempotency key, TTL and
 *  insert stay identical. Uses the EXISTING write_intents table via getPool(). */
async function persistIntent(
  input: PrepareInput,
  change: ProposedChange,
  changeText: string,
  baseModifiedTime: string | null,
  viewer: RequestViewer,
): Promise<PrepareResult> {
  const confirmations = confirmationsFor(change);
  const changeId = randomUUID();
  const idempotencyKey = idempotencyKeyOf(
    input.resourceType,
    input.resourceId,
    change,
  );
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);

  await getPool().query(
    `insert into write_intents
       (id, actor_user_id, resource_type, resource_id, proposed_change,
        change_list_text, base_modified_time, status, idempotency_key,
        expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)`,
    [
      changeId,
      viewer.key,
      input.resourceType,
      input.resourceId,
      JSON.stringify(change),
      changeText,
      baseModifiedTime,
      idempotencyKey,
      expiresAt.toISOString(),
    ],
  );

  return {
    change_id: changeId,
    change_list: [changeText],
    confirmations_required: confirmations,
    base_modified_time: baseModifiedTime,
    writes_enabled: getEnv().WRITE_GATE_ENABLED,
  };
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export async function commit(
  viewer: RequestViewer,
  input: CommitInput,
): Promise<CommitResult> {
  const intent = await loadIntent(input.change_id);
  if (!intent) {
    throw new NotFoundError('That change has expired or never existed.');
  }
  if (intent.actor_user_id !== viewer.key) {
    // Only the person who prepared a change may commit it.
    throw new ForbiddenError(
      'Only the person who prepared this change can commit it.',
    );
  }

  // Idempotent replay: a committed intent returns its first result, no second
  // write.
  if (intent.status === 'committed' && intent.result) {
    return intent.result;
  }
  if (intent.status === 'conflict') {
    throw new ConflictError(
      'This change hit a conflict earlier; prepare it again.',
    );
  }
  if (intent.status === 'expired' || intent.expires_at.getTime() < Date.now()) {
    await markStatus(intent.id, 'expired');
    throw new GoneError('This change has expired; prepare it again.');
  }

  // The flag is the hard cutover switch. Prepared intents are fine to hold; a
  // commit is refused outright while writes are off.
  if (!getEnv().WRITE_GATE_ENABLED) {
    throw new ForbiddenError(
      'Writes are turned off right now. The change is saved but not applied.',
    );
  }

  const required = confirmationsFor(intent.proposed_change);
  if ((input.confirmations ?? 0) < required) {
    throw new BadRequestError(
      `This change needs ${required} confirmation${required === 1 ? '' : 's'}.`,
    );
  }

  // The deterministic key for this logical change. It equals what prepare
  // stored, so it identifies a committed sibling and keys the unique-index
  // serializer. Recomputed (rather than added to loadIntent) so the existing
  // SELECT stays unchanged.
  const idempotencyKey = idempotencyKeyOf(
    intent.resource_type,
    intent.resource_id,
    intent.proposed_change,
  );

  // Lead intents run their own re-read, concurrency check, write and audit
  // against the Leads module; they never touch the Deals path below. commitLead
  // takes the transaction-scoped lock only for its non-idempotent convert_lead
  // branch; set_lead_status and park_lead stay on the lock-free path.
  if (intent.resource_type === 'lead') {
    return commitLead(intent, viewer, input, required, idempotencyKey);
  }

  // send_first_contact is NON-IDEMPOTENT (a WhatsApp send), so its whole
  // critical section runs under the transaction-scoped advisory lock: with the
  // lock held the sibling recheck, the Modified_Time re-read and the
  // send-then-stamp are atomic against a concurrent commit of the same logical
  // change, which blocks then replays the committed sibling instead of sending
  // a second message. The idempotent deal kinds below stay on the lock-free
  // path (their PUT updateRecord is safe to repeat).
  if (intent.proposed_change.kind === 'send_first_contact') {
    return withXactIdempotencyLock(idempotencyKey, () =>
      commitFirstContact(intent, viewer, input, idempotencyKey),
    );
  }

  // Idempotent replay across change_ids: a committed sibling means the same
  // logical change already landed in Zoho under another change_id (a re-prepare,
  // or a concurrent commit that already finished). Replay its result, do NOT
  // write again, and mark this pending row expired so it does not stick. This
  // is the pre-write half of the no-double-write guarantee; the unique-index
  // backstop in markCommitted closes the concurrent-race window. Safe lock-free
  // here because the remaining deal kinds are idempotent PUT updateRecord calls.
  const sibling = await findCommittedSibling(idempotencyKey);
  if (sibling) {
    await markStatus(intent.id, 'expired');
    return sibling;
  }

  // Concurrency: re-read the deal and refuse if it changed since prepare, so a
  // cockpit write never clobbers an edit made directly in Zoho.
  const current = await readDeal(intent.resource_id);
  if (!current) {
    throw new NotFoundError('That deal no longer exists in Zoho.');
  }
  if (!sameModifiedTime(intent.base_modified_time, current.modifiedTime)) {
    await markStatus(intent.id, 'conflict');
    throw new ConflictError(
      'This deal changed in Zoho since you opened it. Prepare the change again to see the latest.',
    );
  }

  const fields = fieldsFor(intent.proposed_change);
  const writeResult = await getZohoWriteClient().updateRecord(
    'Deals',
    intent.resource_id,
    fields,
  );

  if (!writeResult.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_deals',
      entity_id: intent.resource_id,
      before: { modified_time: intent.base_modified_time },
      after: null,
      context: {
        change_id: intent.id,
        change_kind: intent.proposed_change.kind,
        zoho_code: writeResult.code,
        confirmations: input.confirmations,
      },
    });
    throw new ConflictError(
      'Zoho refused the write. Nothing was changed; try again or tell Al Saeed.',
    );
  }

  const result: CommitResult = {
    committed: true,
    change_list: [intent.change_list_text],
    resource_id: intent.resource_id,
  };

  // Mark committed with the unique-index backstop: a concurrent committer that
  // won the race makes this UPDATE trip 23505; the backstop returns that
  // committed sibling instead of a 500.
  const stored = await markCommitted(intent.id, idempotencyKey, result);
  if (stored !== result) {
    // A sibling won the race; its result was returned, so do not audit a second
    // commit row for this change_id.
    return stored;
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_deals',
    entity_id: intent.resource_id,
    before: { modified_time: intent.base_modified_time },
    after: { fields: Object.keys(fields) },
    context: {
      change_id: intent.id,
      change_kind: intent.proposed_change.kind,
      change_list: intent.change_list_text,
      confirmations: input.confirmations,
      confirmations_required: required,
      zoho_code: writeResult.code,
    },
  });

  return result;
}

/** The send-then-stamp commit for send_first_contact. Sends the fixed
 *  first-contact template to the patient's WhatsApp number, and only on a
 *  confirmed send writes the two stamp fields in one updateRecord call. A send
 *  failure audits and throws; it never stamps success. The patient number is
 *  read from the snapshot, passed to the port, and never logged, returned, or
 *  audited.
 *
 *  Runs inside withXactIdempotencyLock (send is non-idempotent), so the sibling
 *  recheck, the Modified_Time re-read and the send-then-stamp all happen with
 *  the lock held. A concurrent commit of the same logical change blocks on the
 *  lock, then this function returns and that commit finds the committed sibling
 *  and replays it instead of sending a second message. */
async function commitFirstContact(
  intent: IntentRow,
  viewer: RequestViewer,
  input: CommitInput,
  idempotencyKey: string,
): Promise<CommitResult> {
  // Inside-lock replay: a committed sibling means the same logical change
  // already sent and stamped under another change_id. Replay it, do NOT send
  // again, and mark this pending row expired so it does not stick.
  const sibling = await findCommittedSibling(idempotencyKey);
  if (sibling) {
    await markStatus(intent.id, 'expired');
    return sibling;
  }

  // Concurrency: re-read the deal (inside the lock) and refuse if it changed
  // since prepare, so a cockpit write never clobbers an edit made directly in
  // Zoho. The re-read also yields the patient mobile for the send.
  const current = await readDeal(intent.resource_id);
  if (!current) {
    throw new NotFoundError('That deal no longer exists in Zoho.');
  }
  if (!sameModifiedTime(intent.base_modified_time, current.modifiedTime)) {
    await markStatus(intent.id, 'conflict');
    throw new ConflictError(
      'This deal changed in Zoho since you opened it. Prepare the change again to see the latest.',
    );
  }

  // No number on file: audit a failure (no phone value) and refuse.
  if (!current.patientMobile) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.whatsapp.failed',
      entity_type: 'zoho_deals',
      entity_id: intent.resource_id,
      before: { modified_time: intent.base_modified_time },
      after: null,
      context: {
        change_id: intent.id,
        change_kind: intent.proposed_change.kind,
        reason: 'no_patient_phone',
      },
    });
    throw new ConflictError('No WhatsApp number on file for this patient.');
  }

  const result = await getWhatsApp().sendTemplate(
    current.patientMobile,
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
      entity_id: intent.resource_id,
      before: { modified_time: intent.base_modified_time },
      after: null,
      context: {
        change_id: intent.id,
        change_kind: intent.proposed_change.kind,
        provider_error: result.error ?? null,
      },
    });
    throw new ConflictError("Couldn't send on WhatsApp. Nothing was logged.");
  }

  // Sent: stamp the welcome-message date (Bahrain calendar date) and the
  // last-comm instant in one write.
  const fields: Record<string, unknown> = {
    [COCKPIT_DEAL_FIELDS.welcome_message_sent]: bahrainToday(),
    [COCKPIT_DEAL_FIELDS.last_patient_comm]: new Date().toISOString(),
  };
  const writeResult = await getZohoWriteClient().updateRecord(
    'Deals',
    intent.resource_id,
    fields,
  );

  if (!writeResult.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_deals',
      entity_id: intent.resource_id,
      before: { modified_time: intent.base_modified_time },
      after: null,
      context: {
        change_id: intent.id,
        change_kind: intent.proposed_change.kind,
        zoho_code: writeResult.code,
        confirmations: input.confirmations,
        provider_message_id: result.provider_message_id,
      },
    });
    throw new ConflictError(
      'Zoho refused the write. Nothing was changed; try again or tell Al Saeed.',
    );
  }

  const commitResult: CommitResult = {
    committed: true,
    change_list: [intent.change_list_text],
    resource_id: intent.resource_id,
  };

  // Mark committed with the unique-index backstop.
  const stored = await markCommitted(intent.id, idempotencyKey, commitResult);
  if (stored !== commitResult) {
    return stored;
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_deals',
    entity_id: intent.resource_id,
    before: { modified_time: intent.base_modified_time },
    after: { fields: Object.keys(fields) },
    context: {
      change_id: intent.id,
      change_kind: 'send_first_contact',
      change_list: intent.change_list_text,
      confirmations: input.confirmations,
      confirmations_required: confirmationsFor(intent.proposed_change),
      zoho_code: writeResult.code,
      provider_message_id: result.provider_message_id,
    },
  });

  return commitResult;
}

/** The convert_lead commit, run INSIDE withXactIdempotencyLock. convertLead is
 *  a non-idempotent POST (a repeat creates a SECOND deal), so the sibling
 *  recheck, the Modified_Time/converted re-read gate, the convert call and the
 *  markCommitted all happen with the transaction-scoped lock held. A concurrent
 *  commit of the same logical change blocks on the lock; when it proceeds it
 *  finds the committed sibling and replays it instead of converting again. On
 *  any throw the lock auto-releases at ROLLBACK and the pending row is left for
 *  a clean retry. The unique-index 23505 path in markCommitted remains as a
 *  defense-in-depth backstop. */
async function commitConvertLead(
  intent: IntentRow,
  viewer: RequestViewer,
  input: CommitInput,
  required: number,
  idempotencyKey: string,
): Promise<CommitResult> {
  // Inside-lock replay: a committed sibling means the same convert already
  // landed under another change_id. Replay it, do NOT convert again, and mark
  // this pending row expired so it does not stick.
  const sibling = await findCommittedSibling(idempotencyKey);
  if (sibling) {
    await markStatus(intent.id, 'expired');
    return sibling;
  }

  const current = await readLead(intent.resource_id);
  if (!current) {
    throw new NotFoundError('That lead no longer exists in Zoho.');
  }
  if (!sameModifiedTime(intent.base_modified_time, current.modifiedTime)) {
    await markStatus(intent.id, 'conflict');
    throw new ConflictError(
      'This lead changed in Zoho since you opened it. Prepare the change again to see the latest.',
    );
  }
  // A lead converted between prepare and commit cannot be re-worked.
  if (current.converted) {
    await markStatus(intent.id, 'conflict');
    throw new ConflictError(
      'This lead was converted in Zoho since you opened it.',
    );
  }

  const change = intent.proposed_change;
  if (change.kind !== 'convert_lead') {
    // Unreachable: only convert_lead is routed here. Keeps the type narrow.
    throw new BadRequestError('commitConvertLead handles convert_lead only.');
  }

  const convert = await getZohoWriteClient().convertLead(intent.resource_id, {
    Pipeline: change.pipeline,
    Stage: change.stage,
  });
  if (!convert.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_leads',
      entity_id: intent.resource_id,
      before: { modified_time: intent.base_modified_time },
      after: null,
      context: {
        change_id: intent.id,
        change_kind: change.kind,
        confirmations: input.confirmations,
      },
    });
    throw new ConflictError(
      'Zoho refused the conversion. Nothing was changed; try again or tell Al Saeed.',
    );
  }
  return finishLeadCommit(intent, viewer, input, required, idempotencyKey, {
    fields: ['Pipeline', 'Stage'],
    zohoCode: 'SUCCESS',
    newDealId: convert.dealId,
  });
}

/** Commit a lead change (convert_lead, set_lead_status, park_lead). convert_lead
 *  (non-idempotent) is routed to commitConvertLead under the transaction-scoped
 *  lock; set_lead_status and park_lead (idempotent Lead_Status PUTs) re-read the
 *  lead, refuse on a Modified_Time conflict or a now-converted lead, then write a
 *  single Lead_Status (plus Reason_Not_Qualified for a park) to the Leads module
 *  on the lock-free path. Audits field KEYS only; the lead phone is never read
 *  here. */
async function commitLead(
  intent: IntentRow,
  viewer: RequestViewer,
  input: CommitInput,
  required: number,
  idempotencyKey: string,
): Promise<CommitResult> {
  // convert_lead is NON-IDEMPOTENT (POST convertLead creates a deal, and a
  // repeat creates a SECOND deal), so its whole critical section runs under the
  // transaction-scoped advisory lock. set_lead_status and park_lead are
  // idempotent Lead_Status PUT updateRecord writes and stay on the lock-free
  // path below.
  if (intent.proposed_change.kind === 'convert_lead') {
    return withXactIdempotencyLock(idempotencyKey, () =>
      commitConvertLead(intent, viewer, input, required, idempotencyKey),
    );
  }

  // Idempotent replay across change_ids: a committed sibling means the same lead
  // change already landed under another change_id. Replay it, do NOT write
  // again, and mark this pending row expired so it does not stick.
  const sibling = await findCommittedSibling(idempotencyKey);
  if (sibling) {
    await markStatus(intent.id, 'expired');
    return sibling;
  }

  const current = await readLead(intent.resource_id);
  if (!current) {
    throw new NotFoundError('That lead no longer exists in Zoho.');
  }
  if (!sameModifiedTime(intent.base_modified_time, current.modifiedTime)) {
    await markStatus(intent.id, 'conflict');
    throw new ConflictError(
      'This lead changed in Zoho since you opened it. Prepare the change again to see the latest.',
    );
  }
  // A lead converted between prepare and commit cannot be re-worked.
  if (current.converted) {
    await markStatus(intent.id, 'conflict');
    throw new ConflictError(
      'This lead was converted in Zoho since you opened it.',
    );
  }

  const change = intent.proposed_change;

  // set_lead_status and park_lead are a single Lead_Status write (a park also
  // records the not-qualified reason). The field map is the allowlist; no other
  // field is written. The remaining kinds (deal kinds) cannot reach a lead
  // intent, but the guard keeps the switch exhaustive.
  let fields: Record<string, unknown>;
  if (change.kind === 'park_lead') {
    fields = {
      Lead_Status: 'Not Qualified',
      Reason_Not_Qualified: change.reason,
    };
  } else if (change.kind === 'set_lead_status') {
    fields = { Lead_Status: change.status };
  } else {
    throw new BadRequestError(
      'Only lead changes are committed by the lead path.',
    );
  }

  const writeResult = await getZohoWriteClient().updateRecord(
    'Leads',
    intent.resource_id,
    fields,
  );
  if (!writeResult.ok) {
    await getAudit().log({
      actor: viewer.key,
      actor_role: viewer.role,
      action: 'cockpit.write.failed',
      entity_type: 'zoho_leads',
      entity_id: intent.resource_id,
      before: { modified_time: intent.base_modified_time },
      after: null,
      context: {
        change_id: intent.id,
        change_kind: change.kind,
        zoho_code: writeResult.code,
        confirmations: input.confirmations,
      },
    });
    throw new ConflictError(
      'Zoho refused the write. Nothing was changed; try again or tell Al Saeed.',
    );
  }
  return finishLeadCommit(intent, viewer, input, required, idempotencyKey, {
    fields: Object.keys(fields),
    zohoCode: writeResult.code,
    newDealId: null,
  });
}

/** Mark a lead intent committed and write its audit row. Shared by the three
 *  lead commit paths. Audits field KEYS only (never the status text or the
 *  reason value); newDealId is the deal a convert produced, for the trail. */
async function finishLeadCommit(
  intent: IntentRow,
  viewer: RequestViewer,
  input: CommitInput,
  required: number,
  idempotencyKey: string,
  meta: { fields: string[]; zohoCode: string; newDealId: string | null },
): Promise<CommitResult> {
  const result: CommitResult = {
    committed: true,
    change_list: [intent.change_list_text],
    resource_id: intent.resource_id,
  };

  // Mark committed with the unique-index backstop.
  const stored = await markCommitted(intent.id, idempotencyKey, result);
  if (stored !== result) {
    return stored;
  }

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.write.commit',
    entity_type: 'zoho_leads',
    entity_id: intent.resource_id,
    before: { modified_time: intent.base_modified_time },
    after: { fields: meta.fields },
    context: {
      change_id: intent.id,
      change_kind: intent.proposed_change.kind,
      change_list: intent.change_list_text,
      confirmations: input.confirmations,
      confirmations_required: required,
      zoho_code: meta.zohoCode,
      new_deal_id: meta.newDealId,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Fresh, uncached single-deal read for the concurrency check. Pulls the gate
 *  fields plus Patient_Mobile, which the send path needs, and the progressive
 *  case fields (Patient_Budget and the treatment dates) so an edit_field change
 *  can phrase "change from X to Y". The mobile is patient data and lives only
 *  on the snapshot; the budget and dates are case data, not identifiers, and
 *  reach only the change-list text, never the audit. */
async function readDeal(id: string): Promise<DealSnapshot | null> {
  const res = await getZohoClient().get<{
    data?: Array<Record<string, unknown>>;
  }>(`${CRM}/Deals/${encodeURIComponent(id)}`, {
    fields:
      'Modified_Time,Stage,Pipeline,Next_Follow_up,Patient_Mobile,Patient_Budget,Treatment_Start_Date,Treatment_End_Date',
  });
  const record = res.data?.[0];
  if (!record) return null;
  return {
    id,
    modifiedTime: asString(record.Modified_Time),
    stage: asString(record.Stage),
    pipeline: asString(record.Pipeline),
    nextFollowUp: asString(record.Next_Follow_up),
    patientMobile: asString(record.Patient_Mobile),
    patientBudget: asNumber(record.Patient_Budget),
  };
}

/** Fresh, uncached single-lead read for the lead concurrency check and the
 *  converted gate. Pulls Modified_Time (the concurrency anchor), Lead_Status,
 *  Phone (patient data, carried for parity but never logged or audited), and
 *  Converted__s (the live Leads conversion flag, api_name Converted__s, label
 *  "Is Converted"; the bare "Converted" name does not exist on the module).
 *  Mirrors readDeal. */
async function readLead(id: string): Promise<LeadSnapshot | null> {
  const res = await getZohoClient().get<{
    data?: Array<Record<string, unknown>>;
  }>(`${CRM}/Leads/${encodeURIComponent(id)}`, {
    fields: 'Modified_Time,Lead_Status,Phone,Converted__s',
  });
  const record = res.data?.[0];
  if (!record) return null;
  return {
    id,
    modifiedTime: asString(record.Modified_Time),
    leadStatus: asString(record.Lead_Status),
    phone: asString(record.Phone),
    converted: record.Converted__s === true,
  };
}

async function loadIntent(changeId: string): Promise<IntentRow | null> {
  const { rows } = await getPool().query<IntentRow>(
    `select id, actor_user_id, resource_type, resource_id, proposed_change,
            change_list_text, base_modified_time, status, result, expires_at
     from write_intents where id = $1`,
    [changeId],
  );
  return rows[0] ?? null;
}

async function markStatus(
  changeId: string,
  status: 'expired' | 'conflict',
): Promise<void> {
  await getPool().query(
    `update write_intents set status = $2 where id = $1`,
    [changeId, status],
  );
}

/** Serialize the commit critical section for a NON-IDEMPOTENT change kind
 *  (convert_lead, send_first_contact) on its logical change, using a
 *  TRANSACTION-scoped advisory lock. The lock-free path (findCommittedSibling
 *  replay plus the post-write unique-index 23505 backstop) is correct for the
 *  idempotent kinds, but it cannot prevent a double Zoho write for these two:
 *  two concurrent commits of the same logical change can both pass
 *  findCommittedSibling and the Modified_Time re-read, then BOTH issue the
 *  non-idempotent Zoho call (a duplicate deal from convertLead, or a second
 *  WhatsApp message) before the unique index catches the loser. Holding this
 *  lock makes the inside-lock recheck-replay-or-write authoritative: the
 *  concurrent committer blocks at pg_advisory_xact_lock, then sees the committed
 *  sibling and replays without a second Zoho call.
 *
 *  Unlike the removed SESSION-scoped pg_advisory_lock, a transaction-scoped lock
 *  is serverless-safe and needs NO migration. The whole BEGIN..COMMIT runs on
 *  ONE checked-out client, so under PgBouncer/Supavisor transaction mode the
 *  lock is taken and auto-released on the same backend; pg_advisory_xact_lock
 *  also releases automatically at COMMIT or ROLLBACK, so a thrown error inside
 *  fn() (ConflictError, NotFoundError, a Zoho failure) rolls back and frees the
 *  lock, leaving the pending row intact for a clean retry. fn() keeps using
 *  getPool().query for its reads/writes: while this client holds the lock any
 *  concurrent commit of the same key blocks at its own pg_advisory_xact_lock, so
 *  there is no concurrent access to serialize inside. Holding the connection
 *  across the Zoho HTTP call is acceptable here: these commits are infrequent
 *  (human confirmations) and the Zoho client carries a 15s timeout. */
async function withXactIdempotencyLock<T>(
  idempotencyKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      idempotencyKey,
    ]);
    const out = await fn();
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may already be unusable; release below still runs and
      // the xact lock is freed when the backend ends the aborted transaction.
    }
    throw err;
  } finally {
    client.release();
  }
}

/** The stored result of an already-committed sibling for this logical change,
 *  found by its deterministic idempotency_key. A committed sibling means the
 *  same change already landed in Zoho under another change_id (a re-prepare, or
 *  a concurrent commit), so the caller must replay this result instead of
 *  writing again. Returns null when no committed sibling exists. */
async function findCommittedSibling(
  idempotencyKey: string,
): Promise<CommitResult | null> {
  const { rows } = await getPool().query<{ result: CommitResult | null }>(
    `select result from write_intents
     where idempotency_key = $1 and status = 'committed'
     limit 1`,
    [idempotencyKey],
  );
  return rows[0]?.result ?? null;
}

/** Mark a pending intent committed and store its result in ONE statement, with
 *  the partial unique index write_intents_committed_idem as the authoritative
 *  serializer and graceful backstop. This is the idempotency rework: the
 *  backend held a session advisory lock across the whole commit; here the
 *  unique index does the serializing. If a concurrent commit already committed
 *  a sibling for this logical change, this UPDATE trips the partial unique
 *  index and Postgres raises a unique violation (SQLSTATE 23505); rather than
 *  surfacing a 500 or double-writing, fetch the committed sibling and return
 *  its stored result. The current pending row is then marked expired so the
 *  table does not keep a stuck pending row. No advisory lock, no pinned
 *  pool.connect() session: every query goes through getPool(), so this is safe
 *  on the serverless transaction pooler. */
async function markCommitted(
  intentId: string,
  idempotencyKey: string,
  result: CommitResult,
): Promise<CommitResult> {
  try {
    await getPool().query(
      `update write_intents
       set status = 'committed', result = $2, committed_at = now()
       where id = $1`,
      [intentId, JSON.stringify(result)],
    );
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const sibling = await findCommittedSibling(idempotencyKey);
      if (sibling) {
        await markStatus(intentId, 'expired');
        return sibling;
      }
    }
    throw err;
  }
}

/** Opportunistic, non-blocking retention sweep. write_intents rows retain
 *  proposed-change JSON (which can include free-text reasons), so they are not
 *  kept forever: terminal non-committed rows go after 7 days, committed rows
 *  after 30. Invoked from prepare and never allowed to break it; any error is
 *  swallowed. Cheap: a single bounded delete. */
async function sweepExpiredIntents(): Promise<void> {
  try {
    await getPool().query(
      `delete from write_intents
       where (status in ('expired', 'conflict')
              and created_at < now() - interval '7 days')
          or (status = 'committed'
              and committed_at < now() - interval '30 days')`,
    );
  } catch {
    // A sweep failure must never break a prepare. Swallow and move on.
  }
}

/** The Zoho field payload for a change, drawn only from the allowlist. */
function fieldsFor(change: ProposedChange): Record<string, unknown> {
  switch (change.kind) {
    case 'set_follow_up':
      return { [CHANGE_FIELD.set_follow_up]: change.date };
    case 'move_stage': {
      const fields: Record<string, unknown> = {
        [CHANGE_FIELD.move_stage]: change.to_stage,
      };
      // A move into Lost also writes the reason; prepare has already validated
      // it against LOSS_REASONS.
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
      // were validated at prepare by isValidEditValue.
      const value =
        spec.type === 'currency' ? Number(change.value) : change.value;
      return { [spec.field]: value };
    }
    case 'send_first_contact':
      // send_first_contact does its own send-then-stamp write in
      // commitFirstContact and never reaches the generic single-field path.
      throw new BadRequestError(
        'send_first_contact is committed by its own send path.',
      );
    case 'convert_lead':
    case 'set_lead_status':
    case 'park_lead':
      // Lead kinds are committed by commitLead and never reach this Deals field
      // path.
      throw new BadRequestError(
        'Lead changes are committed by their own lead path.',
      );
  }
}

/** High-impact moves need a second confirmation. Setting a follow-up date is
 *  single-confirm; a move to Lost is double. */
function confirmationsFor(change: ProposedChange): number {
  if (change.kind === 'move_stage' && change.to_stage === 'Lost / Inactive') {
    return 2;
  }
  return 1;
}

/** Two Modified_Time values are the same instant, tolerating format/zone
 *  differences (Zoho ISO vs the timestamptz round-trip). Both null is same; one
 *  null is a conflict. */
function sameModifiedTime(a: Date | string | null, b: string | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const at = a instanceof Date ? a.getTime() : new Date(a).getTime();
  const bt = new Date(b).getTime();
  if (Number.isNaN(at) || Number.isNaN(bt)) return false;
  return at === bt;
}

/** True when an error is a Postgres unique-violation (SQLSTATE 23505), so the
 *  mark-committed backstop can tell a partial-unique-index collision (the
 *  concurrent commit case) from any other failure. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === '23505'
  );
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

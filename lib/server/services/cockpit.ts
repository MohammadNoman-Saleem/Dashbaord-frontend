// The cockpit assembles the medical-travel case manager's working view from
// live CRM reads: the SLA-sorted queue, the per-case file, the parked pool,
// and the authored SLA policy. It owns no SLA logic of its own; sla.ts is the
// pure engine and this service is the data plumbing and the privacy gating.
//
// Ported from the NestJS backend src/cockpit/cockpit.service.ts. The
// @Injectable CockpitService with its CrmReadService and PatientSerializer
// constructor injections becomes a plain exported object whose methods read the
// foundation singletons: getCrmRead() for the cached CRM reads and the shared
// patientSerializer instance for the per-field patient gate. Every type, DTO,
// label table and piece of business logic is unchanged; only the DI seam moved.
//
// Case population (cockpit-sla-spec.md, Data sourcing): active Treatment and
// Telemedicine deals are the post-conversion cases; active unconverted leads
// are the pre-conversion cases. Each is keyed by its own Zoho id. There is no
// clean lead-to-deal link field in the cached reads, so a converted lead and
// its deal are not merged: the deal carries the case forward and the lead row
// drops out once Converted is true (it would otherwise double-count). Flagged
// for the lead in the PR.
//
// Privacy (NHRA, compliance-critical): every row carries a patient_ref (id plus
// initials) from the patientSerializer. patient_name is appended only for
// viewers who hold sees_patient_names (Fatima, Razan), and the handler's global
// sweep removes any that slip through. The condition shows the specialty-group
// label for everyone; the raw patient-typed concern is added only for name
// seers. patient_phone and the WhatsApp message on the case file are gated the
// same way. Patient values are never logged here.
//
// SERVER ONLY. Node runtime (it reaches pg/Zoho through getCrmRead()).
import { getCrmRead } from '../crm-read';
import type { DealRecord, LeadRecord } from '../crm-read';
import { patientSerializer, type PatientRef } from '../privacy';
import {
  destinationGroupOf,
  inferOrigin,
  specialtyGroupOf,
} from '../classification';
import type { SourceMeta } from '../envelope';
import type { RequestViewer } from '../auth/viewer';
import {
  COCKPIT_STEP_ORDER,
  SLA_POLICY,
  STEP_LABEL,
  governingClock,
  providerClocks,
  stepOf,
  stepperFor,
  type ClockInputs,
  type ClockKind,
  type ClockResult,
  type CockpitStep,
} from './sla';

// Authored display labels for specialty groups (mirrors leads.service). The
// queue and case file show these to everyone; the patient's own words are
// health information and reach only Fatima and Razan.
const SPECIALTY_DISPLAY: Record<string, string> = {
  neuro_spine_rehab: 'Neuro, spine and rehab',
  orthopedics: 'Orthopedics',
  gastro: 'Digestive health',
  cosmetic: 'Cosmetic',
  womens_health: 'Womens health',
  other: 'Other',
};

// Step-appropriate WhatsApp pre-fill copy for the case file. Plain, NON-CLINICAL
// logistics only: no diagnosis, no medication, no lab or treatment advice. The
// frontend pre-fills the line for the case's current step into a wa.me link; the
// case manager edits and sends it. COPY PENDING RAZAN REVIEW (draft, not final).
const WHATSAPP_STEP_MESSAGE: Record<CockpitStep, string> = {
  first_contact:
    'Hello, this is Saleem. Thank you for reaching out. Could we set up a short intro call to understand how we can help?',
  info_collected:
    'Hello, this is Saleem following up. Could you share the documents we discussed so we can move ahead?',
  partner_quotes:
    'Hello, this is Saleem. We are arranging the details with our partner and will update you shortly.',
  quotation:
    'Hello, this is Saleem. We have shared your quotation. Please let us know if you have any questions.',
  decision:
    'Hello, this is Saleem following up on your treatment quotation. Could you let us know how you would like to proceed?',
  treatment:
    'Hello, this is Saleem checking in on your arrangements. Please let us know if you need anything.',
  parked:
    'Hello, this is Saleem reaching back out. Let us know if you would like to pick things up again.',
};

const PATIENT_PIPELINES = ['Treatment', 'Telemedicine'];

// Parked pagination defaults. The active queue paginates client-side (one
// payload), so only the parked pool needs server-side paging.
const PARKED_PAGE_SIZE_DEFAULT = 12;
const PARKED_PAGE_SIZE_MAX = 50;

// The cockpit's reference shape. It carries the internal record id (zoho_id,
// the case-file lookup key, never shown) plus the human reference the team
// reads (ref). ref_is_fallback is true when the record had no Zoho_ID and ref
// holds the internal id as an honest stand-in rather than an invented number.
export interface CockpitRef extends PatientRef {
  ref: string;
  ref_is_fallback: boolean;
}

// The queue and parked tabs split on these two fields. record_type marks
// whether the row started as an unconverted lead or a deal; pipeline carries
// the deal's Treatment vs Telemedicine grouping and is null for leads, which
// have no pipeline. Both come straight from the NormalizedCase, which already
// knows it was built fromDeal or fromLead and carries the deal's Pipeline. No
// SLA or population logic reads them: they exist only so the frontend can group
// rows into the Leads and Deals tabs and the Treatment and Telemedicine
// sub-tabs.
export type CockpitRecordType = 'lead' | 'deal';
export type CockpitPipeline = 'Treatment' | 'Telemedicine';

export interface QueueItem {
  lead_ref: CockpitRef;
  patient_name?: string;
  step: string;
  next_action: string;
  route: string;
  condition: string;
  due: { label: string; tone: ClockResult['tone']; kind: ClockKind };
  sla_key: string;
  approx: boolean;
  record_type: CockpitRecordType;
  pipeline: CockpitPipeline | null;
}

export interface CockpitTiles {
  due_now: { count: number; note: string };
  due_today: { count: number; note: string };
  waiting_partners: { count: number; note: string };
  parked: { count: number; note: string };
}

export interface QueuePayload {
  tiles: CockpitTiles;
  active: QueueItem[];
  parked_count: number;
}

export interface ParkedRow {
  lead_ref: CockpitRef;
  patient_name?: string;
  parked_date: string;
  reason: string;
  revival_nudge: { label: string; tone: ClockResult['tone'] } | null;
  record_type: CockpitRecordType;
  pipeline: CockpitPipeline | null;
}

// Parked tab buckets the frontend can ask the parked endpoint to paginate
// within. leads is the Not-Qualified lead pool; deals_treatment and
// deals_telemedicine are the Lost or Inactive deals split by pipeline. No
// bucket (the default) returns the whole pool, as before, for back-compat.
export type ParkedBucket = 'leads' | 'deals_treatment' | 'deals_telemedicine';

export interface ParkedPayload {
  rows: ParkedRow[];
  page: number;
  pages: number;
  total: number;
}

export interface CaseFile {
  lead_ref: CockpitRef;
  patient_name?: string;
  // The patient WhatsApp number and a step-appropriate logistics message, both
  // patient data: gated to name-seers exactly like patient_name, so they appear
  // only for viewers who hold sees_patient_names. The frontend builds a wa.me
  // link from the number and pre-fills the message; the case manager edits and
  // sends. Absent (undefined) for non-name-seers; null when there is no number.
  patient_phone?: string | null;
  whatsapp_message?: string | null;
  // The raw Lead_Status for lead cases (null for deals). NOT gated: it is a
  // workflow status, not patient data. Backs the frontend's lead-status control.
  lead_status: string | null;
  route: string;
  condition: string;
  source: string;
  // Whether this case is a deal or an unconverted lead, and the deal's current
  // next-follow-up date. The write gate's set-follow-up control reads both: it
  // shows only for deals (leads have no Next_Follow_up field) and prefills the
  // current date.
  record_type: CockpitRecordType;
  next_follow_up: string | null;
  // The deal's raw Zoho stage and pipeline, surfaced so the frontend's
  // stage-move control knows where the deal sits and which pipeline's targets
  // to request. Both are null for leads, which have neither.
  stage: string | null;
  pipeline: CockpitPipeline | null;
  // Progressive case fields the write gate's edit_field control reads and
  // edits: the patient's stated budget (BHD) and the treatment start and end
  // dates. Case data, not identifiers. All null for leads, which carry none.
  patient_budget: number | null;
  treatment_start: string | null;
  treatment_end: string | null;
  in_funnel_days: number;
  step_current: string;
  steps: Array<{ key: string; label: string; state: 'done' | 'cur' | 'todo' }>;
  next_action: {
    label: string;
    due_label: string;
    sla_rule: string;
    approx: boolean;
    draft_message: null;
  };
  details: Array<{ k: string; v: string }>;
  checklist: Array<{ label: string; done: boolean; date: string | null }>;
  notes: Array<{ title: string; body: string; source: string }>;
  partners: Array<{ label: string; detail: string; state: string }>;
  documents: Array<{ label: string; detail: string; status: string }>;
  activity: Array<{ label: string; detail: string }>;
}

// A normalized case the engine and the serializers read, built from either a
// Lead or a Deal so the rest of the service handles one shape.
interface NormalizedCase {
  // The internal Zoho record id. Stays the case-file lookup key; never shown.
  zoho_id: string;
  // The human Zoho reference the team identifies records by (Leads autonumber
  // "Zoho Lead ID", Deals text "Zoho ID"). Null when the record has none, in
  // which case the cockpit falls back to the record id and marks the fallback.
  ref: string | null;
  patient_name: string | null;
  step: CockpitStep;
  origin: string;
  destination: string | null;
  concernRaw: string | null;
  specialtyLabel: string;
  source: string;
  createdTime: string | null;
  ownerKey: string | null;
  clockInputs: ClockInputs;
  reasonNotQualified: string | null;
  // Current next-follow-up date (Deals Next_Follow_up), or null. Surfaced so
  // the case file can show it and the write gate's set-follow-up control can
  // edit it. Leads carry no such field, so it is null for lead cases.
  nextFollowUp: string | null;
  // The deal's raw Zoho stage (Deals Stage), or null for leads. Surfaced on the
  // case file so the stage-move control knows the current stage. Separate from
  // the cockpit step, which is a derived label.
  stage: string | null;
  // Progressive case fields surfaced on the case file and edited by the write
  // gate's edit_field control: the patient's stated budget (BHD) and the
  // treatment start and end dates. All null for leads, which carry none.
  patientBudget: number | null;
  treatmentStart: string | null;
  treatmentEnd: string | null;
  // The patient WhatsApp number (Deals Patient_Mobile or the lead Phone), or
  // null when absent. Patient data: it reaches only the name-seer case file and
  // is never logged. The raw lead status (Leads Lead_Status), or null for deals;
  // a workflow status, not an identifier, so it is surfaced ungated.
  patientPhone: string | null;
  leadStatus: string | null;
  // Tab-split fields. recordType is 'deal' for cases built fromDeal and 'lead'
  // for cases built fromLead. pipeline carries the deal's Treatment or
  // Telemedicine grouping; it is null for leads, which have no pipeline.
  recordType: CockpitRecordType;
  pipeline: CockpitPipeline | null;
}

const BAHRAIN_TZ = 'Asia/Bahrain';
const DAY_MS = 24 * 60 * 60 * 1000;

function bahrainDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    timeZone: BAHRAIN_TZ,
    month: 'short',
    day: 'numeric',
  });
}

// Map a Zoho owner display name to the lower-case person key the cockpit
// filters on. The known case managers; an unmatched owner returns null so the
// person filter excludes it rather than mis-attributing.
function ownerKeyOf(ownerName: string | null | undefined): string | null {
  const name = (ownerName ?? '').toLowerCase();
  if (name.includes('fatema') || name.includes('fatima')) return 'fatima';
  if (name.includes('razan')) return 'razan';
  return null;
}

// Narrow a deal's raw Pipeline string to the cockpit's two-value pipeline. Deal
// cases reach this only after population() filtered on PATIENT_PIPELINES, so the
// value is normally Treatment or Telemedicine. Anything else returns null
// rather than a guessed grouping, keeping the no-fabrication rule.
function pipelineOf(
  pipeline: string | null | undefined,
): CockpitPipeline | null {
  if (pipeline === 'Treatment' || pipeline === 'Telemedicine') return pipeline;
  return null;
}

// -------------------------------------------------------------------------
// Case population assembly. Active deals in the patient pipelines, plus
// unconverted leads, normalized to one shape.
// -------------------------------------------------------------------------

async function population(): Promise<{
  cases: NormalizedCase[];
  parts: SourceMeta[];
}> {
  const crm = getCrmRead();
  const [dealsRead, leadsRead] = await Promise.all([crm.deals(), crm.leads()]);

  const dealCases = dealsRead.data
    .filter((d) => PATIENT_PIPELINES.includes(d.Pipeline ?? ''))
    .map((d) => fromDeal(d));

  // Unconverted leads only: a converted lead is carried by its deal.
  const leadCases = leadsRead.data
    .filter((l) => !l.Converted)
    .map((l) => fromLead(l));

  return {
    cases: [...dealCases, ...leadCases],
    parts: [dealsRead.meta, leadsRead.meta],
  };
}

function fromDeal(d: DealRecord): NormalizedCase {
  const step = stepOf({
    leadStatus: null,
    dealStage: d.Stage,
    hasDeal: true,
  });
  const concernRaw = d.Main_Concern_Reason_for_Consultation;
  const specialty = specialtyGroupOf(concernRaw);
  // Deals carry no phone in the cached read and Country is usually null, so
  // origin is mostly "Origin not set"; honest, never invented.
  const origin = inferOrigin(d.Country, null);
  return {
    zoho_id: d.id,
    ref: (d.Zoho_ID ?? '').trim() || null,
    patient_name: d.Contact_Name?.name ?? d.Deal_Name ?? null,
    step,
    origin: origin.country === 'Unknown' ? 'Origin not set' : origin.country,
    destination: destinationGroupOf(
      d.Prefered_Country_of_Treatment_Consultation,
    ),
    concernRaw,
    specialtyLabel: specialty ? SPECIALTY_DISPLAY[specialty] : 'Not specified',
    source: d.Lead_Source ?? 'Not set',
    createdTime: d.Created_Time,
    ownerKey: ownerKeyOf(d.Owner?.name),
    reasonNotQualified: d.Reason_Not_Qualified,
    nextFollowUp: d.Next_Follow_up,
    stage: d.Stage ?? null,
    patientBudget: d.Patient_Budget,
    treatmentStart: d.Treatment_Start_Date,
    treatmentEnd: d.Treatment_End_Date,
    patientPhone: (d.Patient_Mobile ?? '').trim() || null,
    leadStatus: null,
    recordType: 'deal',
    // population() only builds deal cases for deals whose Pipeline is in
    // PATIENT_PIPELINES (Treatment or Telemedicine), so this is always one of
    // the two; the helper narrows defensively and never invents a value.
    pipeline: pipelineOf(d.Pipeline),
    clockInputs: {
      step,
      createdTime: d.Created_Time,
      lastActivityTime: d.Last_Activity_Time,
      introCallDateTime: d.Intro_Call_Date_Time,
      welcomeMessageSentDate: d.Welcome_Message_Sent_Date,
      stageEntryDate: d.Stage_Entry_Date,
      lastPatientCommDate: d.Last_Patient_Comm_Date,
      reasonNotQualified: d.Reason_Not_Qualified,
    },
  };
}

function fromLead(l: LeadRecord): NormalizedCase {
  const step = stepOf({
    leadStatus: l.Lead_Status,
    dealStage: null,
    hasDeal: false,
  });
  const concernRaw = l.Main_Concern_Reason_for_Consultation;
  const specialty = specialtyGroupOf(concernRaw);
  const origin = inferOrigin(l.Country, l.Phone);
  const fullName = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
  return {
    zoho_id: l.id,
    ref: (l.Zoho_ID ?? '').trim() || null,
    patient_name: fullName || null,
    step,
    origin: origin.country === 'Unknown' ? 'Origin not set' : origin.country,
    destination: destinationGroupOf(
      l.Prefered_Country_of_Treatment_Consultation,
    ),
    concernRaw,
    specialtyLabel: specialty ? SPECIALTY_DISPLAY[specialty] : 'Not specified',
    source: l.Lead_Source ?? 'Not set',
    createdTime: l.Created_Time,
    ownerKey: ownerKeyOf(l.Owner?.name),
    reasonNotQualified: l.Reason_Not_Qualified,
    nextFollowUp: null,
    stage: null,
    patientBudget: null,
    treatmentStart: null,
    treatmentEnd: null,
    patientPhone: (l.Phone ?? '').trim() || null,
    leadStatus: l.Lead_Status,
    recordType: 'lead',
    pipeline: null,
    clockInputs: {
      step,
      createdTime: l.Created_Time,
      lastActivityTime: l.Last_Activity_Time,
      introCallDateTime: l.Intro_Call_Date_Time,
      welcomeMessageSentDate: null,
      stageEntryDate: null,
      lastPatientCommDate: null,
      reasonNotQualified: l.Reason_Not_Qualified,
    },
  };
}

// person filters by the case-manager owner. An empty or "all" person keeps
// every case; the cockpit's two managers (Fatima, Razan) and the ops lead
// (Khalid, who owns none directly) read the whole pool.
function matchesPerson(c: NormalizedCase, person: string): boolean {
  if (!person || person === 'all') return true;
  if (person === 'fatima' || person === 'razan') {
    return c.ownerKey === person;
  }
  return true;
}

// The cockpit rows key the patient reference as lead_ref (per the spec API
// contract), while patientSerializer.withName gates on a patient_ref key.
// This helper applies the identical capability gate for the lead_ref shape:
// patient_name is appended only for viewers who see patient names, and the
// handler's global sweep still removes any that slip through.
function withPatientName<T extends { lead_ref: PatientRef }>(
  row: T,
  name: string | null,
  viewer: RequestViewer,
): T & { patient_name?: string } {
  if (viewer.sees_patient_names && name) {
    return { ...row, patient_name: name };
  }
  return row;
}

// Build the cockpit reference for a case: initials and patient name gating
// come from patientSerializer.ref (unchanged, internal record id as zoho_id),
// then the human ref is layered on. When the record carries no Zoho_ID the
// ref falls back to the internal id and ref_is_fallback flags it, so the UI
// can mark a fallback rather than passing it off as a real Zoho number.
function cockpitRef(c: NormalizedCase): CockpitRef {
  const base = patientSerializer.ref(c.zoho_id, c.patient_name);
  return {
    ...base,
    ref: c.ref ?? c.zoho_id,
    ref_is_fallback: c.ref == null,
  };
}

function routeOf(c: NormalizedCase): string {
  return `${c.origin} to ${c.destination ?? 'Destination not set'}`;
}

// The condition string: specialty label for everyone, raw concern only for
// viewers who see patient names (Fatima, Razan).
function conditionOf(c: NormalizedCase, viewer: RequestViewer): string {
  if (viewer.sees_patient_names && c.concernRaw && c.concernRaw.trim()) {
    return c.concernRaw.trim();
  }
  return c.specialtyLabel;
}

// -------------------------------------------------------------------------
// Queue
// -------------------------------------------------------------------------

async function queue(
  person: string,
  viewer: RequestViewer,
): Promise<{ data: QueuePayload; parts: SourceMeta[] }> {
  const { cases, parts } = await population();
  const now = new Date();
  const mine = cases.filter((c) => matchesPerson(c, person));

  const parked = mine.filter((c) => c.step === 'parked');
  const active = mine.filter((c) => c.step !== 'parked');

  const rows = active
    .map((c) => {
      const clock = governingClock(c.clockInputs, now);
      return { c, clock };
    })
    .sort((a, b) => kindRank(a.clock.kind) - kindRank(b.clock.kind));

  const items: QueueItem[] = rows.map(({ c, clock }) => {
    const base: QueueItem = {
      lead_ref: cockpitRef(c),
      step: STEP_LABEL[c.step],
      next_action: nextActionLine(c.step),
      route: routeOf(c),
      condition: conditionOf(c, viewer),
      due: { label: clock.due_label, tone: clock.tone, kind: clock.kind },
      sla_key: clock.sla_key,
      approx: clock.approx,
      record_type: c.recordType,
      pipeline: c.pipeline,
    };
    return withPatientName(base, c.patient_name, viewer);
  });

  const dueNow = items.filter((i) => i.due.kind === 'due_now');
  const dueToday = items.filter((i) => i.due.kind === 'due_today');
  const waitingPartners = rows.filter(({ c }) => c.step === 'partner_quotes');

  const tiles: CockpitTiles = {
    due_now: {
      count: dueNow.length,
      note:
        dueNow.length === 0
          ? 'Nothing past its deadline right now'
          : `${dueNow.length} past the deadline, oldest first`,
    },
    due_today: {
      count: dueToday.length,
      note:
        dueToday.length === 0
          ? 'Nothing else falls due today'
          : `${dueToday.length} due later today`,
    },
    waiting_partners: {
      count: waitingPartners.length,
      note:
        waitingPartners.length === 0
          ? 'No cases waiting on a partner quote'
          : 'Partner clocks are approximate, no request field in Zoho yet',
    },
    parked: {
      count: parked.length,
      note:
        parked.length === 0
          ? 'No parked leads'
          : `${parked.length} parked, a way back for each`,
    },
  };

  return {
    data: { tiles, active: items, parked_count: parked.length },
    parts,
  };
}

// -------------------------------------------------------------------------
// Parked
// -------------------------------------------------------------------------

async function parked(
  person: string,
  viewer: RequestViewer,
  page = 1,
  pageSize = PARKED_PAGE_SIZE_DEFAULT,
  bucket?: ParkedBucket,
): Promise<{ data: ParkedPayload; parts: SourceMeta[] }> {
  const { cases, parts } = await population();
  const parkedPool = cases
    .filter((c) => matchesPerson(c, person))
    .filter((c) => c.step === 'parked');

  // Pagination runs within the active tab. When a bucket is given, the pool
  // is narrowed to that tab first so total, pages and the slice all count
  // inside the selection (so the 439-row pool paginates per tab, not across
  // it). With no bucket the whole parked pool is returned as before, keeping
  // the endpoint back-compatible. Parked leads are the Not-Qualified leads;
  // parked deals are the Lost or Inactive deals, split by pipeline.
  const mine = bucket
    ? parkedPool.filter((c) =>
        matchesParkedBucket(c.recordType, c.pipeline, bucket),
      )
    : parkedPool;

  // Server-side pagination: the parked pool is large (439 rows live), so the
  // whole pool is not shipped at once. page_size is clamped to a sane band
  // and page to the available range. total reflects the selected pool.
  const total = mine.length;
  const size = Math.min(
    PARKED_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(pageSize) || PARKED_PAGE_SIZE_DEFAULT),
  );
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const slice = mine.slice(start, start + size);

  const rows: ParkedRow[] = slice.map((c) => {
    const base: ParkedRow = {
      lead_ref: cockpitRef(c),
      parked_date: bahrainDate(c.createdTime) || 'Date not set',
      reason: (c.reasonNotQualified ?? '').trim() || 'Reason not recorded',
      // Revival nudge scheduling is not tracked in Zoho yet; null with no
      // invented date, per the honesty rule.
      revival_nudge: null,
      record_type: c.recordType,
      pipeline: c.pipeline,
    };
    return withPatientName(base, c.patient_name, viewer);
  });

  return { data: { rows, page: current, pages, total }, parts };
}

// -------------------------------------------------------------------------
// Case file
// -------------------------------------------------------------------------

async function caseFile(
  id: string,
  viewer: RequestViewer,
): Promise<{ data: CaseFile | null; parts: SourceMeta[] }> {
  const { cases, parts } = await population();
  const found = cases.find((c) => c.zoho_id === id);
  if (!found) return { data: null, parts };

  const now = new Date();
  const clock = governingClock(found.clockInputs, now);
  const inFunnelDays = found.createdTime
    ? Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(found.createdTime).getTime()) / DAY_MS,
        ),
      )
    : 0;

  const details: Array<{ k: string; v: string }> = [
    { k: 'Condition', v: conditionOf(found, viewer) },
    { k: 'Destination', v: found.destination ?? 'Destination not set' },
    { k: 'Origin', v: found.origin },
    { k: 'Source', v: found.source },
  ];

  const base: CaseFile = {
    lead_ref: cockpitRef(found),
    // lead_status is ungated workflow data (null for deals). The patient_phone
    // and whatsapp_message fields are patient data and are layered on below
    // only for name-seers, mirroring the patient_name gate.
    lead_status: found.leadStatus,
    route: routeOf(found),
    condition: conditionOf(found, viewer),
    source: found.source,
    record_type: found.recordType,
    next_follow_up: found.nextFollowUp,
    stage: found.stage,
    pipeline: found.pipeline,
    patient_budget: found.patientBudget,
    treatment_start: found.treatmentStart,
    treatment_end: found.treatmentEnd,
    in_funnel_days: inFunnelDays,
    step_current: STEP_LABEL[found.step],
    steps: stepperFor(found.step),
    next_action: {
      label: nextActionLine(found.step),
      due_label: clock.due_label,
      sla_rule: slaRuleText(clock.sla_key),
      approx: clock.approx,
      draft_message: null,
    },
    details,
    // The checklist, notes, partners and documents are not modeled in the
    // cached CRM reads in v1. Rather than invent rows, the case file returns
    // empty lists; the frontend renders an honest empty state. Provider
    // clocks are surfaced as null partner rows per the spec.
    checklist: [],
    notes: [],
    partners: providerClocks().map((p) => ({
      label: p.label,
      detail: p.detail,
      state: p.state,
    })),
    documents: [],
    activity: [],
  };

  // patient_name, then patient_phone and the step WhatsApp message, are all
  // patient data gated to name-seers. The name is layered by withPatientName;
  // the phone and message are layered by withPatientContact right after, so a
  // non-name-seer's case file carries none of the three.
  const named = withPatientName(base, found.patient_name, viewer);
  return {
    data: withPatientContact(named, found, viewer),
    parts,
  };
}

// Append the patient WhatsApp number and the step-appropriate pre-fill message
// for viewers who see patient names, mirroring withPatientName. Both are
// patient data: a non-name-seer's case file omits them entirely. The message
// is non-clinical logistics copy keyed off the case's current step (pending
// Razan review); the phone may be null when no number is on file.
function withPatientContact(
  file: CaseFile,
  c: NormalizedCase,
  viewer: RequestViewer,
): CaseFile {
  if (!viewer.sees_patient_names) return file;
  return {
    ...file,
    patient_phone: c.patientPhone,
    whatsapp_message: WHATSAPP_STEP_MESSAGE[c.step],
  };
}

// -------------------------------------------------------------------------
// SLA policy: the authored tables, served verbatim, no upstream.
// -------------------------------------------------------------------------

function slaPolicy(): { data: typeof SLA_POLICY; parts: SourceMeta[] } {
  return { data: SLA_POLICY, parts: [] };
}

// -------------------------------------------------------------------------
// Copy helpers
// -------------------------------------------------------------------------

function nextActionLine(step: CockpitStep): string {
  switch (step) {
    case 'first_contact':
      return 'First contact: make the intro call';
    case 'info_collected':
      return 'Collecting info: chase the medical reports';
    case 'partner_quotes':
      return 'Partner chase: follow up on the quote request';
    case 'quotation':
      return 'Quotation follow-up: check the quote reached the patient';
    case 'decision':
      return 'Decision window: final response check';
    case 'treatment':
      return 'In treatment: keep the case warm';
    case 'parked':
    default:
      return 'Parked: revive when the time is right';
  }
}

function slaRuleText(slaKey: string): string {
  const all = [...SLA_POLICY.patient, ...SLA_POLICY.provider];
  const row = all.find((r) => r.key === slaKey);
  return row ? `${row.rule}, ${row.threshold_label}` : 'No SLA rule';
}

// Queue sort: due now first, then due today, then soon, then on track.
function kindRank(kind: ClockKind): number {
  switch (kind) {
    case 'due_now':
      return 0;
    case 'due_today':
      return 1;
    case 'soon':
      return 2;
    case 'on_track':
    default:
      return 3;
  }
}

// Does a parked row belong in the requested tab bucket? leads is every parked
// lead (the Not-Qualified pool); deals_treatment and deals_telemedicine are
// parked deals split by pipeline. A parked deal whose pipeline did not narrow
// to one of the two (null) falls into neither deals bucket rather than being
// guessed into one.
function matchesParkedBucket(
  recordType: CockpitRecordType,
  pipeline: CockpitPipeline | null,
  bucket: ParkedBucket,
): boolean {
  switch (bucket) {
    case 'leads':
      return recordType === 'lead';
    case 'deals_treatment':
      return recordType === 'deal' && pipeline === 'Treatment';
    case 'deals_telemedicine':
      return recordType === 'deal' && pipeline === 'Telemedicine';
    default:
      return false;
  }
}

// The cockpit service as a plain object, replacing the @Injectable
// CockpitService. The route handlers call these methods exactly as the Nest
// controller called the injected service.
export const cockpitService = {
  queue,
  parked,
  caseFile,
  slaPolicy,
};

// Re-export the step order for any caller that mirrored the controller's DTOs.
export { COCKPIT_STEP_ORDER };

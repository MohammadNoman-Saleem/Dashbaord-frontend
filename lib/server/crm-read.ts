// Typed, cached CRM reads shared by every pipeline-facing route (cockpit,
// pipeline, kpi, cases, marketing, leads, attention, financials). Ported from
// the NestJS backend src/integrations/zoho/crm-read.service.ts. The @Injectable
// class with its CacheService and ZohoClient dependencies becomes a
// globalThis-pinned singleton (g.__crmRead) taking the spine cache via
// getCache() and the Zoho read client via getZohoClient().
//
// Field names, module names, and stage vocabularies are the org-verified strings
// from the legacy dashboard. Aggregates are always tallied from raw record sets,
// never COQL grouped aggregates (known engine limitation). The CRM record DTOs
// are single-consumer (only this service and its route callers), so they live
// here rather than in lib/server/contracts.ts (which holds only cross-module
// types like KpiStripCardDto and SessionClaims).
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getCache, CacheService, type CachedRead } from './cache';
import { getZohoClient, ZohoClient } from './integrations/zoho/client';

const CRM = 'https://www.zohoapis.com/crm/v3';

export interface ZohoLookup {
  id?: string;
  name?: string;
}

export interface DealRecord {
  id: string;
  /** Human-readable Zoho reference the team identifies records by. On Deals
   *  this api_name is Zoho_ID (label "Zoho ID", a text field). Distinct from
   *  the internal record id above, which stays the lookup key. Often empty on
   *  older records, so the cockpit falls back to the record id and marks it. */
  Zoho_ID: string | null;
  Deal_Name: string | null;
  Stage: string | null;
  Amount: number | null;
  Pipeline: string | null;
  Created_Time: string | null;
  Modified_Time: string | null;
  Contact_Name: ZohoLookup | null;
  /** Next follow-up date (Deals field, api_name Next_Follow_up, a date). The
   *  earlier Next_Follow_Up__s name was wrong (no such field), so this read
   *  came back empty; corrected per the Zoho schema discovery 2026-06-17. */
  Next_Follow_up: string | null;
  Owner: ZohoLookup | null;
  Lead_Source: string | null;
  /** Close date set when a deal is won or lost; loss analytics bucket on it
   *  with Modified_Time as the fallback. */
  Closing_Date: string | null;
  /** Loss reason picklist on lost deals; null on open and won deals. */
  Reason_For_Loss__s: string | null;
  /** CRM layout (Customers, Provider, Corporates); drives kind. */
  Layout: ZohoLookup | null;
  /** Destination on Treatment deals: a multiselect picklist; drives locality. */
  Prefered_Country_of_Treatment_Consultation: string | string[] | null;
  /** Country on Provider-layout deals; drives provider scope. */
  Country: string | null;
  /** Zoho per-deal win probability, 0 to 100. Often unset; the forecast falls
   *  back to the pipeline's historical win rate. */
  Probability: number | null;
  /** Cockpit SLA event fields on Deals. Stage_Entry_Date drives the reports and
   *  quote-follow-up proxies; Welcome_Message_Sent_Date and
   *  Last_Patient_Comm_Date are the precise anchors when populated. */
  Stage_Entry_Date: string | null;
  Last_Patient_Comm_Date: string | null;
  Welcome_Message_Sent_Date: string | null;
  Main_Concern_Reason_for_Consultation: string | null;
  Reason_Not_Qualified: string | null;
  Last_Activity_Time: string | null;
  Intro_Call_Date_Time: string | null;
  /** Progressive case fields the cockpit surfaces and the write gate edits: the
   *  patient's stated budget (currency, BHD) and the treatment start and end
   *  dates. Case data, not identifiers. */
  Patient_Budget: number | null;
  Treatment_Start_Date: string | null;
  Treatment_End_Date: string | null;
  /** Patient WhatsApp number on the deal (Deals field Patient_Mobile). Patient
   *  data: only the cockpit send path and the name-seer case file ever touch it,
   *  and it is never logged or audited. */
  Patient_Mobile: string | null;
  /** Tags on the record (Zoho Tag field, an array of { name }). Requested only
   *  by the single-record case reads (dealById/leadById), so it is optional and
   *  absent on the cached list reads. The case file maps these to tag names. */
  Tag?: Array<{ name?: string | null }> | null;
}

export interface LeadRecord {
  id: string;
  /** Human-readable Zoho reference the team identifies records by. On Leads
   *  this api_name is Zoho_ID (label "Zoho Lead ID", an autonumber). Distinct
   *  from the internal record id above, which stays the lookup key. Can be
   *  empty, so the cockpit falls back to the record id and marks the fallback. */
  Zoho_ID: string | null;
  First_Name: string | null;
  Last_Name: string | null;
  Email: string | null;
  Lead_Source: string | null;
  Lead_Status: string | null;
  Created_Time: string | null;
  /** Whether the lead has been converted to a deal. The live Leads module
   *  carries this as api_name Converted__s (label "Is Converted"); the bare
   *  "Converted" name does not exist, so the read requests Converted__s and this
   *  service normalizes it onto Converted, the property every consumer reads. */
  Converted: boolean | null;
  /** CRM layout (B2C, B2B); drives the lead segment in the KPI drill. */
  Layout: ZohoLookup | null;
  /** Case-manager owner; drives the cockpit person filter. */
  Owner: ZohoLookup | null;
  /** Last touch of any kind; the proxy anchor for several cockpit clocks when
   *  the precise event field is empty. */
  Last_Activity_Time: string | null;
  /** When Lead_Status last changed, stamped by a Zoho workflow (the leads
   *  analogue of Deals' Stage_Entry_Date). Drives the status-based cockpit SLA
   *  clock; empty on leads that predate the field, where the clock falls back to
   *  Created_Time. */
  Last_Status_Change: string | null;
  /** Cockpit fields. Intro_Call_Date_Time is the first_contact stop field but
   *  is ~0% populated on live leads, so the cockpit clock falls back to a proxy
   *  and marks itself approx. Phone backs origin inference; Country is the
   *  explicit origin when set (mostly null). Reason_Not_Qualified set means a
   *  refusal, which parks the lead. */
  Intro_Call_Date_Time: string | null;
  Reason_Not_Qualified: string | null;
  Main_Concern_Reason_for_Consultation: string | null;
  Prefered_Country_of_Treatment_Consultation: string | string[] | null;
  Country: string | null;
  Phone: string | null;
  Communication_Language: string | null;
  /** Next follow-up date (Leads field, api_name Next_Follow_up, a date; same
   *  name as on Deals, created on the module 2026-06-27). Lets the cockpit
   *  surface and edit a lead's follow-up date the same way it does on a deal. */
  Next_Follow_up: string | null;
  /** Tags on the record (Zoho Tag field, an array of { name }). Requested only
   *  by the single-record case reads (dealById/leadById), so it is optional and
   *  absent on the cached list reads. The case file maps these to tag names. */
  Tag?: Array<{ name?: string | null }> | null;
}

export interface BookingRecord {
  id: string;
  Status: string | null;
  Rate: number | null;
  Doctor: ZohoLookup | string | null;
  Patient: ZohoLookup | null;
  Created_At: string | null;
  Created_Time: string | null;
  /** Usually empty on paid bookings (verified live 2026-06-10); the real email
   *  lives on the Patients module via the Patient lookup. Server-side join key
   *  ONLY, never serialized into a payload. */
  Email: string | null;
  Name: string | null;
  From: string | null;
  Type: string | null;
}

/** Patients module rows carry the email the bookings rows lack. Join key ONLY:
 *  emails never leave the server. */
export interface PatientEmailRecord {
  id: string;
  Email: string | null;
}

/** Doctor records for commission resolution. Commission_Percentage is stored
 *  10.00 for ten percent; Parent_Account is the doctor's hospital lookup. */
export interface DoctorRecord {
  id: string;
  Name: string | null;
  Commission_Percentage: number | null;
  Parent_Account: ZohoLookup | null;
}

/** Hospital records: commission percentage used when the doctor has none, plus
 *  Country, which the provider board groups its hospital columns by. */
export interface HospitalRecord {
  id: string;
  Name: string | null;
  Commission_Percentage: number | null;
  /** Hospital country (text). Sparsely populated on the live module today, so a
   *  hospital with no country is bucketed under "Other" by the provider board. */
  Country: string | null;
}

export const WON_STAGE: Record<string, string> = {
  Telemedicine: 'TeleConsult Completed',
  Treatment: 'Treatment Completed',
  Corporates: 'Live',
  Doctor: 'Live Doctor',
  'Hospital or Clinic': 'Live Partner B2B',
};

export const LOST_STAGE: Record<string, string> = {
  Telemedicine: 'Lost / Inactive',
  Treatment: 'Lost / Inactive',
  Corporates: 'Lost Corporates',
  Doctor: 'Lost Doctor',
  'Hospital or Clinic': 'Lost provider',
};

export const PATIENT_PIPELINES = ['Telemedicine', 'Treatment'];

export const PIPELINE_NAMES = [
  'Telemedicine',
  'Treatment',
  'Corporates',
  'Doctor',
  'Hospital or Clinic',
];

/** Active (non-terminal) stages per pipeline, in funnel order. Exact strings
 *  verified in Zoho (legacy sla route). */
export const PIPELINE_STAGES: Record<string, string[]> = {
  Telemedicine: [
    'New Deal',
    'Quote Proposed',
    'Payment Done',
    'Consultation Scheduled',
    'TeleConsult Completed',
  ],
  Treatment: [
    'New Deal',
    'Quote Proposed',
    'Consultation Scheduled',
    'Consult Payment',
    'TeleConsult Completed',
    'Treatment Quote',
    'Treatment Payment',
    'Treatment Scheduled',
    'Treatment in Progress',
    'Treatment Completed',
  ],
  Corporates: ['Outreach', 'Interest', 'Agreement', 'Readiness', 'Live'],
  Doctor: [
    'Discovery B2B',
    'Contacted',
    'New Deal Doctor',
    'Proposal Sent',
    'NHRA Qualification',
    'Onboarded B2B',
    'Final Approval',
    'Live Doctor',
  ],
  'Hospital or Clinic': [
    'Discovery B2B',
    'Contacted B2B',
    'New Deal  B2B',
    'Proposal B2B',
    'Onboarded B2B',
    'Final Approval',
    'Live Partner B2B',
  ],
};

/** Days allowed per stage before a deal counts as running late (from the legacy
 *  pipeline-health agent). */
export const STAGE_SLA_DAYS: Record<string, number> = {
  'New Deal': 2,
  'Quote Proposed': 3,
  'Payment Done': 1,
  'Consultation Scheduled': 2,
  'Consult Payment': 1,
  'Treatment Quote': 5,
  'Treatment Payment': 3,
  'Treatment Scheduled': 7,
  'Treatment in Progress': 14,
  Discovery: 5,
  Outreach: 3,
  Interest: 5,
  Agreement: 7,
  Readiness: 5,
  'Contract Sent': 7,
};

export function isOpenDeal(deal: DealRecord): boolean {
  const pipeline = deal.Pipeline ?? '';
  return (
    deal.Stage !== WON_STAGE[pipeline] && deal.Stage !== LOST_STAGE[pipeline]
  );
}

// Field lists requested from Zoho for the deal and lead reads. Defined once and
// shared by the cached list reads (deals/leads) and the fresh single-record
// reads (dealById/leadById) so both always return the same record shape; a drift
// here would desync a freshly read case from the cached lists.
const DEAL_FIELDS =
  'Zoho_ID,Deal_Name,Stage,Amount,Pipeline,Created_Time,Modified_Time,Contact_Name,Next_Follow_up,Owner,Lead_Source,Layout,Prefered_Country_of_Treatment_Consultation,Country,Closing_Date,Probability,Reason_For_Loss__s,Stage_Entry_Date,Last_Patient_Comm_Date,Welcome_Message_Sent_Date,Main_Concern_Reason_for_Consultation,Reason_Not_Qualified,Last_Activity_Time,Intro_Call_Date_Time,Patient_Budget,Treatment_Start_Date,Treatment_End_Date,Patient_Mobile,Tag';

const LEAD_FIELDS =
  'Zoho_ID,First_Name,Last_Name,Email,Lead_Source,Lead_Status,Created_Time,Converted__s,Layout,Owner,Last_Activity_Time,Last_Status_Change,Intro_Call_Date_Time,Reason_Not_Qualified,Main_Concern_Reason_for_Consultation,Prefered_Country_of_Treatment_Consultation,Country,Phone,Communication_Language,Next_Follow_up';

// True when a Zoho GET by id came back as "no such record". A missing single
// record answers 204 (the client returns an empty body for it, so data is just
// absent), but a wrong-module or unknown id can answer 404; either way the case
// read treats it as "not this module" and tries the other, never a hard error.
function isCrmNotFound(err: unknown): boolean {
  return err instanceof Error && /Zoho API error 404\b/.test(err.message);
}

export class CrmReadService {
  constructor(
    private readonly cache: CacheService,
    private readonly zoho: ZohoClient,
  ) {}

  // Cache key bumped whenever the field list grows so a stale entry can never
  // serve a shape without the new fields (see the legacy version history;
  // currently v10 for deals (v10 added Tag for the CRM deals tab), v7 for
  // leads, v2 for bookings).
  deals(): Promise<CachedRead<DealRecord[]>> {
    return this.cache.read('zoho_crm:deals_v10', 'zoho_crm', async () => {
      const records = await this.zoho.getAll(`${CRM}/Deals`, {
        fields: DEAL_FIELDS,
      });
      return records as DealRecord[];
    });
  }

  leads(): Promise<CachedRead<LeadRecord[]>> {
    // Key bumped to v7 when Next_Follow_up was added, so a warm v6 entry
    // (without the field) can never be served against the new shape. (v6 added
    // Last_Status_Change.)
    return this.cache.read('zoho_crm:leads_v7', 'zoho_crm', async () => {
      const records = await this.zoho.getAll(`${CRM}/Leads`, {
        fields: LEAD_FIELDS,
      });
      // Zoho returns the flag under its real key Converted__s; normalize it onto
      // Converted so every consumer keeps reading record.Converted.
      return (records as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        Converted: r.Converted__s ?? null,
      })) as unknown as LeadRecord[];
    });
  }

  /** Fresh, UNCACHED single-deal read by internal record id, in the SAME shape
   *  as deals(). The cockpit case file reads through this so a just-written
   *  change shows immediately: the post-write cache invalidate only clears the
   *  writing instance's in-memory list (other instances keep a warm pre-write
   *  list until the TTL), so reading the one record live is what stops the case
   *  reverting on refresh. Returns null when no such deal exists. */
  async dealById(id: string): Promise<DealRecord | null> {
    try {
      const res = await this.zoho.get<{ data?: DealRecord[] }>(
        `${CRM}/Deals/${encodeURIComponent(id)}`,
        { fields: `${DEAL_FIELDS},Tag` },
      );
      return res.data?.[0] ?? null;
    } catch (err) {
      if (isCrmNotFound(err)) return null;
      throw err;
    }
  }

  /** Fresh, UNCACHED single-lead read by internal record id, in the SAME shape
   *  as leads() (Converted__s normalized onto Converted). Counterpart to
   *  dealById for the cockpit case file. Returns null when no such lead exists. */
  async leadById(id: string): Promise<LeadRecord | null> {
    try {
      const res = await this.zoho.get<{ data?: Array<Record<string, unknown>> }>(
        `${CRM}/Leads/${encodeURIComponent(id)}`,
        { fields: `${LEAD_FIELDS},Tag` },
      );
      const record = res.data?.[0];
      if (!record) return null;
      return {
        ...record,
        Converted: record.Converted__s ?? null,
      } as unknown as LeadRecord;
    } catch (err) {
      if (isCrmNotFound(err)) return null;
      throw err;
    }
  }

  /** The org's tag names for a module (Zoho settings tag list), cached. Powers
   *  the cockpit add-tag picker's suggestions. Module-scoped: Deals tags and
   *  Leads tags are separate lists in Zoho. A cheap settings read, cached under a
   *  dedicated key so it refreshes without touching the deal/lead caches. The
   *  org cap is 200 tags per module, so the list is always a single page. */
  orgTags(module: 'Deals' | 'Leads'): Promise<CachedRead<string[]>> {
    const key =
      module === 'Deals' ? 'zoho_crm:tags_deals_v1' : 'zoho_crm:tags_leads_v1';
    return this.cache.read(key, 'zoho_crm', async () => {
      const res = await this.zoho.get<{
        tags?: Array<{ name?: string | null }>;
      }>(`${CRM}/settings/tags`, { module });
      return (res.tags ?? [])
        .map((t) => (t?.name ?? '').trim())
        .filter((name) => name.length > 0);
    });
  }

  /** Bust the cached deals and leads reads. Called after a cockpit write to
   *  Zoho so the next read serves live Zoho data, not the pre-write cache that
   *  would otherwise be served until the TTL expires. */
  async invalidate(): Promise<void> {
    await Promise.all([
      this.cache.invalidate('zoho_crm:deals_v9'),
      this.cache.invalidate('zoho_crm:leads_v7'),
    ]);
  }

  bookings(): Promise<CachedRead<BookingRecord[]>> {
    return this.cache.read('zoho_crm:bookings_v2', 'zoho_crm', async () => {
      const records = await this.zoho.getAll(`${CRM}/Appointment_Bookings`, {
        fields:
          'Status,Rate,Doctor,Patient,Created_At,Created_Time,Email,Name,From,Type',
      });
      return records as BookingRecord[];
    });
  }

  /** Email per Patients row, for the booking-to-lead email join. Only the Email
   *  field is pulled; the payload-facing services aggregate before anything
   *  leaves the process. */
  patients(): Promise<CachedRead<PatientEmailRecord[]>> {
    return this.cache.read('zoho_crm:patients_emails', 'zoho_crm', async () => {
      const records = await this.zoho.getAll(`${CRM}/Patients`, {
        fields: 'Email',
      });
      return records as PatientEmailRecord[];
    });
  }

  /** Doctors with their commission percentage and hospital, for the doctor-first
   *  commission resolution in the payouts compute. */
  doctors(): Promise<CachedRead<DoctorRecord[]>> {
    return this.cache.read('zoho_crm:doctors_v1', 'zoho_crm', async () => {
      const records = await this.zoho.getAll(`${CRM}/Doctors`, {
        fields: 'Name,Commission_Percentage,Parent_Account',
      });
      return records as DoctorRecord[];
    });
  }

  /** Hospitals with their commission percentage, the fallback when a doctor has
   *  none set. */
  hospitals(): Promise<CachedRead<HospitalRecord[]>> {
    // Key bumped to v2 when Country was added so a warm v1 entry is not served
    // against the new shape.
    return this.cache.read('zoho_crm:hospitals_v2', 'zoho_crm', async () => {
      const records = await this.zoho.getAll(`${CRM}/Hospitals`, {
        fields: 'Name,Commission_Percentage,Country',
      });
      return records as HospitalRecord[];
    });
  }
}

// globalThis-pinned singleton: shares the one cache and Zoho read client, so the
// warm L1 cache and Zoho token are reused across every crm-facing route.
const CRM_READ_KEY = '__crmRead';

type GlobalWithCrmRead = typeof globalThis & {
  [CRM_READ_KEY]?: CrmReadService;
};

export function getCrmRead(): CrmReadService {
  const g = globalThis as GlobalWithCrmRead;
  if (!g[CRM_READ_KEY]) {
    g[CRM_READ_KEY] = new CrmReadService(getCache(), getZohoClient());
  }
  return g[CRM_READ_KEY];
}

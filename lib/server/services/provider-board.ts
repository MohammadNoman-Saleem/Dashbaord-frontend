// Provider board service. A Supabase-backed view of which patient (a Zoho lead
// or deal) the case manager has sent to which hospital, and how long the hospital
// has been sitting on a response. Zoho has no patient->provider link, so the
// assignment and the waiting clock live in the provider_referrals table here; the
// hospital list and the patient identity/status are read LIVE from the cached
// Zoho reads at render time. A patient can sit under several hospitals at once
// (one active row per hospital).
//
// PRIVACY (NHRA): the table stores only Zoho record ids and the hospital's
// business name. The patient name is resolved live from Zoho and attached ONLY
// for a name-seeing viewer (per-field gate, mirroring the patient search); the
// handler's global sweep strips patient_name for anyone else, and the route gates
// the whole board to name-seers. Audit records ids and kinds only, never a name.
//
// SERVER ONLY (pg + cached Zoho reads).
import type { Pool } from 'pg';
import { getPool } from '../db';
import { getCrmRead, type HospitalRecord } from '../crm-read';
import { patientSerializer } from '../privacy';
import { businessHoursElapsed } from './sla';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';
import type { RequestViewer } from '../auth/viewer';

// A patient card waiting in a hospital column. patient_ref is the record
// reference everyone may see (id + initials + human ref); patient_name is
// attached only for a name-seer. The client renders identity via PatientRef with
// { ...card, ...card.patient_ref }, so the literal patient_name never leaves this
// layer except through that one allowed component.
export interface ProviderBoardCard {
  id: string;
  record_kind: 'lead' | 'deal';
  patient_ref: {
    zoho_id: string;
    initials: string;
    ref: string;
    ref_is_fallback: boolean;
  };
  patient_name?: string;
  /** Current Zoho status: deal Stage or lead Lead_Status. */
  status: string | null;
  /** Deal pipeline; null on leads. */
  pipeline: string | null;
  added_at: string;
  added_by: string;
  added_by_name: string;
  /** Business days (Sun-Thu) the patient has waited in this column. */
  waiting_business_days: number;
  tone: 'good' | 'info' | 'warn';
  /** True when the patient record no longer resolves in the live Zoho read
   *  (converted, closed, or removed); the card shows the reference only. */
  missing: boolean;
}

export interface ProviderBoardHospital {
  id: string;
  name: string;
  /** Country bucket the board groups this hospital under; "Other" when the
   *  hospital has no Country set in Zoho. */
  country: string;
}

export interface ProviderBoardData {
  /** Country categories in tab order: Bahrain first, then alphabetical, with
   *  "Other" (no country set) last. */
  countries: string[];
  /** Every named hospital, tagged with its country bucket. The board renders one
   *  column per hospital under its country tab, even when the hospital has no
   *  cards. */
  hospitals: ProviderBoardHospital[];
  /** Active patient cards keyed by hospital id; a hospital with no cards is
   *  simply absent here and renders an empty column. */
  cardsByHospital: Record<string, ProviderBoardCard[]>;
}

const OTHER_COUNTRY = 'Other';

/** Order the country tabs: Bahrain first (home), then alphabetical, with the
 *  no-country "Other" bucket last. */
function orderCountries(values: Iterable<string>): string[] {
  const set = new Set(values);
  const rest = [...set]
    .filter((c) => c !== 'Bahrain' && c !== OTHER_COUNTRY)
    .sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];
  if (set.has('Bahrain')) ordered.push('Bahrain');
  ordered.push(...rest);
  if (set.has(OTHER_COUNTRY)) ordered.push(OTHER_COUNTRY);
  return ordered;
}

export interface AddReferralInput {
  hospital_id: string;
  /** Optional. When omitted (add-by-reference), the kind is auto-detected. */
  record_kind?: 'lead' | 'deal';
  /** Either the internal record id or the human Zoho_ID reference. */
  zoho_id: string;
}

export interface AddCustomHospitalInput {
  name: string;
  country: string;
}

interface ReferralRow {
  id: string;
  hospital_id: string;
  hospital_name: string;
  record_kind: 'lead' | 'deal';
  zoho_id: string;
  added_by: string;
  added_at: Date;
}

// A hospital column flags the attention tone once a patient has waited this many
// business days for a response, with a softer mid tone before then.
const WAIT_WARN_DAYS = 5;
const WAIT_INFO_DAYS = 3;
// Counted business hours that make up one non-weekend day (the helper skips Fri
// and Sat entirely, so every counted hour belongs to a working day).
const BUSINESS_HOURS_PER_DAY = 24;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

export class ProviderBoardService {
  constructor(private readonly pool: Pool) {}

  /** The board grouped for the UI: every named hospital tagged with a country
   *  bucket (so columns can be shown under country tabs, even when empty), plus
   *  the active patient cards keyed by hospital id. Each card carries the live
   *  patient identity (gated), current status, and waiting clock. */
  async getBoard(viewer: RequestViewer): Promise<ProviderBoardData> {
    const { rows } = await this.pool.query<ReferralRow>(
      `select id, hospital_id, hospital_name, record_kind, zoho_id, added_by, added_at
       from provider_referrals
       where removed_at is null
       order by added_at asc`,
    );

    const crm = getCrmRead();
    const [dealsRead, leadsRead, hospitalsRead, customHospitals] =
      await Promise.all([
        crm.deals(),
        crm.leads(),
        crm.hospitals(),
        this.activeCustomHospitals(),
      ]);

    // Build the hospital columns (Zoho directory deduped by name, plus board
    // custom hospitals). Shared with listHospitals so the case-file picker and
    // the board agree on the hospital set.
    const { hospitals, repByRecordId, columnIds } = this.buildHospitalColumns(
      hospitalsRead.data,
      customHospitals,
    );

    const dealById = new Map(dealsRead.data.map((d) => [d.id, d]));
    const leadById = new Map(leadsRead.data.map((l) => [l.id, l]));
    const names = await this.nameMap(rows.map((r) => r.added_by));
    const now = new Date();

    const cardsByHospital: Record<string, ProviderBoardCard[]> = {};
    for (const row of rows) {
      const card = this.toCard(row, dealById, leadById, names, viewer, now);
      // Map the referral's hospital id to its representative column, so a card
      // added against a duplicate record still lands in the single merged column.
      const columnId = repByRecordId.get(row.hospital_id) ?? row.hospital_id;
      (cardsByHospital[columnId] ??= []).push(card);
      // A card whose hospital is no longer in the directory (renamed or removed
      // in Zoho) still needs a column, so surface a synthetic hospital from the
      // stored snapshot name under the Other bucket rather than dropping it.
      if (!columnIds.has(columnId)) {
        columnIds.add(columnId);
        hospitals.push({
          id: columnId,
          name: row.hospital_name || columnId,
          country: OTHER_COUNTRY,
        });
      }
    }

    hospitals.sort((a, b) => a.name.localeCompare(b.name));
    const countries = orderCountries(hospitals.map((h) => h.country));
    return { countries, hospitals, cardsByHospital };
  }

  /** The pickable hospital list for the case-file "add to a hospital" control:
   *  the Zoho directory deduped by name plus board custom hospitals, sorted by
   *  name. The same set the board renders as columns. */
  async listHospitals(): Promise<ProviderBoardHospital[]> {
    const crm = getCrmRead();
    const [hospitalsRead, customHospitals] = await Promise.all([
      crm.hospitals(),
      this.activeCustomHospitals(),
    ]);
    const { hospitals } = this.buildHospitalColumns(
      hospitalsRead.data,
      customHospitals,
    );
    hospitals.sort((a, b) => a.name.localeCompare(b.name));
    return hospitals;
  }

  /** The hospitals a patient is currently sent to (active provider_referrals
   *  rows), for the case-file Hospitals section. referral_id removes the link. */
  async referralsForPatient(
    zohoId: string,
  ): Promise<
    Array<{ referral_id: string; hospital_id: string; hospital_name: string }>
  > {
    const { rows } = await this.pool.query<{
      id: string;
      hospital_id: string;
      hospital_name: string;
    }>(
      `select id, hospital_id, hospital_name
       from provider_referrals
       where zoho_id = $1 and removed_at is null
       order by added_at asc`,
      [zohoId],
    );
    return rows.map((r) => ({
      referral_id: r.id,
      hospital_id: r.hospital_id,
      hospital_name: r.hospital_name,
    }));
  }

  /** Build the hospital columns shared by the board and the picker: the Zoho
   *  Hospitals directory deduped by name (one representative record per name,
   *  preferring one that carries a country), plus board-only custom hospitals.
   *  Returns the columns, a map from every Zoho record id to its representative
   *  column id (so a card on a duplicate record lands in the merged column), and
   *  the set of column ids. */
  private buildHospitalColumns(
    hospitalRecords: HospitalRecord[],
    customHospitals: Array<{ id: string; name: string; country: string }>,
  ): {
    hospitals: ProviderBoardHospital[];
    repByRecordId: Map<string, string>;
    columnIds: Set<string>;
  } {
    const groups = new Map<string, HospitalRecord[]>();
    for (const h of hospitalRecords) {
      const name = (h.Name ?? '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const arr = groups.get(key);
      if (arr) arr.push(h);
      else groups.set(key, [h]);
    }
    const hospitals: ProviderBoardHospital[] = [];
    const repByRecordId = new Map<string, string>();
    for (const recs of groups.values()) {
      const rep =
        recs.find((r) => (r.Country ?? '').trim().length > 0) ?? recs[0];
      hospitals.push({
        id: rep.id,
        name: (rep.Name ?? '').trim(),
        country: (rep.Country ?? '').trim() || OTHER_COUNTRY,
      });
      for (const r of recs) repByRecordId.set(r.id, rep.id);
    }
    const columnIds = new Set(hospitals.map((h) => h.id));

    // Board-only custom hospitals appear as their own columns under their chosen
    // country (they have no Zoho record).
    for (const ch of customHospitals) {
      if (columnIds.has(ch.id)) continue;
      hospitals.push({
        id: ch.id,
        name: ch.name,
        country: ch.country.trim() || OTHER_COUNTRY,
      });
      columnIds.add(ch.id);
    }
    return { hospitals, repByRecordId, columnIds };
  }

  /** Add a patient to a hospital column. Resolves the entered reference (an
   *  internal record id or a Zoho_ID) to a record and kind, validates the
   *  hospital, then inserts. A patient can be on many hospitals, but only once
   *  per hospital (the active unique index, plus a pre-check for a friendly
   *  message). Returns the new row id and the resolved kind and id so the route
   *  audits the resolved values, never the raw input. */
  async addReferral(
    viewer: RequestViewer,
    input: AddReferralInput,
  ): Promise<{ id: string; record_kind: 'lead' | 'deal'; zoho_id: string }> {
    const { record_kind, recordId } = await this.resolveRecord(
      input.zoho_id,
      input.record_kind,
    );

    const crm = getCrmRead();
    const hospitalsRead = await crm.hospitals();
    const zohoHospital = hospitalsRead.data.find(
      (h) => h.id === input.hospital_id,
    );
    // The hospital is either a Zoho directory record or a board-only custom one.
    let hospitalName: string;
    if (zohoHospital) {
      hospitalName = (zohoHospital.Name ?? '').trim() || input.hospital_id;
    } else {
      const custom = await this.getActiveCustomHospital(input.hospital_id);
      if (!custom) {
        throw new BadRequestError('That hospital is not in the system.');
      }
      hospitalName = custom.name;
    }

    const existing = await this.pool.query<{ id: string }>(
      `select id from provider_referrals
       where hospital_id = $1 and zoho_id = $2 and removed_at is null`,
      [input.hospital_id, recordId],
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('That patient is already on this hospital column.');
    }

    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `insert into provider_referrals
           (hospital_id, hospital_name, record_kind, zoho_id, added_by)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [input.hospital_id, hospitalName, record_kind, recordId, viewer.key],
      );
      return { id: rows[0].id, record_kind, zoho_id: recordId };
    } catch (err) {
      // The active unique index is the backstop against a concurrent double-add.
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          'That patient is already on this hospital column.',
        );
      }
      throw err;
    }
  }

  /** Resolve a reference (an internal record id or a Zoho_ID) to a record and
   *  kind. With a kind given (the name-seer search flow) it matches inside that
   *  collection. Without a kind (add-by-reference) it auto-detects: an
   *  internal-id match first (the internal id is globally unique), then a
   *  Zoho_ID match. The Zoho_ID field is NOT unique across modules (Deals
   *  "Zoho ID" is text, Leads "Zoho Lead ID" is a separate autonumber), so a
   *  Zoho_ID reference can hit more than one record; an ambiguous reference is
   *  refused rather than guessed. */
  private async resolveRecord(
    reference: string,
    kind?: 'lead' | 'deal',
  ): Promise<{ record_kind: 'lead' | 'deal'; recordId: string }> {
    const crm = getCrmRead();
    const ref = reference.trim();
    // Guard the empty reference: without this, an all-whitespace input would
    // trim to '' and match the first record that has no Zoho_ID.
    if (!ref) {
      throw new BadRequestError(
        'That Zoho reference was not found in leads or deals.',
      );
    }

    if (kind === 'deal') {
      const dealsRead = await crm.deals();
      const d = dealsRead.data.find(
        (r) => r.id === ref || (r.Zoho_ID ?? '').trim() === ref,
      );
      if (!d) throw new BadRequestError('That deal was not found in Zoho.');
      return { record_kind: 'deal', recordId: d.id };
    }
    if (kind === 'lead') {
      const leadsRead = await crm.leads();
      const l = leadsRead.data.find(
        (r) => r.id === ref || (r.Zoho_ID ?? '').trim() === ref,
      );
      if (!l) throw new BadRequestError('That lead was not found in Zoho.');
      return { record_kind: 'lead', recordId: l.id };
    }

    // The internal record id is globally unique, so an id match is
    // authoritative and wins.
    const [dealsRead, leadsRead] = await Promise.all([
      crm.deals(),
      crm.leads(),
    ]);
    const dealById = dealsRead.data.find((r) => r.id === ref);
    if (dealById) return { record_kind: 'deal', recordId: dealById.id };
    const leadById = leadsRead.data.find((r) => r.id === ref);
    if (leadById) return { record_kind: 'lead', recordId: leadById.id };

    // The Zoho_ID field is not unique across modules, so gather every record
    // that carries this reference. Use it only when it points at exactly one
    // record; refuse an ambiguous reference so a non-name-seer can never
    // silently attach the wrong patient to a hospital.
    const byReference: Array<{ record_kind: 'lead' | 'deal'; recordId: string }> =
      [
        ...dealsRead.data
          .filter((r) => (r.Zoho_ID ?? '').trim() === ref)
          .map((r) => ({ record_kind: 'deal' as const, recordId: r.id })),
        ...leadsRead.data
          .filter((r) => (r.Zoho_ID ?? '').trim() === ref)
          .map((r) => ({ record_kind: 'lead' as const, recordId: r.id })),
      ];
    if (byReference.length === 1) return byReference[0];
    if (byReference.length > 1) {
      throw new BadRequestError(
        'That Zoho reference matches more than one record. Ask a case manager to add this patient.',
      );
    }
    throw new BadRequestError(
      'That Zoho reference was not found in leads or deals.',
    );
  }

  /** Soft-remove a card (set removed_at). The same patient can be re-added later
   *  and the history is preserved. */
  async removeReferral(id: string): Promise<{ id: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update provider_referrals
       set removed_at = now()
       where id = $1 and removed_at is null
       returning id`,
      [id],
    );
    if (rows.length === 0) {
      throw new NotFoundError('That board card no longer exists.');
    }
    return { id: rows[0].id };
  }

  /** Add a board-only custom hospital (no Zoho record). Rejects a name that
   *  already exists as a Zoho directory hospital (use that one) or as an active
   *  custom hospital. Returns the new id. */
  async addCustomHospital(
    viewer: RequestViewer,
    input: AddCustomHospitalInput,
  ): Promise<{ id: string }> {
    const name = input.name.trim();
    const country = input.country.trim();
    if (!name) throw new BadRequestError('Enter a hospital name.');
    if (!country) {
      throw new BadRequestError('Enter a country for the hospital.');
    }

    const crm = getCrmRead();
    const hospitalsRead = await crm.hospitals();
    const key = name.toLowerCase();
    if (
      hospitalsRead.data.some(
        (h) => (h.Name ?? '').trim().toLowerCase() === key,
      )
    ) {
      throw new ConflictError(
        'A hospital with that name is already in the directory; use it instead.',
      );
    }

    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `insert into provider_board_custom_hospitals (name, country, created_by)
         values ($1, $2, $3)
         returning id`,
        [name, country, viewer.key],
      );
      return { id: rows[0].id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('That hospital is already on the board.');
      }
      throw err;
    }
  }

  /** Active board-only custom hospitals, used as extra columns. */
  private async activeCustomHospitals(): Promise<
    Array<{ id: string; name: string; country: string }>
  > {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      country: string;
    }>(
      `select id, name, country from provider_board_custom_hospitals
       where removed_at is null`,
    );
    return rows;
  }

  /** One active custom hospital by id, or null. Guards the uuid shape so a Zoho
   *  (numeric) id never reaches the uuid-typed column and errors. */
  private async getActiveCustomHospital(
    id: string,
  ): Promise<{ id: string; name: string; country: string } | null> {
    if (!UUID_RE.test(id)) return null;
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      country: string;
    }>(
      `select id, name, country from provider_board_custom_hospitals
       where id = $1 and removed_at is null`,
      [id],
    );
    return rows[0] ?? null;
  }

  private toCard(
    row: ReferralRow,
    dealById: Map<string, import('../crm-read').DealRecord>,
    leadById: Map<string, import('../crm-read').LeadRecord>,
    names: Map<string, string>,
    viewer: RequestViewer,
    now: Date,
  ): ProviderBoardCard {
    let name: string | null = null;
    let status: string | null = null;
    let pipeline: string | null = null;
    let zohoRef = '';
    let missing = true;

    if (row.record_kind === 'deal') {
      const d = dealById.get(row.zoho_id);
      if (d) {
        missing = false;
        name = d.Contact_Name?.name ?? d.Deal_Name ?? null;
        status = d.Stage ?? null;
        pipeline = d.Pipeline ?? null;
        zohoRef = (d.Zoho_ID ?? '').trim();
      }
    } else {
      const l = leadById.get(row.zoho_id);
      if (l) {
        missing = false;
        name = [l.First_Name, l.Last_Name].filter(Boolean).join(' ') || null;
        status = l.Lead_Status ?? null;
        zohoRef = (l.Zoho_ID ?? '').trim();
      }
    }

    const base = patientSerializer.ref(row.zoho_id, name);
    const addedAt = new Date(row.added_at);
    const waiting = Math.floor(
      businessHoursElapsed(addedAt, now) / BUSINESS_HOURS_PER_DAY,
    );
    const tone: ProviderBoardCard['tone'] =
      waiting >= WAIT_WARN_DAYS
        ? 'warn'
        : waiting >= WAIT_INFO_DAYS
          ? 'info'
          : 'good';

    const card: ProviderBoardCard = {
      id: row.id,
      record_kind: row.record_kind,
      patient_ref: {
        zoho_id: base.zoho_id,
        initials: base.initials,
        ref: zohoRef || row.zoho_id,
        ref_is_fallback: zohoRef.length === 0,
      },
      status,
      pipeline,
      added_at: addedAt.toISOString(),
      added_by: row.added_by,
      added_by_name: names.get(row.added_by) ?? this.fallbackName(row.added_by),
      waiting_business_days: waiting,
      tone,
      missing,
    };
    // Per-field gate: the name only travels for a name-seeing viewer. The route
    // already 403s anyone else, and the global sweep strips patient_name as a
    // backstop.
    if (viewer.sees_patient_names && name) {
      card.patient_name = name;
    }
    return card;
  }

  /** Resolve actor keys to display names (users table), like the urgent board. */
  private async nameMap(keys: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(keys.filter(Boolean))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const { rows } = await this.pool.query<{ key: string; name: string }>(
      'select key, name from users where key = any($1)',
      [unique],
    );
    for (const u of rows) map.set(u.key, u.name);
    return map;
  }

  private fallbackName(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

const PROVIDER_BOARD_KEY = '__saleem_provider_board__';

type GlobalWithProviderBoard = typeof globalThis & {
  [PROVIDER_BOARD_KEY]?: ProviderBoardService;
};

export function getProviderBoardService(): ProviderBoardService {
  const g = globalThis as GlobalWithProviderBoard;
  if (!g[PROVIDER_BOARD_KEY]) {
    g[PROVIDER_BOARD_KEY] = new ProviderBoardService(getPool());
  }
  return g[PROVIDER_BOARD_KEY];
}

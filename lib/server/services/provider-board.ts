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
  record_kind: 'lead' | 'deal';
  zoho_id: string;
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
    const [dealsRead, leadsRead, hospitalsRead] = await Promise.all([
      crm.deals(),
      crm.leads(),
      crm.hospitals(),
    ]);

    // Build hospital columns from the Hospitals directory, DEDUPED by name so a
    // duplicate Zoho record (e.g. two "Ibn Al-Nafees Hospital" rows) shows as a
    // single column. Each name group keeps one representative record (preferring
    // one that carries a country), and every record id in the group maps to that
    // representative so a card added against any duplicate lands in the one column.
    const groups = new Map<string, HospitalRecord[]>();
    for (const h of hospitalsRead.data) {
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

  /** Add a patient to a hospital column. Validates both the hospital and the
   *  patient against the live Zoho reads, then inserts. A patient can be on many
   *  hospitals, but only once per hospital (the active unique index, plus a
   *  pre-check for a friendly message). Returns the new row id. */
  async addReferral(
    viewer: RequestViewer,
    input: AddReferralInput,
  ): Promise<{ id: string }> {
    const crm = getCrmRead();
    const hospitalsRead = await crm.hospitals();
    const hospital = hospitalsRead.data.find((h) => h.id === input.hospital_id);
    if (!hospital) {
      throw new BadRequestError('That hospital is not in Zoho.');
    }

    if (input.record_kind === 'deal') {
      const dealsRead = await crm.deals();
      if (!dealsRead.data.some((d) => d.id === input.zoho_id)) {
        throw new BadRequestError('That deal was not found in Zoho.');
      }
    } else {
      const leadsRead = await crm.leads();
      if (!leadsRead.data.some((l) => l.id === input.zoho_id)) {
        throw new BadRequestError('That lead was not found in Zoho.');
      }
    }

    const hospitalName = (hospital.Name ?? '').trim() || input.hospital_id;

    const existing = await this.pool.query<{ id: string }>(
      `select id from provider_referrals
       where hospital_id = $1 and zoho_id = $2 and removed_at is null`,
      [input.hospital_id, input.zoho_id],
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
        [
          input.hospital_id,
          hospitalName,
          input.record_kind,
          input.zoho_id,
          viewer.key,
        ],
      );
      return { id: rows[0].id };
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

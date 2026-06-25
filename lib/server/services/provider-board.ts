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
import { getCrmRead } from '../crm-read';
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

export interface ProviderBoardColumn {
  hospital_id: string;
  hospital_name: string;
  cards: ProviderBoardCard[];
}

export interface ProviderBoardData {
  columns: ProviderBoardColumn[];
  /** The full hospital catalog from Zoho, for the add-patient column picker.
   *  Returned even when the board is empty so the first patient can be added. */
  hospitals: Array<{ id: string; name: string }>;
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

  /** The board: active referrals grouped into hospital columns, each card carrying
   *  the live patient identity (gated), current status, and waiting clock. */
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
    // The hospital catalog (named records only), sorted, for the column picker.
    const hospitals = hospitalsRead.data
      .map((h) => ({ id: h.id, name: (h.Name ?? '').trim() }))
      .filter((h) => h.name.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (rows.length === 0) return { columns: [], hospitals };

    const dealById = new Map(dealsRead.data.map((d) => [d.id, d]));
    const leadById = new Map(leadsRead.data.map((l) => [l.id, l]));
    const hospitalNameById = new Map(hospitals.map((h) => [h.id, h.name]));
    const names = await this.nameMap(rows.map((r) => r.added_by));
    const now = new Date();

    const columns = new Map<string, ProviderBoardColumn>();
    for (const row of rows) {
      const card = this.toCard(row, dealById, leadById, names, viewer, now);
      let col = columns.get(row.hospital_id);
      if (!col) {
        // Prefer the live hospital name; fall back to the snapshot stored at add
        // time so a column always has a label even if the hospital read misses.
        const liveName = hospitalNameById.get(row.hospital_id);
        col = {
          hospital_id: row.hospital_id,
          hospital_name: liveName || row.hospital_name,
          cards: [],
        };
        columns.set(row.hospital_id, col);
      }
      col.cards.push(card);
    }

    const ordered = [...columns.values()].sort((a, b) =>
      a.hospital_name.localeCompare(b.hospital_name),
    );
    return { columns: ordered, hospitals };
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

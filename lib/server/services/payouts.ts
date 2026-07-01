// The payouts / commission engine. Ported from the NestJS backend
//   src/payouts/commission.service.ts   (CommissionService)
//   src/payouts/payout-rules.service.ts (PayoutRulesService + EDITABLE_PARAM_KEYS)
//   src/payouts/manual-ledger.service.ts (ManualLedgerService)
// with the business logic and DTOs kept VERBATIM. The @Injectable DI classes
// become globalThis-pinned singletons: the Postgres pool is read from getPool()
// (db.ts) instead of the @Inject(PG_POOL) token, the CRM reads from getCrmRead()
// (crm-read.ts) instead of the injected CrmReadService, and the patient gate
// from the shared patientSerializer (privacy.ts) instead of the injected
// PatientSerializer. NestJS NotFoundException becomes the foundation NotFoundError.
//
// The commission model (gross vs Saleem revenue, doctor-first percent, novo flat
// commission, manual free-appointment rows, test-booking exclusion, Bahrain
// cycle) is copied exactly; only the dependency wiring changed.
//
// PRIVACY (NHRA): CRM-derived ledger rows carry a patient_ref (Zoho id + initials)
// always, and patient_name only when the REAL viewer holds sees_patient_names,
// applied per-field via patientSerializer.withName at the call site. Manual rows
// carry no patient identity (the synthetic middot ref). The handler's global
// sweepPatientPii is the backstop on every response. Patient values are never
// logged or audited.
//
// SERVER ONLY. Node runtime: touches pg (pool) and Zoho through getCrmRead().
import { getPool } from '../db';
import { getCrmRead, type CrmReadService, type ZohoLookup } from '../crm-read';
import {
  patientSerializer,
  PatientSerializer,
  type PatientRef,
} from '../privacy';
import { NotFoundError } from '../errors';
import type { SourceMeta } from '../envelope';
import type { RequestViewer } from '../auth/viewer';
import type { Pool } from 'pg';

// ===========================================================================
// Payout rules (payout-rules.service.ts)
// ===========================================================================

export interface PayoutRuleRow {
  id: number;
  priority: number;
  rule_type: 'campaign' | 'fixed_fee' | 'percent';
  scope: Record<string, unknown>;
  params: Record<string, unknown>;
  label: string;
  effective_from: string;
  effective_to: string | null;
  updated_by: string | null;
  updated_at: string;
}

interface RuleDbRow {
  id: number;
  priority: number;
  rule_type: 'campaign' | 'fixed_fee' | 'percent';
  scope: Record<string, unknown>;
  params: Record<string, unknown>;
  label: string;
  effective_from: Date;
  effective_to: Date | null;
  updated_by: string | null;
  updated_at: Date;
}

const ROW_FIELDS = `id, priority, rule_type, scope, params, label,
       effective_from, effective_to, updated_by, updated_at`;

/** Editable numeric params, by name. Only these may be patched; everything
 *  else on a rule (scope, type, priority, label) is fixed at seed time. */
export const EDITABLE_PARAM_KEYS = [
  'service_charge_bhd',
  'commission_bhd',
  'commission_pct',
] as const;
export type EditableParamKey = (typeof EDITABLE_PARAM_KEYS)[number];

export class PayoutRulesService {
  constructor(private readonly pool: Pool) {}

  /** All rules, highest priority first (lowest priority number first, the
   *  order the compute matches in). */
  async all(): Promise<PayoutRuleRow[]> {
    const { rows } = await this.pool.query<RuleDbRow>(
      `select ${ROW_FIELDS} from payout_rules order by priority asc, id asc`,
    );
    return rows.map(toRuleRow);
  }

  async byId(id: number): Promise<PayoutRuleRow | null> {
    const { rows } = await this.pool.query<RuleDbRow>(
      `select ${ROW_FIELDS} from payout_rules where id = $1`,
      [id],
    );
    return rows.length > 0 ? toRuleRow(rows[0]) : null;
  }

  /** Patch the editable params of one rule. Merges the supplied numeric
   *  params into the existing params jsonb so unrelated keys are untouched,
   *  and stamps updated_by/updated_at. Returns the row before and after for
   *  the audit trail. */
  async patchParams(
    id: number,
    params: Partial<Record<EditableParamKey, number>>,
    updatedBy: string,
  ): Promise<{ before: PayoutRuleRow; after: PayoutRuleRow }> {
    const before = await this.byId(id);
    if (!before) throw new NotFoundError('That payout rule does not exist.');

    const nextParams = { ...before.params };
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) nextParams[key] = value;
    }

    const { rows } = await this.pool.query<RuleDbRow>(
      `update payout_rules
       set params = $2, updated_by = $3, updated_at = now()
       where id = $1
       returning ${ROW_FIELDS}`,
      [id, JSON.stringify(nextParams), updatedBy],
    );
    return { before, after: toRuleRow(rows[0]) };
  }
}

function toRuleRow(r: RuleDbRow): PayoutRuleRow {
  return {
    id: r.id,
    priority: r.priority,
    rule_type: r.rule_type,
    scope: r.scope ?? {},
    params: r.params ?? {},
    label: r.label,
    effective_from: isoDay(r.effective_from),
    effective_to: r.effective_to ? isoDay(r.effective_to) : null,
    updated_by: r.updated_by,
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

function isoDay(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

// ===========================================================================
// Manual ledger (manual-ledger.service.ts)
// ===========================================================================

export interface ManualEntryInput {
  product: string;
  provider_label: string | null;
  /** Signed: negative = Saleem covers a cost, positive = Saleem earns. */
  saleem_share: number;
  collected_by: 'saleem' | 'provider' | null;
  booked_at?: string;
}

export interface ManualEntryRow {
  id: string;
  booked_at: string;
  product: string;
  provider_label: string | null;
  patient_paid: number;
  provider_payout: number;
  saleem_share: number;
  manual: boolean;
  collected_by: 'saleem' | 'provider' | null;
  needs_review: boolean;
  cycle: string;
}

interface LedgerDbRow {
  id: string;
  booked_at: Date;
  product: string;
  provider_label: string | null;
  patient_paid: string;
  provider_payout: string;
  saleem_share: string;
  manual: boolean;
  collected_by: 'saleem' | 'provider' | null;
  needs_review: boolean;
  cycle: string;
}

const LEDGER_ROW_FIELDS = `id, booked_at, product, provider_label, patient_paid,
       provider_payout, saleem_share, manual, collected_by, needs_review, cycle`;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cycle key (YYYY-MM) a timestamp falls in, matching the compute. */
function cycleOf(iso: string): string {
  return iso.slice(0, 7);
}

export class ManualLedgerService {
  constructor(private readonly pool: Pool) {}

  async byId(id: string): Promise<ManualEntryRow | null> {
    const { rows } = await this.pool.query<LedgerDbRow>(
      `select ${LEDGER_ROW_FIELDS} from bookings_ledger where id = $1 and manual = true`,
      [id],
    );
    return rows.length > 0 ? toLedgerRow(rows[0]) : null;
  }

  /** Create a free-appointment row. The id is a stable manual key so it never
   *  collides with a CRM booking id. */
  async create(input: ManualEntryInput): Promise<ManualEntryRow> {
    const bookedAt = input.booked_at
      ? new Date(input.booked_at).toISOString()
      : new Date().toISOString();
    const cycle = cycleOf(bookedAt);
    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { rows } = await this.pool.query<LedgerDbRow>(
      `insert into bookings_ledger
         (id, booked_at, product, provider_label, patient_paid,
          provider_payout, saleem_share, rule_id, rule_label, manual,
          collected_by, needs_review, cycle)
       values ($1, $2, $3, $4, 0, 0, $5, null, 'Manual entry', true, $6, false, $7)
       returning ${LEDGER_ROW_FIELDS}`,
      [
        id,
        bookedAt,
        input.product,
        input.provider_label,
        input.saleem_share,
        input.collected_by,
        cycle,
      ],
    );
    return toLedgerRow(rows[0]);
  }

  /** Edit an existing free-appointment row. Only manual rows are touchable. */
  async update(
    id: string,
    input: ManualEntryInput,
  ): Promise<{ before: ManualEntryRow; after: ManualEntryRow }> {
    const before = await this.byId(id);
    if (!before) {
      throw new NotFoundError('That free appointment entry does not exist.');
    }
    const bookedAt = input.booked_at
      ? new Date(input.booked_at).toISOString()
      : before.booked_at;
    const cycle = cycleOf(bookedAt);

    const { rows } = await this.pool.query<LedgerDbRow>(
      `update bookings_ledger
       set booked_at = $2, product = $3, provider_label = $4,
           saleem_share = $5, collected_by = $6, cycle = $7
       where id = $1 and manual = true
       returning ${LEDGER_ROW_FIELDS}`,
      [
        id,
        bookedAt,
        input.product,
        input.provider_label,
        input.saleem_share,
        input.collected_by,
        cycle,
      ],
    );
    return { before, after: toLedgerRow(rows[0]) };
  }

  /** Manual rows for one cycle, newest first. */
  async forCycle(cycle: string): Promise<ManualEntryRow[]> {
    const { rows } = await this.pool.query<LedgerDbRow>(
      `select ${LEDGER_ROW_FIELDS} from bookings_ledger
       where manual = true and cycle = $1
       order by booked_at desc`,
      [cycle],
    );
    return rows.map(toLedgerRow);
  }
}

function toLedgerRow(r: LedgerDbRow): ManualEntryRow {
  return {
    id: r.id,
    booked_at: new Date(r.booked_at).toISOString(),
    product: r.product,
    provider_label: r.provider_label,
    patient_paid: num(r.patient_paid),
    provider_payout: num(r.provider_payout),
    saleem_share: num(r.saleem_share),
    manual: r.manual,
    collected_by: r.collected_by,
    needs_review: r.needs_review,
    cycle: r.cycle,
  };
}

// ===========================================================================
// Commission compute (commission.service.ts)
// ===========================================================================

export interface LedgerBookingRow {
  id: string;
  provider: string;
  patient_ref: PatientRef;
  patient_name?: string;
  product: string;
  /** GROSS: full amount the patient paid (the booking Rate). */
  gross_bhd: number;
  /** SALEEM REVENUE: service charge plus commission. Separate from gross. */
  saleem_revenue_bhd: number;
  /** Free-to-patient rows only: what Saleem covers. Never a minus on screen. */
  covers_bhd?: number;
  provider_payout_bhd: number;
  rule_label: string;
  manual: boolean;
}

export interface CommissionSummary {
  cycle: string;
  /** GROSS across the cycle: total patient payments. */
  gross_bhd: number;
  /** SALEEM REVENUE across the cycle. Shown beside gross, never summed in. */
  saleem_revenue_bhd: number;
  provider_payouts_bhd: number;
  booking_count: number;
  /** Bookings whose commission percent could not be resolved (fell back). */
  commission_unset_count: number;
  cycle_close_note: string;
}

function resolveLookup(field: ZohoLookup | string | null): {
  name: string | null;
  id: string | null;
} {
  if (!field) return { name: null, id: null };
  if (typeof field === 'object') {
    return {
      name: field.name ?? null,
      id: field.id != null ? String(field.id) : null,
    };
  }
  return { name: String(field), id: null };
}

/** Which segment an appointment Type falls in. Treatment lives in a separate
 *  Deals pipeline and is handled by the manual free-appointment path, not
 *  here. */
// The confirmed Novo (obesity) track booking types, normalized. The source of
// truth for these values is the revenue spec and the live Type distribution;
// kept as a constant here so segmentOf stays a pure, unit-testable function. If
// they ever need to be editable without a deploy, move them to the novo payout
// rule's params and thread them in.
const NOVO_TYPES = new Set(['novo_scheduled', 'novo_instant']);

// Normalized booking Type: trimmed, inner whitespace collapsed, lowercased. The
// Zoho Type field is free text with inconsistent casing and spacing, so every
// classification runs on this form, never the raw string.
function normalizeBookingType(type: string | null): string {
  return (type ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// A consult is Novo when its normalized Type is in the Novo set; everything
// else, including a missing or unrecognized Type, is treated as standard, so no
// booking is left out. This replaces the old startsWith('novo') test, which was
// case sensitive and missed the real values ("Novo Instant", "novo_scheduled").
export function segmentOf(type: string | null): 'scheduled' | 'novo' {
  return NOVO_TYPES.has(normalizeBookingType(type)) ? 'novo' : 'scheduled';
}

interface RuleSet {
  scheduled: PayoutRuleRow | null;
  novo: PayoutRuleRow | null;
  /** Per-doctor flat-rate overrides, keyed by Zoho doctor id (first wins). */
  byDoctor: Map<string, PayoutRuleRow>;
}

export function pickRules(rules: PayoutRuleRow[]): RuleSet {
  let scheduled: PayoutRuleRow | null = null;
  let novo: PayoutRuleRow | null = null;
  const byDoctor = new Map<string, PayoutRuleRow>();
  for (const r of rules) {
    const segment = r.scope?.segment;
    if (segment === 'scheduled' && !scheduled) scheduled = r;
    if (segment === 'novo' && !novo) novo = r;
    const doctorId = r.scope?.doctor_id;
    if (typeof doctorId === 'string' && !byDoctor.has(doctorId)) {
      byDoctor.set(doctorId, r);
    }
  }
  return { scheduled, novo, byDoctor };
}

export class CommissionService {
  constructor(
    private readonly crm: CrmReadService,
    private readonly rules: PayoutRulesService,
    private readonly manual: ManualLedgerService,
    private readonly patients: PatientSerializer,
  ) {}

  /** Cycle defaults to the current month (YYYY-MM). */
  private normaliseCycle(cycle?: string): string {
    if (cycle && /^\d{4}-\d{2}$/.test(cycle)) return cycle;
    return new Date().toISOString().slice(0, 7);
  }

  /** Per-booking ledger for a cycle: gross vs Saleem revenue, rule applied,
   *  patient initials. CRM-derived rows plus manual free-appointment rows. */
  async bookings(
    viewer: RequestViewer,
    cycle?: string,
  ): Promise<{ data: { rows: LedgerBookingRow[] }; parts: SourceMeta[] }> {
    const period = this.normaliseCycle(cycle);
    const { rows, parts } = await this.compute(viewer, period);
    return { data: { rows }, parts };
  }

  /** Cycle summary: gross and Saleem revenue as two separate totals, provider
   *  payouts, counts. */
  async summary(
    viewer: RequestViewer,
    cycle?: string,
  ): Promise<{ data: CommissionSummary; parts: SourceMeta[] }> {
    const period = this.normaliseCycle(cycle);
    const { rows, parts, unset } = await this.compute(viewer, period);

    let gross = 0;
    let revenue = 0;
    let payout = 0;
    for (const r of rows) {
      gross = round2(gross + r.gross_bhd);
      revenue = round2(revenue + r.saleem_revenue_bhd);
      payout = round2(payout + r.provider_payout_bhd);
    }

    return {
      data: {
        cycle: period,
        gross_bhd: gross,
        saleem_revenue_bhd: revenue,
        provider_payouts_bhd: payout,
        booking_count: rows.length,
        commission_unset_count: unset,
        cycle_close_note: 'Cycle closes at month end',
      },
      parts,
    };
  }

  /** Shared computation behind summary and bookings. */
  private async compute(
    viewer: RequestViewer,
    cycle: string,
  ): Promise<{ rows: LedgerBookingRow[]; parts: SourceMeta[]; unset: number }> {
    const [bookingsRead, doctorsRead, hospitalsRead, ruleRows, manualRows] =
      await Promise.all([
        this.crm.bookings(),
        this.crm.doctors(),
        this.crm.hospitals(),
        this.rules.all(),
        this.manual.forCycle(cycle),
      ]);

    const ruleSet = pickRules(ruleRows);

    const doctorMap = new Map<
      string,
      { name: string | null; pct: number | null; hospitalId: string | null }
    >();
    for (const d of doctorsRead.data) {
      const hosp = resolveLookup(d.Parent_Account);
      doctorMap.set(String(d.id), {
        name: d.Name ?? null,
        pct: d.Commission_Percentage ?? null,
        hospitalId: hosp.id,
      });
    }

    const hospitalMap = new Map<string, { pct: number | null }>();
    for (const h of hospitalsRead.data) {
      hospitalMap.set(String(h.id), { pct: h.Commission_Percentage ?? null });
    }

    const rows: LedgerBookingRow[] = [];
    let unset = 0;

    for (const b of bookingsRead.data) {
      if (b.Status !== 'Done') continue;
      const rate = num(b.Rate);
      if (rate <= 1) continue;
      if (bahrainCycle(b.From ?? b.Created_At) !== cycle) continue;
      const segment = segmentOf(b.Type);

      const doc = resolveLookup(b.Doctor);
      const docRec = doc.id ? doctorMap.get(doc.id) : null;
      const hospRec = docRec?.hospitalId
        ? hospitalMap.get(docRec.hospitalId)
        : null;

      const split = this.split(
        segment,
        rate,
        docRec?.pct,
        hospRec?.pct,
        ruleSet,
        doc.id,
      );
      if (!split.commissionSet) unset += 1;

      const base: LedgerBookingRow = {
        id: b.id,
        provider: docRec?.name || doc.name || 'Unassigned',
        patient_ref: this.patients.ref(b.Patient?.id ?? b.id, b.Patient?.name),
        product: b.Type ?? 'Consult',
        gross_bhd: round2(rate),
        saleem_revenue_bhd: split.saleemRevenue,
        provider_payout_bhd: split.providerPayout,
        rule_label: split.ruleLabel,
        manual: false,
      };
      rows.push(this.patients.withName(base, b.Patient?.name, viewer));
    }

    for (const m of manualRows) {
      rows.push(manualToRow(m));
    }

    rows.sort((a, b) => b.gross_bhd - a.gross_bhd);

    return {
      rows,
      parts: [bookingsRead.meta, doctorsRead.meta, hospitalsRead.meta],
      unset,
    };
  }

  /** Gross/revenue/payout split for one booking under the segment's rule. */
  private split(
    segment: 'scheduled' | 'novo',
    rate: number,
    doctorPct: number | null | undefined,
    hospitalPct: number | null | undefined,
    rules: RuleSet,
    doctorId: string | null | undefined,
  ): {
    saleemRevenue: number;
    providerPayout: number;
    ruleLabel: string;
    commissionSet: boolean;
  } {
    return computeBookingSplit(
      segment,
      rate,
      doctorPct,
      hospitalPct,
      rules,
      doctorId,
    );
  }
}

/** Gross/revenue/payout split for one booking. A per-doctor flat-rate override
 *  wins when one exists for the booking's doctor; otherwise the segment's rule
 *  applies (novo flat commission, or scheduled doctor-first percent). */
export function computeBookingSplit(
  segment: 'scheduled' | 'novo',
  rate: number,
  doctorPct: number | null | undefined,
  hospitalPct: number | null | undefined,
  rules: RuleSet,
  doctorId: string | null | undefined,
): {
  saleemRevenue: number;
  providerPayout: number;
  ruleLabel: string;
  commissionSet: boolean;
} {
  if (doctorId) {
    const docRule = rules.byDoctor.get(doctorId);
    if (docRule) {
      const commission = num(docRule.params?.commission_bhd);
      const service = num(docRule.params?.service_charge_bhd);
      const saleemRevenue = round2(commission + service);
      return {
        saleemRevenue,
        providerPayout: round2(rate - saleemRevenue),
        ruleLabel: docRule.label,
        commissionSet: true,
      };
    }
  }

  if (segment === 'novo') {
    const rule = rules.novo;
    const commission = num(rule?.params?.commission_bhd);
    const service = num(rule?.params?.service_charge_bhd);
    const saleemRevenue = round2(commission + service);
    return {
      saleemRevenue,
      providerPayout: round2(rate - saleemRevenue),
      ruleLabel: rule?.label ?? 'Novo appointment',
      commissionSet: true,
    };
  }

  // scheduled
  const rule = rules.scheduled;
  const service = num(rule?.params?.service_charge_bhd);
  let pct = doctorPct;
  if (pct == null) pct = hospitalPct;
  const commissionSet = pct != null;
  const effPct = commissionSet
    ? Number(pct)
    : num(rule?.params?.commission_pct);
  // Commission is taken on the fee after the service charge, not the full fee.
  const commissionBase = Math.max(0, round2(rate - service));
  const commission = round2((commissionBase * effPct) / 100);
  const saleemRevenue = round2(commission + service);
  return {
    saleemRevenue,
    // The provider keeps the fee minus everything Saleem takes.
    providerPayout: round2(rate - saleemRevenue),
    ruleLabel: rule?.label ?? 'Scheduled appointment',
    commissionSet,
  };
}

/** Cycle (YYYY-MM) a booking date falls in, in Bahrain time. */
function bahrainCycle(iso: string | null): string {
  if (!iso) return '';
  const day = new Date(iso).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Bahrain',
  });
  return day.slice(0, 7);
}

/** A manual free-appointment ledger row in the booking shape. saleem_share is
 *  signed: negative means Saleem covers a cost, surfaced as covers_bhd. */
function manualToRow(m: ManualEntryRow): LedgerBookingRow {
  const row: LedgerBookingRow = {
    id: m.id,
    provider: m.provider_label || 'No provider',
    patient_ref: { zoho_id: m.id, initials: '·' },
    product: m.product,
    gross_bhd: round2(m.patient_paid),
    saleem_revenue_bhd: m.saleem_share >= 0 ? round2(m.saleem_share) : 0,
    provider_payout_bhd: round2(m.provider_payout),
    rule_label: 'Free to patient',
    manual: true,
  };
  if (m.saleem_share < 0) {
    row.covers_bhd = round2(-m.saleem_share);
    row.saleem_revenue_bhd = 0;
  }
  return row;
}

// ===========================================================================
// Human-readable rule params line (payouts.controller.ts paramsDisplay)
// ===========================================================================

/** Human-readable params line per rule, for the rules list subtitle. Ported
 *  verbatim from the backend PayoutsController. */
export function paramsDisplay(rule: {
  scope: Record<string, unknown>;
  params: Record<string, unknown>;
}): string {
  if (typeof rule.scope?.doctor_id === 'string') {
    const commission = Number(rule.params?.commission_bhd) || 0;
    const service = Number(rule.params?.service_charge_bhd) || 0;
    if (service > 0) {
      return `Flat commission BHD ${commission}, plus service charge BHD ${service}`;
    }
    return `Flat commission BHD ${commission}, no service charge`;
  }
  const segment = rule.scope?.segment;
  const service = Number(rule.params?.service_charge_bhd) || 0;
  if (segment === 'novo') {
    const commission = Number(rule.params?.commission_bhd) || 0;
    return `Flat commission BHD ${commission}, no service charge`;
  }
  const pct = Number(rule.params?.commission_pct) || 0;
  const pctLine =
    pct > 0
      ? `commission ${pct}% when the doctor has none set`
      : 'commission from the doctor, then the hospital';
  return `Service charge BHD ${service} plus ${pctLine}`;
}

// ===========================================================================
// Rules list shape (payouts.controller.ts rulesList). Shared by GET /rules and
// the PATCH /rules/:id response (the backend's patchRule returns rulesList).
// ===========================================================================

export interface PayoutRuleItem {
  id: number;
  priority: number;
  rule_type: 'campaign' | 'fixed_fee' | 'percent';
  label: string;
  params_display: string;
  params: Record<string, unknown>;
  editable_keys: string[];
  updated_by: string | null;
  updated_at: string;
  can_edit: boolean;
}

/** Build the rules-list payload exactly as the backend PayoutsController did:
 *  every rule shaped with its display line, the editable keys it exposes, and
 *  the viewer's can_edit flag. */
export async function rulesList(
  viewer: RequestViewer,
): Promise<{ rules: PayoutRuleItem[] }> {
  const all = await getPayoutRulesService().all();
  const canEdit = viewer.can_edit_payout_rules;
  return {
    rules: all.map((r) => ({
      id: r.id,
      priority: r.priority,
      rule_type: r.rule_type,
      label: r.label,
      params_display: paramsDisplay(r),
      params: r.params,
      editable_keys: EDITABLE_PARAM_KEYS.filter((k) => k in r.params),
      updated_by: r.updated_by,
      updated_at: r.updated_at,
      can_edit: canEdit,
    })),
  };
}

// ===========================================================================
// globalThis-pinned singletons (replace NestJS DI). Each warm serverless
// instance reuses one set, sharing the pool, CRM read cache, and patient gate.
// ===========================================================================

interface PayoutsServices {
  rules: PayoutRulesService;
  manual: ManualLedgerService;
  commission: CommissionService;
}

const PAYOUTS_KEY = '__payoutsServices';

type GlobalWithPayouts = typeof globalThis & {
  [PAYOUTS_KEY]?: PayoutsServices;
};

function getServices(): PayoutsServices {
  const g = globalThis as GlobalWithPayouts;
  if (!g[PAYOUTS_KEY]) {
    const pool = getPool();
    const rules = new PayoutRulesService(pool);
    const manual = new ManualLedgerService(pool);
    const commission = new CommissionService(
      getCrmRead(),
      rules,
      manual,
      patientSerializer,
    );
    g[PAYOUTS_KEY] = { rules, manual, commission };
  }
  return g[PAYOUTS_KEY];
}

export function getPayoutRulesService(): PayoutRulesService {
  return getServices().rules;
}

export function getManualLedgerService(): ManualLedgerService {
  return getServices().manual;
}

export function getCommissionService(): CommissionService {
  return getServices().commission;
}

// The record lists behind the auto KPI numbers, ported from the legacy
// lib/kpi/computeKpis.js kpiContributors(): consultations and revenue come
// from Telemedicine deals plus off-CRM bookings (deduped by patient name,
// server-side only), provider metrics from Doctor and Hospital or Clinic
// deals, lead metrics from the Zoho Leads module.
//
// Rows are reference-only for every viewer: who appears as initials through
// the PatientSerializer, never a name. Counts are honest; when a list is
// longer than the row cap, total carries the full count and the rows are
// the latest slice.
//
// Ported from the NestJS backend src/kpi/kpi-drill.service.ts. The @Injectable
// class with its CrmReadService and PatientSerializer dependencies becomes a
// plain exported class taking the spine accessors: getCrmRead() for the cached
// CRM reads and the shared patientSerializer instance for initials. Business
// logic and DTOs are verbatim; BadRequestException becomes BadRequestError.
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getCrmRead()). Never import
// from a client component.
import { BadRequestError } from '../errors';
import {
  getCrmRead,
  type CrmReadService,
  LOST_STAGE,
  WON_STAGE,
  type BookingRecord,
  type DealRecord,
  type LeadRecord,
} from '../crm-read';
import { patientSerializer, type PatientSerializer } from '../privacy';
import type { SourceMeta } from '../envelope';
import { DRILLABLE_METRICS } from './kpi';

export interface DrillColumnData {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface DrillData {
  metric_key: string;
  month: string;
  columns: DrillColumnData[];
  rows: Array<Record<string, string | number | null>>;
  /** Full count behind the number; rows may be a capped slice of it. */
  total: number;
  summary: string | null;
}

/** Telemedicine stages meaning a consultation was actually booked. */
const CONSULT_BOOKED_STAGES = new Set([
  'Consultation Scheduled',
  'Consult Payment',
  'Payment Done',
  'TeleConsult Completed',
]);

/** Treatment stages meaning medical travel has started. */
const TREATMENT_STARTED_STAGES = new Set([
  'Treatment Scheduled',
  'Treatment in Progress',
  'Treatment Completed',
]);

const ROW_CAP = 200;

const DEAL_COLUMNS: DrillColumnData[] = [
  { key: 'who', label: 'Who' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount', numeric: true },
];

const PROVIDER_COLUMNS: DrillColumnData[] = [
  { key: 'who', label: 'Provider' },
  { key: 'kind', label: 'Type' },
  { key: 'stage', label: 'Stage' },
  { key: 'date', label: 'Date' },
];

const LEAD_COLUMNS: DrillColumnData[] = [
  { key: 'who', label: 'Lead' },
  { key: 'segment', label: 'Segment' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'date', label: 'Created' },
];

function inMonth(iso: string | null, month: string): boolean {
  return (iso ?? '').slice(0, 7) === month;
}

function dayDisplay(iso: string | null): string {
  if (!iso) return '·';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '·';
  return d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Bahrain',
    month: 'short',
    day: 'numeric',
  });
}

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase().trim();

type Row = Record<string, string | number | null> & { _sort: string };

export class KpiDrillService {
  constructor(
    private readonly crm: CrmReadService,
    private readonly patients: PatientSerializer,
  ) {}

  isDrillable(metric: string): boolean {
    return DRILLABLE_METRICS.has(metric);
  }

  async drill(
    metric: string,
    month: string,
  ): Promise<{ data: DrillData; parts: SourceMeta[] }> {
    if (!this.isDrillable(metric)) {
      throw new BadRequestError(
        `${metric} has no record list behind it. It is a typed-in or rate metric.`,
      );
    }

    switch (metric) {
      case 'consultations_booked':
      case 'consultations_completed':
      case 'revenue':
        return this.consultDrill(metric, month);
      case 'medical_travel_started':
      case 'medical_travel_leads':
      case 'qualified_leads':
        return this.dealDrill(metric, month);
      case 'providers_contacted':
      case 'providers_live':
        return this.providerDrill(metric, month);
      default:
        return this.leadDrill(metric, month);
    }
  }

  /** Telemedicine deals plus off-CRM bookings, deduped like the legacy
   *  compute: a booking whose patient name matches a Telemedicine deal
   *  contact is the same consult, counted once on the CRM side. */
  private async consultDrill(
    metric: 'consultations_booked' | 'consultations_completed' | 'revenue',
    month: string,
  ): Promise<{ data: DrillData; parts: SourceMeta[] }> {
    const [dealsRead, bookingsRead] = await Promise.all([
      this.crm.deals(),
      this.crm.bookings(),
    ]);

    const telem = dealsRead.data.filter(
      (d) => d.Pipeline === 'Telemedicine' && inMonth(d.Created_Time, month),
    );
    const crmNames = new Set(
      telem.map((d) => lower(d.Contact_Name?.name)).filter(Boolean),
    );
    // Rate <= 1 are test bookings, excluded to match the legacy routes.
    const offCrm = bookingsRead.data.filter(
      (b) =>
        (b.Rate ?? 0) > 1 &&
        inMonth(b.From ?? b.Created_At, month) &&
        !crmNames.has(lower(b.Patient?.name)),
    );

    let dealPick: (d: DealRecord) => boolean;
    let bookingPick: (b: BookingRecord) => boolean;
    if (metric === 'consultations_booked') {
      dealPick = (d) => CONSULT_BOOKED_STAGES.has(d.Stage ?? '');
      bookingPick = (b) => b.Status !== 'Cancelled';
    } else {
      dealPick = (d) => d.Stage === WON_STAGE.Telemedicine;
      bookingPick = (b) => b.Status === 'Done';
    }

    const rows: Row[] = [
      ...telem.filter(dealPick).map((d) => this.dealRow(d)),
      ...offCrm.filter(bookingPick).map((b) => this.bookingRow(b)),
    ];

    let summary: string | null = null;
    if (metric === 'revenue') {
      const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      summary = `Total: BHD ${Math.round(total).toLocaleString('en-US')} across ${rows.length} records.`;
    }

    return {
      data: this.finish(metric, month, DEAL_COLUMNS, rows, summary),
      parts: [dealsRead.meta, bookingsRead.meta],
    };
  }

  private async dealDrill(
    metric:
      | 'medical_travel_started'
      | 'medical_travel_leads'
      | 'qualified_leads',
    month: string,
  ): Promise<{ data: DrillData; parts: SourceMeta[] }> {
    const dealsRead = await this.crm.deals();
    const inRange = dealsRead.data.filter((d) =>
      inMonth(d.Created_Time, month),
    );

    let picked: DealRecord[];
    if (metric === 'qualified_leads') {
      picked = inRange.filter(
        (d) =>
          d.Pipeline === 'Telemedicine' &&
          d.Stage !== 'New Deal' &&
          d.Stage !== 'Quote Proposed' &&
          d.Stage !== LOST_STAGE.Telemedicine,
      );
    } else {
      const treatment = inRange.filter((d) => d.Pipeline === 'Treatment');
      picked =
        metric === 'medical_travel_started'
          ? treatment.filter((d) => TREATMENT_STARTED_STAGES.has(d.Stage ?? ''))
          : treatment;
    }

    return {
      data: this.finish(
        metric,
        month,
        DEAL_COLUMNS,
        picked.map((d) => this.dealRow(d)),
        null,
      ),
      parts: [dealsRead.meta],
    };
  }

  private async providerDrill(
    metric: 'providers_contacted' | 'providers_live',
    month: string,
  ): Promise<{ data: DrillData; parts: SourceMeta[] }> {
    const dealsRead = await this.crm.deals();
    const providerDeals = dealsRead.data.filter(
      (d) => d.Pipeline === 'Doctor' || d.Pipeline === 'Hospital or Clinic',
    );

    let picked: DealRecord[];
    let summary: string | null = null;
    if (metric === 'providers_contacted') {
      picked = providerDeals.filter(
        (d) =>
          inMonth(d.Created_Time, month) &&
          d.Stage !== LOST_STAGE[d.Pipeline ?? ''],
      );
    } else {
      // Live providers key off when the deal went live. Zoho's close date
      // is not in this read, so the last update stands in for it; the
      // summary says so instead of presenting the date as exact.
      picked = providerDeals.filter(
        (d) =>
          d.Stage === WON_STAGE[d.Pipeline ?? ''] &&
          inMonth(d.Modified_Time, month),
      );
      summary =
        'Dates show when each deal was last updated. Zoho does not expose the exact go-live date here.';
    }

    const rows: Row[] = picked.map((d) => ({
      who: this.patients.initialsOf(d.Contact_Name?.name),
      kind: d.Pipeline === 'Hospital or Clinic' ? 'Clinic' : 'Doctor',
      stage: d.Stage ?? '·',
      date: dayDisplay(
        metric === 'providers_live' ? d.Modified_Time : d.Created_Time,
      ),
      _sort:
        (metric === 'providers_live' ? d.Modified_Time : d.Created_Time) ?? '',
    }));

    return {
      data: this.finish(metric, month, PROVIDER_COLUMNS, rows, summary),
      parts: [dealsRead.meta],
    };
  }

  private async leadDrill(
    metric: string,
    month: string,
  ): Promise<{ data: DrillData; parts: SourceMeta[] }> {
    const leadsRead = await this.crm.leads();
    const inRange = leadsRead.data.filter((l) =>
      inMonth(l.Created_Time, month),
    );

    const picked =
      metric === 'b2c_leads'
        ? inRange.filter((l) => l.Layout?.name === 'B2C')
        : metric === 'b2b_leads'
          ? inRange.filter((l) => l.Layout?.name === 'B2B')
          : inRange;

    return {
      data: this.finish(
        metric,
        month,
        LEAD_COLUMNS,
        picked.map((l) => this.leadRow(l)),
        null,
      ),
      parts: [leadsRead.meta],
    };
  }

  private dealRow(d: DealRecord): Row {
    return {
      who: this.patients.initialsOf(d.Contact_Name?.name),
      source: 'CRM',
      stage: d.Stage ?? '·',
      date: dayDisplay(d.Created_Time),
      amount: d.Amount ?? null,
      _sort: d.Created_Time ?? '',
    };
  }

  private bookingRow(b: BookingRecord): Row {
    return {
      who: this.patients.initialsOf(b.Patient?.name),
      source: 'Booking',
      stage: b.Status ?? '·',
      date: dayDisplay(b.From ?? b.Created_At),
      amount: b.Rate ?? null,
      _sort: b.From ?? b.Created_At ?? '',
    };
  }

  private leadRow(l: LeadRecord): Row {
    const name = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
    return {
      who: this.patients.initialsOf(name),
      segment: l.Layout?.name ?? null,
      status: l.Lead_Status ?? null,
      source: l.Lead_Source ?? null,
      date: dayDisplay(l.Created_Time),
      _sort: l.Created_Time ?? '',
    };
  }

  /** Sort newest first, cap the slice, keep the count honest. */
  private finish(
    metric: string,
    month: string,
    columns: DrillColumnData[],
    rows: Row[],
    summary: string | null,
  ): DrillData {
    const sorted = [...rows].sort((a, b) => b._sort.localeCompare(a._sort));
    const sliced = sorted.slice(0, ROW_CAP).map((row) => {
      const { _sort, ...rest } = row;
      void _sort;
      return rest;
    });
    return {
      metric_key: metric,
      month,
      columns,
      rows: sliced,
      total: rows.length,
      summary,
    };
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm CRM read cache and the stateless patient serializer across every
// kpi-drill-facing route within one warm instance.
const KPI_DRILL_KEY = '__kpiDrillService';

type GlobalWithKpiDrill = typeof globalThis & {
  [KPI_DRILL_KEY]?: KpiDrillService;
};

export function getKpiDrillService(): KpiDrillService {
  const g = globalThis as GlobalWithKpiDrill;
  if (!g[KPI_DRILL_KEY]) {
    g[KPI_DRILL_KEY] = new KpiDrillService(getCrmRead(), patientSerializer);
  }
  return g[KPI_DRILL_KEY];
}

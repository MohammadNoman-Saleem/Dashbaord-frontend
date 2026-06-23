// "CRM, a closer look": a paginated raw-record slice with server-driven
// columns, so the same table renders leads, treatment deals, and providers.
// Patient privacy: lead and treatment rows reference the person by initials
// only (their names are patient PII in the patient pipelines); provider
// rows show the deal name, which is a business name.
//
// Ported from the NestJS backend src/crm/crm.service.ts. The @Injectable
// CrmSliceService with its CrmReadService and PatientSerializer dependencies
// becomes a plain exported class taking the spine accessors: getCrmRead() for
// the cached CRM reads and the shared patientSerializer for the per-field
// patient gate (initials only on this surface). NestJS BadRequestException is
// swapped for the foundation BadRequestError. Business logic and DTOs are
// verbatim.
//
// Per-field patient gate: leads and treatment rows put initialsOf(name) into
// the record column and never emit the full name or phone, so no name-seeing
// branch applies on this surface; the global sweep in handler() remains the
// backstop. Provider rows are business names, not patient data.
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getCrmRead()). Never import
// from a client component.
import {
  getCrmRead,
  type CrmReadService,
  type DealRecord,
  type LeadRecord,
} from '../crm-read';
import { patientSerializer, PatientSerializer } from '../privacy';
import type { SourceMeta } from '../envelope';
import { BadRequestError } from '../errors';

export type CrmResource = 'leads' | 'treatment' | 'providers';

export interface CrmColumnData {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface CrmSlicePayload {
  columns: CrmColumnData[];
  rows: Array<Record<string, string | number | null>>;
  page: number;
  pages: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;

const BAHRAIN_TZ = 'Asia/Bahrain';

function bahrainDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ });
}

/** "Today 9:14 AM", "Yesterday", "Jun 8". */
function loggedDisplay(iso: string | null): string {
  if (!iso) return '·';
  const now = new Date();
  const day = bahrainDay(iso);
  if (day === bahrainDay(now.toISOString())) {
    const time = new Date(iso).toLocaleTimeString('en-US', {
      timeZone: BAHRAIN_TZ,
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Today ${time}`;
  }
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day === bahrainDay(yesterday.toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: BAHRAIN_TZ,
    month: 'short',
    day: 'numeric',
  });
}

function newestFirst(a: string | null, b: string | null): number {
  return (b ?? '').localeCompare(a ?? '');
}

export class CrmSliceService {
  constructor(
    private readonly crm: CrmReadService,
    private readonly patients: PatientSerializer,
  ) {}

  parseResource(value: string | undefined): CrmResource {
    if (value === 'leads' || value === 'treatment' || value === 'providers') {
      return value;
    }
    throw new BadRequestError(
      'resource must be one of leads, treatment, providers.',
    );
  }

  async slice(
    resource: CrmResource,
    pageRaw: string | undefined,
    pageSizeRaw: string | undefined,
  ): Promise<{ data: CrmSlicePayload; parts: SourceMeta[] }> {
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(pageSizeRaw) || DEFAULT_PAGE_SIZE),
    );
    const page = Math.max(1, Number(pageRaw) || 1);

    if (resource === 'leads') {
      const read = await this.crm.leads();
      const sorted = [...read.data].sort((a, b) =>
        newestFirst(a.Created_Time, b.Created_Time),
      );
      return {
        data: this.paginate(
          [
            { key: 'record', label: 'Record' },
            { key: 'source', label: 'Source' },
            { key: 'status', label: 'Status' },
            { key: 'logged', label: 'Logged' },
          ],
          sorted.map((l) => this.leadRow(l)),
          page,
          pageSize,
        ),
        parts: [read.meta],
      };
    }

    const read = await this.crm.deals();
    if (resource === 'treatment') {
      const sorted = read.data
        .filter((d) => d.Pipeline === 'Treatment')
        .sort((a, b) => newestFirst(a.Created_Time, b.Created_Time));
      return {
        data: this.paginate(
          [
            { key: 'record', label: 'Record' },
            { key: 'stage', label: 'Stage' },
            { key: 'source', label: 'Source' },
            { key: 'logged', label: 'Logged' },
          ],
          sorted.map((d) => this.treatmentRow(d)),
          page,
          pageSize,
        ),
        parts: [read.meta],
      };
    }

    const sorted = read.data
      .filter(
        (d) => d.Pipeline === 'Doctor' || d.Pipeline === 'Hospital or Clinic',
      )
      .sort((a, b) => newestFirst(a.Created_Time, b.Created_Time));
    return {
      data: this.paginate(
        [
          { key: 'record', label: 'Record' },
          { key: 'pipeline', label: 'Pipeline' },
          { key: 'stage', label: 'Stage' },
          { key: 'logged', label: 'Logged' },
        ],
        sorted.map((d) => this.providerRow(d)),
        page,
        pageSize,
      ),
      parts: [read.meta],
    };
  }

  private leadRow(lead: LeadRecord): Record<string, string | number | null> {
    const name = [lead.First_Name, lead.Last_Name].filter(Boolean).join(' ');
    return {
      record: `Lead · ${this.patients.initialsOf(name)}`,
      source: lead.Lead_Source ?? '·',
      status: lead.Lead_Status ?? '·',
      logged: loggedDisplay(lead.Created_Time),
    };
  }

  private treatmentRow(
    deal: DealRecord,
  ): Record<string, string | number | null> {
    return {
      record: `Patient ${this.patients.initialsOf(deal.Contact_Name?.name)}`,
      stage: deal.Stage ?? '·',
      source: deal.Lead_Source ?? '·',
      logged: loggedDisplay(deal.Created_Time),
    };
  }

  private providerRow(
    deal: DealRecord,
  ): Record<string, string | number | null> {
    return {
      record: deal.Deal_Name ?? 'Unnamed provider',
      pipeline: deal.Pipeline ?? '·',
      stage: deal.Stage ?? '·',
      logged: loggedDisplay(deal.Created_Time),
    };
  }

  private paginate(
    columns: CrmColumnData[],
    rows: Array<Record<string, string | number | null>>,
    page: number,
    pageSize: number,
  ): CrmSlicePayload {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const clamped = Math.min(page, pages);
    return {
      columns,
      rows: rows.slice((clamped - 1) * pageSize, clamped * pageSize),
      page: clamped,
      pages,
      total,
    };
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm CRM read cache and the stateless patient serializer across every
// crm-facing route within one warm instance.
const CRM_SLICE_KEY = '__crmSliceService';

type GlobalWithCrmSlice = typeof globalThis & {
  [CRM_SLICE_KEY]?: CrmSliceService;
};

export function getCrmSliceService(): CrmSliceService {
  const g = globalThis as GlobalWithCrmSlice;
  if (!g[CRM_SLICE_KEY]) {
    g[CRM_SLICE_KEY] = new CrmSliceService(getCrmRead(), patientSerializer);
  }
  return g[CRM_SLICE_KEY];
}

// The four KPI cards on the cases view, derived from live CRM deals in the
// two patient pipelines. Card copy is authored here, server-side, so the web
// app and the MCP say the same words.
//
// Ported from the NestJS backend src/cases/cases.service.ts. The @Injectable
// class with its CrmReadService and PipelineService dependencies becomes a
// plain exported class taking the spine accessors: getCrmRead() for the cached
// CRM reads and getPipelineService() for the running-late list. Business logic
// and DTOs are verbatim. The card type is the shared KpiStripCardDto from
// contracts.ts (imported, not redefined).
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getCrmRead()). Never import
// from a client component.
import {
  getCrmRead,
  type CrmReadService,
  PATIENT_PIPELINES,
  WON_STAGE,
  isOpenDeal,
} from '../crm-read';
import {
  getPipelineService,
  type PipelineService,
} from './pipeline';
import {
  localityOfDestination,
  serviceOfPipeline,
} from '../classification';
import type { KpiStripCardDto } from '../contracts';
import type { SourceMeta } from '../envelope';

export interface CasesSummaryPayload {
  cards: KpiStripCardDto[];
  /** The assembled split strings (07 section 3), authored server-side so
   *  the tiles and any export read identically. Unclassified deals are
   *  appended, never silently bucketed. */
  splits: {
    active_by_service: string;
    treatment_in_progress_by_locality: string;
  };
}

// Business periods are relative to Asia/Bahrain, not the server's local zone.
// Bahrain is UTC+3 with no daylight saving, so the local wall clock is the UTC
// instant shifted forward three hours; this is the same offset approach used by
// the cockpit SLA helpers. On a server not in Bahrain the week and month must
// still roll over at the Bahrain instant.
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Monday 00:00 Bahrain of the current week, returned as the UTC instant of
 *  that moment so it can be compared directly against deal Created_Time. The
 *  week starts on Monday, unchanged from the prior implementation. */
function startOfWeek(now: Date): Date {
  // Wall-clock components in Bahrain: read the shifted instant in UTC terms.
  const bahrain = new Date(now.getTime() + BAHRAIN_OFFSET_MS);
  const day = bahrain.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  // Bahrain midnight at the start of the week, expressed as a UTC instant
  // (subtract the offset back off the shifted midnight).
  const mondayBahrainMidnightUtc = Date.UTC(
    bahrain.getUTCFullYear(),
    bahrain.getUTCMonth(),
    bahrain.getUTCDate() - daysFromMonday,
  );
  return new Date(mondayBahrainMidnightUtc - BAHRAIN_OFFSET_MS);
}

/** The current year-month in Bahrain as YYYY-MM, for the won-this-month match. */
function bahrainMonthKey(now: Date): string {
  return new Date(now.getTime() + BAHRAIN_OFFSET_MS).toISOString().slice(0, 7);
}

export class CasesService {
  constructor(
    private readonly crm: CrmReadService,
    private readonly pipeline: PipelineService,
  ) {}

  async summary(): Promise<{
    data: CasesSummaryPayload;
    parts: SourceMeta[];
  }> {
    const [dealsRead, health] = await Promise.all([
      this.crm.deals(),
      this.pipeline.health(),
    ]);
    const now = new Date();

    const patientDeals = dealsRead.data.filter((d) =>
      PATIENT_PIPELINES.includes(d.Pipeline ?? ''),
    );

    const openPatientDeals = patientDeals.filter(isOpenDeal);
    const active = openPatientDeals.length;

    // The live service split for the Active deals tile note.
    const tele = openPatientDeals.filter(
      (d) => serviceOfPipeline(d.Pipeline) === 'tele',
    ).length;
    const activeSplit = `${tele} telemedicine, ${active - tele} medical travel`;

    // Within-Treatment locality split for the Treatment in progress tile.
    const treatmentOpen = openPatientDeals.filter(
      (d) => d.Pipeline === 'Treatment',
    );
    const byLocality = { local: 0, travel: 0, unclassified: 0 };
    for (const deal of treatmentOpen) {
      byLocality[
        localityOfDestination(deal.Prefered_Country_of_Treatment_Consultation)
      ]++;
    }
    let treatmentSplit = `${byLocality.travel} medical travel, ${byLocality.local} local hospital`;
    if (byLocality.unclassified > 0) {
      treatmentSplit += `, ${byLocality.unclassified} unclassified`;
    }

    const weekStart = startOfWeek(now);
    const newThisWeek = patientDeals.filter(
      (d) => d.Created_Time && new Date(d.Created_Time) >= weekStart,
    ).length;

    const late = health.data.items;
    const worst = late[0];

    const monthKey = bahrainMonthKey(now);
    const won = patientDeals.filter(
      (d) =>
        d.Stage === WON_STAGE[d.Pipeline ?? ''] &&
        (d.Modified_Time ?? '').slice(0, 7) === monthKey,
    ).length;
    const monthName = now.toLocaleDateString('en-US', {
      month: 'long',
      timeZone: 'Asia/Bahrain',
    });

    const cards: KpiStripCardDto[] = [
      {
        metric_key: 'cases_active_deals',
        label: 'Active deals',
        value_display: String(active),
        note: activeSplit,
        dot: 'good',
      },
      {
        metric_key: 'cases_new_this_week',
        label: 'New this week',
        value_display: String(newThisWeek),
        note: 'Patient deals logged since Monday',
        dot: 'good',
      },
      {
        metric_key: 'cases_running_late',
        label: 'Running late',
        value_display: String(late.length),
        note: worst
          ? `Worst is ${worst.over_by_days} ${worst.over_by_days === 1 ? 'day' : 'days'} over`
          : 'Nothing is past its stage promise',
        dot: late.length > 0 ? 'warn' : 'good',
      },
      {
        metric_key: 'cases_won_this_month',
        label: `Won in ${monthName}`,
        value_display: String(won),
        note: 'Telemedicine and Treatment together',
        dot: 'good',
      },
    ];

    return {
      data: {
        cards,
        splits: {
          active_by_service: activeSplit,
          treatment_in_progress_by_locality: treatmentSplit,
        },
      },
      parts: [dealsRead.meta, ...health.parts],
    };
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm CRM read cache and the pipeline service across every cases-facing
// route within one warm instance.
const CASES_KEY = '__casesService';

type GlobalWithCases = typeof globalThis & {
  [CASES_KEY]?: CasesService;
};

export function getCasesService(): CasesService {
  const g = globalThis as GlobalWithCases;
  if (!g[CASES_KEY]) {
    g[CASES_KEY] = new CasesService(getCrmRead(), getPipelineService());
  }
  return g[CASES_KEY];
}

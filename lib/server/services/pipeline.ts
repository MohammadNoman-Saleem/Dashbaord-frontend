// The priority queue and the running-late list, computed from live CRM
// records per the launch rules: new leads first, then deals going quiet,
// then today's follow-ups. All plain-language strings are authored here,
// server-side, so the web app and the MCP say the same words.
//
// Ported from the NestJS backend src/pipeline/pipeline.service.ts. The
// @Injectable class with its CrmReadService and PatientSerializer
// dependencies becomes a plain exported class taking the spine accessors:
// getCrmRead() for the cached CRM reads and the shared patientSerializer for
// the per-field patient gate. Business logic and DTOs are verbatim.
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getCrmRead()). Never import
// from a client component.
import {
  getCrmRead,
  type CrmReadService,
  LOST_STAGE,
  PATIENT_PIPELINES,
  STAGE_SLA_DAYS,
  WON_STAGE,
  isOpenDeal,
  type DealRecord,
  type LeadRecord,
} from '../crm-read';
import {
  patientSerializer,
  PatientSerializer,
  type PatientRef,
} from '../privacy';
import type { SourceMeta } from '../envelope';
import type { RequestViewer } from '../auth/viewer';
import {
  kindOfDeal,
  providerScopeOf,
  serviceOfPipeline,
  type DealKind,
  type ProviderScope,
  type Service,
} from '../classification';

export interface PriorityRowData {
  patient_ref: PatientRef;
  patient_name?: string;
  // The cockpit case lookup key (the record's own id), distinct from
  // patient_ref.zoho_id which is the contact id for deals.
  case_id: string;
  why_now: { label: string; tone: 'info' | 'warn' | 'good' };
  pipeline: string;
  /** tele or travel for patient deal rows; null on new-lead rows, which
   *  have no deal yet (07 section 2). */
  service: Service | null;
  waiting_display: string;
  next_step: string;
  source: string;
}

export interface PrioritiesPayload {
  rows: PriorityRowData[];
  counts: { shown: number; queued: number; dormant: number };
}

export interface LateItemData {
  what: string;
  promise_plain: string;
  owner: string;
  over_by_days: number;
  /** patient, provider, or corp from the deal's CRM layout, for the
   *  running-late kind pills (07 section 3). */
  kind: DealKind | null;
}

export interface ProviderScopeData {
  stages: Array<{ label: string; count: number }>;
  foot: string;
}

export interface ProvidersPayload {
  scopes: {
    all: ProviderScopeData;
    local: ProviderScopeData;
    intl: ProviderScopeData;
  };
  /** Providers with no country set; they appear under All only and the All
   *  footer says so (07 section 2). */
  unclassified: number;
  awaiting_signoff: string[];
}

export interface HandoffsPayload {
  on_time_pct: number;
  on_time_count: number;
  total: number;
  misses: Array<{ what: string; owner: string; cause: string; when: string }>;
}

const SHOWN_CAP = 25;
const QUIET_AFTER_DAYS = 3;
const DORMANT_AFTER_DAYS = 30;
const NEW_LEAD_WINDOW_HOURS = 48;
const LATE_CAP = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));
}

function hoursSince(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, (now - new Date(iso).getTime()) / (60 * 60 * 1000));
}

function waitingFromHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

function leadName(lead: LeadRecord): string | null {
  const name = [lead.First_Name, lead.Last_Name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || null;
}

export class PipelineService {
  constructor(
    private readonly crm: CrmReadService,
    private readonly patients: PatientSerializer,
  ) {}

  async priorities(
    viewer: RequestViewer,
  ): Promise<{ data: PrioritiesPayload; parts: SourceMeta[] }> {
    const [dealsRead, leadsRead] = await Promise.all([
      this.crm.deals(),
      this.crm.leads(),
    ]);
    const now = Date.now();

    const rows: PriorityRowData[] = [];

    // 1. New leads inside the reply window, oldest waiting first.
    const newLeads = leadsRead.data
      .filter((l) => !l.Converted && l.Lead_Status !== 'Deal Ready')
      .filter((l) => hoursSince(l.Created_Time, now) <= NEW_LEAD_WINDOW_HOURS)
      .sort((a, b) =>
        (a.Created_Time ?? '').localeCompare(b.Created_Time ?? ''),
      );
    for (const lead of newLeads) {
      const row: PriorityRowData = {
        patient_ref: this.patients.ref(lead.id, leadName(lead)),
        case_id: lead.id,
        why_now: { label: 'New lead', tone: 'info' },
        pipeline: 'New lead',
        service: null,
        waiting_display: waitingFromHours(hoursSince(lead.Created_Time, now)),
        next_step: 'Reply, qualify, and log the outcome',
        source: lead.Lead_Source ?? '·',
      };
      rows.push(this.patients.withName(row, leadName(lead), viewer));
    }

    // 2. Open patient deals gone quiet.
    const openPatientDeals = dealsRead.data.filter(
      (d) => PATIENT_PIPELINES.includes(d.Pipeline ?? '') && isOpenDeal(d),
    );
    const quiet = openPatientDeals
      .map((d) => ({ deal: d, days: daysSince(d.Modified_Time, now) }))
      .filter((x) => x.days >= QUIET_AFTER_DAYS && x.days <= DORMANT_AFTER_DAYS)
      .sort((a, b) => b.days - a.days);
    for (const { deal, days } of quiet) {
      const row: PriorityRowData = {
        patient_ref: this.patients.ref(
          deal.Contact_Name?.id ?? deal.id,
          deal.Contact_Name?.name,
        ),
        case_id: deal.id,
        why_now: { label: `Quiet ${days} days`, tone: 'warn' },
        pipeline: `${deal.Pipeline}, ${deal.Stage ?? 'open'}`,
        service: serviceOfPipeline(deal.Pipeline),
        waiting_display: `${days}d`,
        next_step: 'Nudge with a follow-up before it goes cold',
        source: deal.Lead_Source ?? '·',
      };
      rows.push(this.patients.withName(row, deal.Contact_Name?.name, viewer));
    }

    // 3. Follow-ups due today or overdue.
    const today = new Date(now).toISOString().slice(0, 10);
    const followUps = openPatientDeals.filter(
      (d) => d.Next_Follow_up && d.Next_Follow_up.slice(0, 10) <= today,
    );
    for (const deal of followUps) {
      const row: PriorityRowData = {
        patient_ref: this.patients.ref(
          deal.Contact_Name?.id ?? deal.id,
          deal.Contact_Name?.name,
        ),
        case_id: deal.id,
        why_now: { label: 'Follow-up', tone: 'good' },
        pipeline: `${deal.Pipeline}, ${deal.Stage ?? 'open'}`,
        service: serviceOfPipeline(deal.Pipeline),
        waiting_display: 'Today',
        next_step: 'Make the follow-up call and log it',
        source: deal.Lead_Source ?? '·',
      };
      rows.push(this.patients.withName(row, deal.Contact_Name?.name, viewer));
    }

    const dormant = openPatientDeals.filter(
      (d) => daysSince(d.Modified_Time, now) > DORMANT_AFTER_DAYS,
    ).length;
    const shown = Math.min(SHOWN_CAP, rows.length);

    return {
      data: {
        rows: rows.slice(0, SHOWN_CAP),
        counts: { shown, queued: Math.max(0, rows.length - shown), dormant },
      },
      parts: [dealsRead.meta, leadsRead.meta],
    };
  }

  async health(): Promise<{
    data: { items: LateItemData[] };
    parts: SourceMeta[];
  }> {
    const dealsRead = await this.crm.deals();
    const now = Date.now();

    const items = dealsRead.data
      .filter(isOpenDeal)
      .flatMap((deal) => {
        const sla = STAGE_SLA_DAYS[deal.Stage ?? ''];
        if (!sla) return [];
        const stalled = daysSince(deal.Modified_Time, now);
        if (stalled <= sla) return [];
        return [
          {
            what: this.whatLabel(deal),
            promise_plain: `${deal.Stage} moved within ${sla} ${sla === 1 ? 'day' : 'days'}`,
            owner: (deal.Owner?.name ?? 'Unassigned').split(' ')[0],
            over_by_days: stalled - sla,
            kind: kindOfDeal(deal.Layout?.name ?? null, deal.Pipeline),
          },
        ];
      })
      .sort((a, b) => b.over_by_days - a.over_by_days)
      .slice(0, LATE_CAP);

    return { data: { items }, parts: [dealsRead.meta] };
  }

  /** Provider onboarding, scoped local and international by the provider
   *  record's country (07 section 2): Bahrain gives local, anything else
   *  intl, blank is unclassified, surfaced in the All footer and shown
   *  under All only. Stage bars use the four fixed buckets of the V3
   *  surface. Provider deal names are business names, not patient data. */
  async providers(): Promise<{
    data: ProvidersPayload;
    parts: SourceMeta[];
  }> {
    const dealsRead = await this.crm.deals();
    const monthKey = new Date().toISOString().slice(0, 7);
    const providerDeals = dealsRead.data.filter(
      (d) =>
        (d.Pipeline === 'Doctor' || d.Pipeline === 'Hospital or Clinic') &&
        d.Stage !== LOST_STAGE[d.Pipeline ?? ''],
    );

    const bucketOf = (deal: DealRecord): string | null => {
      const stage = deal.Stage ?? '';
      if (stage === WON_STAGE[deal.Pipeline ?? ''] || stage === 'Live') {
        // Won providers count while they are this month's news.
        return (deal.Modified_Time ?? '').slice(0, 7) === monthKey
          ? 'Live this month'
          : null;
      }
      if (stage === 'NHRA Qualification') return 'NHRA step';
      if (
        stage === 'Final Approval' ||
        stage === 'Final Approval B2B' ||
        stage === 'Onboarded B2B'
      ) {
        return 'Final approval';
      }
      return 'In discussion';
    };

    const emptyStages = (): Map<string, number> =>
      new Map([
        ['In discussion', 0],
        ['NHRA step', 0],
        ['Final approval', 0],
        ['Live this month', 0],
      ]);
    const byScope: Record<'all' | 'local' | 'intl', Map<string, number>> = {
      all: emptyStages(),
      local: emptyStages(),
      intl: emptyStages(),
    };
    const totals = { all: 0, local: 0, intl: 0 };
    let unclassified = 0;

    for (const deal of providerDeals) {
      const scope: ProviderScope = providerScopeOf(deal.Country);
      if (scope === 'unclassified') unclassified++;
      const bucket = bucketOf(deal);
      totals.all++;
      if (bucket) byScope.all.set(bucket, (byScope.all.get(bucket) ?? 0) + 1);
      if (scope !== 'unclassified') {
        totals[scope]++;
        if (bucket)
          byScope[scope].set(bucket, (byScope[scope].get(bucket) ?? 0) + 1);
      }
    }

    const stagesOf = (scope: 'all' | 'local' | 'intl') =>
      [...byScope[scope].entries()].map(([label, count]) => ({
        label,
        count,
      }));

    const awaitingSignoff = providerDeals
      .filter(
        (d) => d.Stage === 'Final Approval' || d.Stage === 'Final Approval B2B',
      )
      .map((d) => d.Deal_Name ?? 'Unnamed provider');

    return {
      data: {
        scopes: {
          all: {
            stages: stagesOf('all'),
            foot:
              unclassified > 0
                ? `${unclassified} need a country set`
                : `All ${totals.all} providers carry a country`,
          },
          local: {
            stages: stagesOf('local'),
            foot: `${totals.local} Bahrain-based providers`,
          },
          intl: {
            stages: stagesOf('intl'),
            foot: `${totals.intl} international providers`,
          },
        },
        unclassified,
        awaiting_signoff: awaitingSignoff,
      },
      parts: [dealsRead.meta],
    };
  }

  /** Stage handoffs against their time promises: every open deal with an
   *  SLA-tracked stage counts toward the total; the late list reuses the
   *  same rules as health(). */
  async handoffs(): Promise<{
    data: HandoffsPayload;
    parts: SourceMeta[];
  }> {
    const [dealsRead, health] = await Promise.all([
      this.crm.deals(),
      this.health(),
    ]);

    const total = dealsRead.data.filter(
      (d) => isOpenDeal(d) && STAGE_SLA_DAYS[d.Stage ?? ''] !== undefined,
    ).length;
    // health() caps its list at LATE_CAP, so the on-time count is a floor.
    const late = health.data.items.length;
    const onTime = Math.max(0, total - late);

    return {
      data: {
        on_time_pct: total > 0 ? Math.round((onTime / total) * 100) : 100,
        on_time_count: onTime,
        total,
        misses: health.data.items.map((item) => ({
          what: item.what,
          owner: item.owner,
          cause: item.promise_plain,
          when: `${item.over_by_days} ${item.over_by_days === 1 ? 'day' : 'days'} over`,
        })),
      },
      parts: [dealsRead.meta],
    };
  }

  /** Patient pipelines reference the patient by initials only; B2B deal
   *  names are company or provider names, not patient data. */
  private whatLabel(deal: DealRecord): string {
    if (PATIENT_PIPELINES.includes(deal.Pipeline ?? '')) {
      const initials = this.patients.initialsOf(deal.Contact_Name?.name);
      return `${deal.Stage ?? 'Deal'}, patient ${initials}`;
    }
    return `${deal.Stage ?? 'Deal'}, ${deal.Deal_Name ?? 'unnamed deal'}`;
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm CRM read cache and the stateless patient serializer across every
// pipeline-facing route within one warm instance.
const PIPELINE_KEY = '__pipelineService';

type GlobalWithPipeline = typeof globalThis & {
  [PIPELINE_KEY]?: PipelineService;
};

export function getPipelineService(): PipelineService {
  const g = globalThis as GlobalWithPipeline;
  if (!g[PIPELINE_KEY]) {
    g[PIPELINE_KEY] = new PipelineService(getCrmRead(), patientSerializer);
  }
  return g[PIPELINE_KEY];
}

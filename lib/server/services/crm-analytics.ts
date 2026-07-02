// CRM analytics aggregations for the /crm page. Read only. Reads the shared
// cached Zoho record sets (deals, leads) and tallies in JS, never COQL grouped
// aggregates (a known-broken engine path). Pipeline and stage vocabulary come
// from crm-read.ts so there is one source of truth. Ported from the old
// dashboard routes app/api/zoho/crm/{metrics,funnel}/route.js, with the month
// boundaries moved to Bahrain civil time for consistency with the rest of the
// app.
//
// SERVER ONLY. Node runtime (reaches pg/Zoho through getCrmRead()).
import {
  getCrmRead,
  LOST_STAGE,
  PIPELINE_NAMES,
  PIPELINE_STAGES,
  WON_STAGE,
  type DealRecord,
  type LeadRecord,
} from '../crm-read';
import { destinationGroupOf, specialtyGroupOf } from '../classification';
import { patientSerializer } from '../privacy';
import type { SourceMeta } from '../envelope';
import type {
  CrmFunnelData,
  CrmFunnelMonthPoint,
  CrmFunnelPeriod,
  CrmFunnelSegment,
  CrmFunnelSummary,
  CrmLeadFunnelData,
  CrmLeadFunnelPeriod,
  CrmLeadFunnelStage,
  CrmDealRow,
  CrmDealsData,
  CrmJourneyBreakdown,
  CrmJourneyData,
  CrmLeadRow,
  CrmLeadSourcesData,
  CrmLeadsData,
  CrmMetricsData,
  CrmPipelineData,
  CrmPipelineMetric,
  CrmPipelinePeriod,
  CrmPipelineStage,
  CrmPipelineSummary,
  CrmSegmentBar,
  CrmSegmentMetric,
  CrmSegmentsData,
  CrmSubtypeBreakdown,
  CrmSubtypeData,
  CrmSubtypeSummary,
} from '@/lib/api/contract';

const BAHRAIN_TZ = 'Asia/Bahrain';

// The Bahrain civil-month key (YYYY-MM) a timestamp falls in.
function monthKey(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ }).slice(0, 7);
}

// The current Bahrain civil month as YYYY-MM.
function currentMonthKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ }).slice(0, 7);
}

// The month before a YYYY-MM key, rolling the year at January.
function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Whole-number percent change, with the old route's guard: a zero base reads as
// 100 when the current value is positive, else 0.
function changePct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

// One-decimal percentage, 0 when the denominator is zero.
function rate(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 10;
}

async function metrics(): Promise<{ data: CrmMetricsData; parts: SourceMeta[] }> {
  const [dealsRead, leadsRead] = await Promise.all([
    getCrmRead().deals(),
    getCrmRead().leads(),
  ]);
  const deals = dealsRead.data;
  const leads = leadsRead.data;

  const allWon = new Set(Object.values(WON_STAGE));
  const allLost = new Set(Object.values(LOST_STAGE));

  const thisMonth = currentMonthKey();
  const lastMonth = prevMonthKey(thisMonth);

  const leadsThis = leads.filter((l) => monthKey(l.Created_Time) === thisMonth).length;
  const leadsLast = leads.filter((l) => monthKey(l.Created_Time) === lastMonth).length;
  const dealsThis = deals.filter((d) => monthKey(d.Created_Time) === thisMonth).length;
  const dealsLast = deals.filter((d) => monthKey(d.Created_Time) === lastMonth).length;

  const openDeals = deals.filter(
    (d) => d.Stage != null && !allWon.has(d.Stage) && !allLost.has(d.Stage),
  );
  const wonDeals = deals.filter((d) => d.Stage != null && allWon.has(d.Stage));
  const pipelineValue = Math.round(openDeals.reduce((s, d) => s + (d.Amount ?? 0), 0));

  const by_pipeline: Record<string, CrmPipelineMetric> = {};
  for (const pipe of PIPELINE_NAMES) {
    const pDeals = deals.filter((d) => d.Pipeline === pipe);
    const total = pDeals.length;
    const won = pDeals.filter((d) => d.Stage === WON_STAGE[pipe]).length;
    const lost = pDeals.filter((d) => d.Stage === LOST_STAGE[pipe]).length;
    const pThis = pDeals.filter((d) => monthKey(d.Created_Time) === thisMonth).length;
    const pLast = pDeals.filter((d) => monthKey(d.Created_Time) === lastMonth).length;
    by_pipeline[pipe] = {
      total,
      this_month: pThis,
      last_month: pLast,
      change_pct: changePct(pThis, pLast),
      won,
      lost,
      open: total - won - lost,
      value_bhd: Math.round(pDeals.reduce((s, d) => s + (d.Amount ?? 0), 0)),
      win_rate_pct: rate(won, total),
      loss_rate_pct: rate(lost, total),
    };
  }

  const data: CrmMetricsData = {
    total_leads: leads.length,
    total_deals: deals.length,
    total_leads_this_month: leadsThis,
    total_leads_last_month: leadsLast,
    leads_change_pct: changePct(leadsThis, leadsLast),
    total_deals_this_month: dealsThis,
    total_deals_last_month: dealsLast,
    deals_change_pct: changePct(dealsThis, dealsLast),
    total_deals_open: openDeals.length,
    total_won: wonDeals.length,
    pipeline_value_bhd: pipelineValue,
    by_pipeline,
  };
  return { data, parts: [dealsRead.meta, leadsRead.meta] };
}

// Leads segment by CRM Layout; deals by Pipeline. Corporates is intentionally
// absent from the funnel (no B2B lead funnel), so a Corporates deal resolves to
// no segment and drops from these counts, matching the old funnel route.
const LEAD_LAYOUT_TO_KEY: Record<string, CrmFunnelSegment> = {
  B2C: 'Customers',
  B2B: 'Providers',
};
const PIPELINE_TO_FUNNEL_KEY: Record<string, CrmFunnelSegment> = {
  Telemedicine: 'Customers',
  Treatment: 'Customers',
  Doctor: 'Providers',
  'Hospital or Clinic': 'Providers',
};
const FUNNEL_SEGMENTS: CrmFunnelSegment[] = ['Customers', 'Providers'];

// The months a funnel spans: mtd is the current month, ytd is January to now,
// all is the trailing twelve months. Labels are short month with two-digit year.
function monthRange(period: CrmFunnelPeriod): { key: string; label: string }[] {
  const [y, m] = currentMonthKey().split('-').map(Number);
  const out: { key: string; label: string }[] = [];
  const push = (yy: number, mm: number) => {
    out.push({
      key: `${yy}-${String(mm).padStart(2, '0')}`,
      label: new Date(yy, mm - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      }),
    });
  };
  if (period === 'mtd') {
    push(y, m);
  } else if (period === 'ytd') {
    for (let mm = 1; mm <= m; mm++) push(y, mm);
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      push(d.getFullYear(), d.getMonth() + 1);
    }
  }
  return out;
}

async function funnel(
  period: CrmFunnelPeriod,
): Promise<{ data: CrmFunnelData; parts: SourceMeta[] }> {
  const [dealsRead, leadsRead] = await Promise.all([
    getCrmRead().deals(),
    getCrmRead().leads(),
  ]);
  const deals = dealsRead.data;
  const leads = leadsRead.data;

  const months = monthRange(period);
  const monthSet = new Set(months.map((mm) => mm.key));

  const leadSeg = (l: LeadRecord): CrmFunnelSegment | null =>
    LEAD_LAYOUT_TO_KEY[l.Layout?.name ?? ''] ?? null;
  const dealSeg = (d: DealRecord): CrmFunnelSegment | null =>
    d.Pipeline ? PIPELINE_TO_FUNNEL_KEY[d.Pipeline] ?? null : null;

  const funnels: Record<CrmFunnelSegment, CrmFunnelMonthPoint[]> = {
    Customers: [],
    Providers: [],
  };
  const summary: Record<CrmFunnelSegment, CrmFunnelSummary> = {
    Customers: { total_leads: 0, total_deals: 0, total_won: 0, leads_to_deals_pct: 0, deals_to_won_pct: 0 },
    Providers: { total_leads: 0, total_deals: 0, total_won: 0, leads_to_deals_pct: 0, deals_to_won_pct: 0 },
  };

  for (const seg of FUNNEL_SEGMENTS) {
    const segLeads = leads.filter((l) => leadSeg(l) === seg);
    const segDeals = deals.filter((d) => dealSeg(d) === seg);

    for (const { key, label } of months) {
      funnels[seg].push({
        month: label,
        leads: segLeads.filter((l) => monthKey(l.Created_Time) === key).length,
        deals: segDeals.filter((d) => monthKey(d.Created_Time) === key).length,
        won: segDeals.filter(
          (d) =>
            d.Pipeline != null &&
            d.Stage === WON_STAGE[d.Pipeline] &&
            monthKey(d.Closing_Date ?? d.Created_Time) === key,
        ).length,
      });
    }

    const sLeads = segLeads.filter((l) => monthSet.has(monthKey(l.Created_Time)));
    const sDeals = segDeals.filter((d) => monthSet.has(monthKey(d.Created_Time)));
    const totalWon = sDeals.filter(
      (d) => d.Pipeline != null && d.Stage === WON_STAGE[d.Pipeline],
    ).length;
    summary[seg] = {
      total_leads: sLeads.length,
      total_deals: sDeals.length,
      total_won: totalWon,
      leads_to_deals_pct: rate(sDeals.length, sLeads.length),
      deals_to_won_pct: rate(totalWon, sDeals.length),
    };
  }

  return { data: { funnels, summary, period }, parts: [dealsRead.meta, leadsRead.meta] };
}

// The lead-stage vocabulary (old lead-funnel route). A lead counts toward a
// stage if its Lead_Status is at or past that stage, or if it has converted.
const CONTACTED_STATUSES = new Set([
  'Waiting Response',
  'Intro Call Scheduled',
  'Intro Call Done',
  'Deal Ready',
]);
const CALL_DONE_STATUSES = new Set(['Intro Call Done', 'Deal Ready']);

// The cumulative lead funnel for a set of leads. Not Qualified is tracked
// separately, not as a stage. Rates are one-decimal percentages.
function buildLeadFunnel(leads: LeadRecord[]): CrmLeadFunnelStage {
  const total = leads.length;
  const notQualified = leads.filter((l) => l.Lead_Status === 'Not Qualified').length;
  const converted = leads.filter((l) => l.Converted === true).length;
  const contacted = leads.filter(
    (l) => (l.Lead_Status != null && CONTACTED_STATUSES.has(l.Lead_Status)) || l.Converted === true,
  ).length;
  const callDone = leads.filter(
    (l) => (l.Lead_Status != null && CALL_DONE_STATUSES.has(l.Lead_Status)) || l.Converted === true,
  ).length;
  const dealReady = leads.filter(
    (l) => l.Lead_Status === 'Deal Ready' || l.Converted === true,
  ).length;
  return {
    total,
    contacted,
    call_done: callDone,
    deal_ready: dealReady,
    converted,
    not_qualified: notQualified,
    contacted_rate: rate(contacted, total),
    call_done_rate: rate(callDone, total),
    deal_ready_rate: rate(dealReady, total),
    converted_rate: rate(converted, total),
    not_qualified_rate: rate(notQualified, total),
    new_to_contacted: rate(contacted, total),
    contacted_to_call_done: rate(callDone, contacted),
    call_done_to_deal_ready: rate(dealReady, callDone),
    deal_ready_to_converted: rate(converted, dealReady),
  };
}

// Bahrain-time period test for the lead funnel: mtd is the current month, ytd
// is the current year, all is unbounded.
function inLeadPeriod(iso: string | null, period: CrmLeadFunnelPeriod): boolean {
  if (period === 'all') return true;
  const key = monthKey(iso);
  if (key === '') return false;
  const now = currentMonthKey();
  return period === 'mtd' ? key === now : key.slice(0, 4) === now.slice(0, 4);
}

async function leadFunnel(
  period: CrmLeadFunnelPeriod,
): Promise<{ data: CrmLeadFunnelData; parts: SourceMeta[] }> {
  const read = await getCrmRead().leads();
  const leads = read.data.filter((l) => inLeadPeriod(l.Created_Time, period));
  const seg = (name: CrmFunnelSegment) =>
    leads.filter((l) => LEAD_LAYOUT_TO_KEY[l.Layout?.name ?? ''] === name);
  const data: CrmLeadFunnelData = {
    overall: buildLeadFunnel(leads),
    by_segment: {
      Customers: buildLeadFunnel(seg('Customers')),
      Providers: buildLeadFunnel(seg('Providers')),
    },
    period,
  };
  return { data, parts: [read.meta] };
}

// Lead sources grouped over the cached leads read, filtered by the same period
// and segment as the lead funnel so both cards move together. The old route
// read only the first 100 rows, which under-counted; this counts every matching
// lead. A missing source buckets as Unknown. A segment other than Customers or
// Providers (including overall) applies no segment filter.
async function leadSources(
  period: CrmLeadFunnelPeriod,
  segment: string | undefined,
): Promise<{ data: CrmLeadSourcesData; parts: SourceMeta[] }> {
  const read = await getCrmRead().leads();
  const inSeg = (l: LeadRecord) =>
    segment !== 'Customers' && segment !== 'Providers'
      ? true
      : LEAD_LAYOUT_TO_KEY[l.Layout?.name ?? ''] === segment;
  const leads = read.data.filter(
    (l) => inLeadPeriod(l.Created_Time, period) && inSeg(l),
  );
  const counts = new Map<string, number>();
  for (const l of leads) {
    const name = l.Lead_Source && l.Lead_Source.trim() ? l.Lead_Source : 'Unknown';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sources = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { data: { sources }, parts: [read.meta] };
}

const LEADS_PAGE_SIZE = 25;
const LEADS_MAX_PAGE_SIZE = 100;

// The all-leads table, newest first, privacy-gated to initials (no name, email,
// or phone ever leaves the server). Optional status filter; the distinct
// statuses present are returned so the client can build the filter control.
async function leads(
  pageRaw: string | undefined,
  pageSizeRaw: string | undefined,
  statusRaw: string | undefined,
): Promise<{ data: CrmLeadsData; parts: SourceMeta[] }> {
  const read = await getCrmRead().leads();
  const pageSize = Math.min(
    LEADS_MAX_PAGE_SIZE,
    Math.max(1, Number(pageSizeRaw) || LEADS_PAGE_SIZE),
  );
  const page = Math.max(1, Number(pageRaw) || 1);

  const sorted = [...read.data].sort((a, b) =>
    (b.Created_Time ?? '').localeCompare(a.Created_Time ?? ''),
  );
  const statuses = [
    ...new Set(sorted.map((l) => l.Lead_Status).filter((s): s is string => Boolean(s))),
  ].sort();

  const filtered = statusRaw ? sorted.filter((l) => l.Lead_Status === statusRaw) : sorted;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(page, pages);
  const rows: CrmLeadRow[] = filtered
    .slice((clamped - 1) * pageSize, clamped * pageSize)
    .map((l) => {
      const name = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
      return {
        id: l.id,
        ref: l.Zoho_ID ?? l.id,
        initials: patientSerializer.initialsOf(name),
        segment: LEAD_LAYOUT_TO_KEY[l.Layout?.name ?? ''] ?? '·',
        lead_source: l.Lead_Source ?? '·',
        lead_status: l.Lead_Status ?? '·',
        created: l.Created_Time,
      };
    });
  return { data: { rows, page: clamped, pages, total, statuses }, parts: [read.meta] };
}

// ----- Deals tab -----

const JOURNEY_TAGS = ['ASSISTED_JOURNEY', 'NAVIGATION_ONLY'];
const SUBTYPE_TAGS = ['Direct', 'Sponsored'];
const CUSTOMER_PIPELINES = ['Telemedicine', 'Treatment'];
const CUSTOMER_PIPELINE_SET = new Set(CUSTOMER_PIPELINES);
// Treatment stages in funnel order including the terminal lost stage, matching
// the old journey route. Built from the shared active-stage list plus the lost
// stage so there is one source of truth.
const TREATMENT_STAGES = [...PIPELINE_STAGES.Treatment, LOST_STAGE.Treatment];

const DAY_MS = 1000 * 60 * 60 * 24;

// The first of the deal's tags that is in the allowed set, else null.
function firstTagIn(d: DealRecord, allowed: string[]): string | null {
  for (const t of d.Tag ?? []) {
    if (t.name != null && allowed.includes(t.name)) return t.name;
  }
  return null;
}

async function pipeline(
  period: CrmPipelinePeriod,
): Promise<{ data: CrmPipelineData; parts: SourceMeta[] }> {
  const read = await getCrmRead().deals();
  const deals = read.data.filter((d) => inLeadPeriod(d.Created_Time, period));

  const map = new Map<string, Map<string, { count: number; value: number }>>();
  for (const d of deals) {
    const pipe = d.Pipeline ?? 'Unknown';
    const stage = d.Stage ?? 'Unknown';
    if (!map.has(pipe)) map.set(pipe, new Map());
    const sm = map.get(pipe)!;
    const e = sm.get(stage) ?? { count: 0, value: 0 };
    e.count += 1;
    e.value += d.Amount ?? 0;
    sm.set(stage, e);
  }

  const pipelines: Record<string, CrmPipelineSummary> = {};
  for (const pipe of PIPELINE_NAMES) {
    const sm = map.get(pipe) ?? new Map<string, { count: number; value: number }>();
    const ordered = [...PIPELINE_STAGES[pipe], LOST_STAGE[pipe]];
    const known = new Set(ordered);
    const extras = [...sm.keys()].filter((s) => !known.has(s));
    const stages: CrmPipelineStage[] = [...ordered, ...extras].map((name) => ({
      name,
      count: sm.get(name)?.count ?? 0,
      value_bhd: Math.round(sm.get(name)?.value ?? 0),
    }));
    const pDeals = deals.filter((d) => d.Pipeline === pipe);
    const won = pDeals.filter((d) => d.Stage === WON_STAGE[pipe]).length;
    const lostDeals = pDeals.filter((d) => d.Stage === LOST_STAGE[pipe]);
    const lost = lostDeals.length;
    const reasons = new Map<string, number>();
    for (const d of lostDeals) {
      const reason =
        d.Reason_For_Loss__s && d.Reason_For_Loss__s.trim()
          ? d.Reason_For_Loss__s
          : 'No reason specified';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    pipelines[pipe] = {
      stages,
      total: pDeals.length,
      won,
      lost,
      open: pDeals.length - won - lost,
      value_bhd: Math.round(pDeals.reduce((s, d) => s + (d.Amount ?? 0), 0)),
      win_rate_pct: rate(won, pDeals.length),
      loss_rate_pct: rate(lost, pDeals.length),
      loss_reasons: [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
  return { data: { pipelines, period }, parts: [read.meta] };
}

function journeyBreakdown(deals: DealRecord[]): CrmJourneyBreakdown {
  const won = deals.filter((d) => d.Stage === 'Treatment Completed');
  const lost = deals.filter((d) => d.Stage === 'Lost / Inactive');
  const total = deals.length;
  const stageCounts = new Map<string, number>();
  for (const d of deals) {
    const s = d.Stage ?? 'Unknown';
    stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
  }
  const stages = TREATMENT_STAGES.map((name) => ({ name, count: stageCounts.get(name) ?? 0 }));

  const wonWithDates = won.filter((d) => d.Created_Time && d.Closing_Date);
  const avg_days_to_completion =
    wonWithDates.length > 0
      ? Math.round(
          wonWithDates.reduce(
            (s, d) =>
              s +
              (new Date(d.Closing_Date as string).getTime() -
                new Date(d.Created_Time as string).getTime()) /
                DAY_MS,
            0,
          ) / wonWithDates.length,
        )
      : null;

  // Approximation: days since Created_Time for deals currently in each stage.
  // True time-in-stage needs the Zoho History API (Phase 2 in the old route).
  const stage_avg_days: Record<string, number | null> = {};
  for (const name of TREATMENT_STAGES) {
    const inStage = deals.filter((d) => d.Stage === name && d.Created_Time);
    stage_avg_days[name] =
      inStage.length > 0
        ? Math.round(
            inStage.reduce(
              (s, d) => s + (Date.now() - new Date(d.Created_Time as string).getTime()) / DAY_MS,
              0,
            ) / inStage.length,
          )
        : null;
  }

  return {
    total,
    won: won.length,
    lost: lost.length,
    open: total - won.length - lost.length,
    value_bhd: Math.round(deals.reduce((s, d) => s + (d.Amount ?? 0), 0)),
    win_rate_pct: rate(won.length, total),
    loss_rate_pct: rate(lost.length, total),
    stages,
    avg_days_to_completion,
    stage_avg_days,
  };
}

async function journey(): Promise<{ data: CrmJourneyData; parts: SourceMeta[] }> {
  const read = await getCrmRead().deals();
  const treatment = read.data.filter((d) => d.Pipeline === 'Treatment');
  const buckets: Record<string, DealRecord[]> = {
    ASSISTED_JOURNEY: [],
    NAVIGATION_ONLY: [],
    Untagged: [],
  };
  for (const d of treatment) buckets[firstTagIn(d, JOURNEY_TAGS) ?? 'Untagged'].push(d);
  const tags = [...JOURNEY_TAGS, 'Untagged'];
  const by_tag: Record<string, CrmJourneyBreakdown> = {};
  for (const tag of tags) by_tag[tag] = journeyBreakdown(buckets[tag]);
  return { data: { total: treatment.length, by_tag, tags }, parts: [read.meta] };
}

function subtypeBreakdown(deals: DealRecord[], pipeline: string): CrmSubtypeBreakdown {
  const total = deals.length;
  const won = deals.filter((d) => d.Stage === WON_STAGE[pipeline]).length;
  const lost = deals.filter((d) => d.Stage === LOST_STAGE[pipeline]).length;
  return {
    total,
    won,
    lost,
    open: total - won - lost,
    value_bhd: Math.round(deals.reduce((s, d) => s + (d.Amount ?? 0), 0)),
    win_rate_pct: rate(won, total),
    loss_rate_pct: rate(lost, total),
  };
}

async function subtype(): Promise<{ data: CrmSubtypeData; parts: SourceMeta[] }> {
  const read = await getCrmRead().deals();
  const customer = read.data.filter(
    (d) => d.Pipeline != null && CUSTOMER_PIPELINE_SET.has(d.Pipeline),
  );
  // The old route initialized these buckets with uppercase keys but wrote with
  // the title-case tag names, so Direct and Sponsored silently missed. Fixed
  // by keying the buckets on the same title-case names getSubtype returns.
  const buckets: Record<string, DealRecord[]> = { Direct: [], Sponsored: [], Untagged: [] };
  for (const d of customer) buckets[firstTagIn(d, SUBTYPE_TAGS) ?? 'Untagged'].push(d);
  const subtypes = [...SUBTYPE_TAGS, 'Untagged'];
  const by_subtype: Record<string, CrmSubtypeSummary> = {};
  for (const tag of subtypes) {
    const tagDeals = buckets[tag];
    const total = tagDeals.length;
    const allWon = tagDeals.filter(
      (d) => d.Pipeline != null && d.Stage === WON_STAGE[d.Pipeline],
    ).length;
    const allLost = tagDeals.filter(
      (d) => d.Pipeline != null && d.Stage === LOST_STAGE[d.Pipeline],
    ).length;
    by_subtype[tag] = {
      total,
      won: allWon,
      lost: allLost,
      open: total - allWon - allLost,
      value_bhd: Math.round(tagDeals.reduce((s, d) => s + (d.Amount ?? 0), 0)),
      win_rate_pct: rate(allWon, total),
      loss_rate_pct: rate(allLost, total),
      by_pipeline: Object.fromEntries(
        CUSTOMER_PIPELINES.map((pipe) => [
          pipe,
          subtypeBreakdown(tagDeals.filter((d) => d.Pipeline === pipe), pipe),
        ]),
      ),
    };
  }
  return { data: { total: customer.length, by_subtype, subtypes }, parts: [read.meta] };
}

const DEALS_PAGE_SIZE = 25;
const DEALS_MAX_PAGE_SIZE = 100;

function dealOutcome(d: DealRecord): 'won' | 'lost' | 'open' {
  const pipe = d.Pipeline ?? '';
  if (d.Stage === WON_STAGE[pipe]) return 'won';
  if (d.Stage === LOST_STAGE[pipe]) return 'lost';
  return 'open';
}

// The row label is privacy-gated: customer-pipeline deals carry a patient, so
// they show the reference plus initials only; provider and corporate deals
// carry a business name in Deal_Name.
function dealRecordLabel(d: DealRecord): string {
  if (d.Pipeline != null && CUSTOMER_PIPELINE_SET.has(d.Pipeline)) {
    return `${d.Zoho_ID ?? d.id} · ${patientSerializer.initialsOf(d.Contact_Name?.name)}`;
  }
  return d.Deal_Name ?? 'Unnamed deal';
}

async function dealsTable(
  pageRaw: string | undefined,
  pageSizeRaw: string | undefined,
  pipelineRaw: string | undefined,
): Promise<{ data: CrmDealsData; parts: SourceMeta[] }> {
  const read = await getCrmRead().deals();
  const pageSize = Math.min(
    DEALS_MAX_PAGE_SIZE,
    Math.max(1, Number(pageSizeRaw) || DEALS_PAGE_SIZE),
  );
  const page = Math.max(1, Number(pageRaw) || 1);
  const sorted = [...read.data].sort((a, b) =>
    (b.Created_Time ?? '').localeCompare(a.Created_Time ?? ''),
  );
  const filtered = pipelineRaw ? sorted.filter((d) => d.Pipeline === pipelineRaw) : sorted;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(page, pages);
  const rows: CrmDealRow[] = filtered
    .slice((clamped - 1) * pageSize, clamped * pageSize)
    .map((d) => ({
      id: d.id,
      record: dealRecordLabel(d),
      owner: d.Owner?.name ?? '·',
      pipeline: d.Pipeline ?? '·',
      stage: d.Stage ?? '·',
      outcome: dealOutcome(d),
      amount_bhd: Math.round(d.Amount ?? 0),
      lead_source: d.Lead_Source ?? '·',
      created: d.Created_Time,
    }));
  return {
    data: { rows, page: clamped, pages, total, pipelines: PIPELINE_NAMES },
    parts: [read.meta],
  };
}

// Readable labels for the specialty groups the classifier returns.
const SPECIALTY_LABELS: Record<string, string> = {
  neuro_spine_rehab: 'Neuro, spine, rehab',
  orthopedics: 'Orthopedics',
  gastro: 'Gastro',
  cosmetic: 'Cosmetic',
  womens_health: "Women's health",
  other: 'Other',
};

// Geographic (destination) and specialty breakdowns over customer deals, using
// the shared classification helpers. metric count tallies deals, amount tallies
// the deal value in BHD. Blank destination or concern is not counted, so the
// bars reflect classified deals only.
async function segments(
  metric: CrmSegmentMetric,
): Promise<{ data: CrmSegmentsData; parts: SourceMeta[] }> {
  const read = await getCrmRead().deals();
  const customer = read.data.filter(
    (d) => d.Pipeline != null && CUSTOMER_PIPELINE_SET.has(d.Pipeline),
  );
  const geo = new Map<string, number>();
  const spec = new Map<string, number>();
  for (const d of customer) {
    const amt = metric === 'amount' ? Math.round(d.Amount ?? 0) : 1;
    const g = destinationGroupOf(d.Prefered_Country_of_Treatment_Consultation);
    if (g) geo.set(g, (geo.get(g) ?? 0) + amt);
    const s = specialtyGroupOf(d.Main_Concern_Reason_for_Consultation);
    if (s) {
      const label = SPECIALTY_LABELS[s] ?? s;
      spec.set(label, (spec.get(label) ?? 0) + amt);
    }
  }
  const toBars = (m: Map<string, number>): CrmSegmentBar[] =>
    [...m.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  return {
    data: { geographic: toBars(geo), specialty: toBars(spec), metric },
    parts: [read.meta],
  };
}

export const crmAnalytics = {
  metrics,
  funnel,
  leadFunnel,
  leadSources,
  leads,
  pipeline,
  journey,
  subtype,
  dealsTable,
  segments,
};

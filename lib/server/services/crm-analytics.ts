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
  WON_STAGE,
  type DealRecord,
  type LeadRecord,
} from '../crm-read';
import type { SourceMeta } from '../envelope';
import type {
  CrmFunnelData,
  CrmFunnelMonthPoint,
  CrmFunnelPeriod,
  CrmFunnelSegment,
  CrmFunnelSummary,
  CrmMetricsData,
  CrmPipelineMetric,
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

export const crmAnalytics = { metrics, funnel };

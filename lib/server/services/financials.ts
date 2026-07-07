// Financials: platform revenue tallied from completed CRM bookings, plus
// partnership invoices from Zoho Books. Revenue is UNVERIFIED until the
// admin panel cross-check lands; the reason rides in meta so the web app
// and the MCP say the same words. Test bookings (Rate <= 1) are excluded,
// matching the appointments board and the legacy routes.
//
// Ported from the NestJS backend src/financials/financials.service.ts. The
// @Injectable class with its ENV, CacheService, CrmReadService, and ZohoClient
// dependencies becomes a globalThis-pinned singleton taking the spine
// accessors: getEnv() for the config, getCache() for the two-tier cache,
// getCrmRead() for the cached CRM reads, and getZohoClient() for the Books
// reads. Business logic, DTOs, and the USD/BHD handling are verbatim.
//
// Invoice customers are partners and corporates, never patients, so this
// service touches no patient identifiers and needs no PatientSerializer; the
// handler() global sweep still runs as the backstop.
//
// Originally ported into the backend from the legacy dashboard (Jun 2026):
//   forecast()    from app/api/zoho/crm/forecast/route.js
//   burn()        from app/api/zoho/books/burn-rate/route.js plus the
//                 revenue-vs-burn join in app/finance/page.js
//   receivables() from the aging buckets and late-payer ranking in
//                 app/finance/page.js and the invoices/outstanding routes
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via the spine accessors). Never
// import from a client component.
import { getEnv, type Env } from '../env';
import { getCache, CacheService, type CachedRead } from '../cache';
import { getZohoClient, ZohoClient } from '../integrations/zoho/client';
import {
  getCrmRead,
  CrmReadService,
  WON_STAGE,
  LOST_STAGE,
  type BookingRecord,
  type DealRecord,
} from '../crm-read';
import type { ReasonDto, SourceMeta } from '../envelope';

export interface InvoiceRowData {
  id: string;
  customer: string;
  amount_bhd: number;
  status: 'awaiting' | 'paid';
  due_display: string;
}

export interface FinancialsPayload {
  platform_revenue: {
    month_bhd: number;
    vs_prev_pct: number;
    split_plain: string;
    spark: number[];
    verified: boolean;
  };
  invoices: InvoiceRowData[];
  outstanding_bhd: number;
  payouts_due_bhd: number | null;
  saleem_share_bhd: number | null;
  treatment_manual_bhd: number | null;
}

export interface ForecastBucketData {
  weighted_bhd: number;
  unweighted_bhd: number;
  deal_count: number;
}

export interface ForecastMonthData extends ForecastBucketData {
  key: string;
  label: string;
}

export interface ForecastPayload {
  months: ForecastMonthData[];
  overdue: ForecastBucketData;
  undated: ForecastBucketData;
  won_to_date_bhd: number;
  by_pipeline: Array<{ pipeline: string; weighted_bhd: number }>;
  weight_note: string;
}

export interface BurnMonthData {
  key: string;
  label: string;
  burn_bhd: number;
  revenue_bhd: number;
}

export interface BurnCategoryData {
  category: string;
  total_bhd: number;
  this_month_bhd: number;
}

export interface BurnPayload {
  this_month_bhd: number;
  last_month_bhd: number;
  change_pct: number;
  months: BurnMonthData[];
  by_category: BurnCategoryData[];
  revenue_note: string;
}

export interface AgingBucketData {
  key: string;
  label: string;
  invoice_count: number;
  amount_bhd: number;
}

export interface LatePayerData {
  customer: string;
  open_invoices: number;
  balance_bhd: number;
  oldest_overdue_days: number;
}

export interface ReceivablesPayload {
  total_bhd: number;
  open_count: number;
  overdue_count: number;
  dso_days: number | null;
  buckets: AgingBucketData[];
  late_payers: LatePayerData[];
}

interface BooksInvoice {
  invoice_number?: string;
  customer_name?: string;
  total?: number;
  balance?: number;
  status?: string;
  due_date?: string;
  date?: string;
}

// Slim projection cached under zoho_books:invoices_v2. Raw Books invoice
// objects carry around 40 fields each; only the fields consumers read are
// persisted (the legacy invoices route learned this the hard way).
interface SlimInvoice {
  invoice_number: string | null;
  customer_name: string | null;
  status: string | null;
  date: string | null;
  due_date: string | null;
  total: number;
  balance: number;
}

interface BooksExpense {
  date?: string;
  total?: number;
  account_name?: string;
}

interface SlimExpense {
  date: string | null;
  total: number;
  account_name: string | null;
}

export const REVENUE_UNVERIFIED_REASON: ReasonDto = {
  key: 'admin_panel_pending',
  title: 'Verified against the admin panel is coming',
  text: 'These figures come from completed bookings in the CRM. The admin panel check that marks them verified is not connected yet.',
};

export const PAYOUTS_PENDING_REASON: ReasonDto = {
  key: 'payouts_pending',
  title: 'Payout figures are coming',
  text: 'Payout figures connect with the payout rules work, due later this month.',
};

export const DSO_UNAVAILABLE_REASON: ReasonDto = {
  key: 'dso_unavailable',
  title: 'Days sales outstanding is not available',
  text: 'No invoices were issued in the last 90 days, so days sales outstanding cannot be computed yet.',
};

const SPARK_MONTHS = 6;
const INVOICES_SHOWN = 8;
const BURN_MONTHS = 12;
const FORECAST_MONTHS = 3;
const CATEGORIES_SHOWN = 10;
const LATE_PAYERS_SHOWN = 8;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Zoho Books open-invoice statuses. An invoice that is not paid sits in one
// of these; filtering on just unpaid/overdue (the oldest legacy behavior)
// silently dropped sent/viewed/partially_paid invoices from receivables.
const OPEN_STATUSES = new Set([
  'sent',
  'viewed',
  'partially_paid',
  'overdue',
  'unpaid',
]);

const AGING_BUCKETS: Array<{
  key: string;
  label: string;
  test: (daysPastDue: number) => boolean;
}> = [
  { key: 'current', label: 'Not yet due', test: (d) => d <= 0 },
  { key: 'b30', label: '1 to 30 days', test: (d) => d >= 1 && d <= 30 },
  { key: 'b60', label: '31 to 60 days', test: (d) => d >= 31 && d <= 60 },
  { key: 'b90', label: '61 to 90 days', test: (d) => d >= 61 && d <= 90 },
  { key: 'b90p', label: 'Over 90 days', test: (d) => d > 90 },
];

/** The Bahrain civil month ("2026-06") of a booking's appointment date, or null
 *  when the date is missing. Uses From (the appointment date) and converts to
 *  Asia/Bahrain, the same rule the Appointments path uses, so a booking near
 *  midnight lands in the same month on both pages. */
function monthOf(booking: BookingRecord): string | null {
  const iso = booking.From ?? booking.Created_At;
  if (!iso) return null;
  return new Date(iso)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Bahrain' })
    .slice(0, 7);
}

function lastMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }
  return months;
}

// Month math runs on the Bahrain clock (UTC+3, no DST): Books dates and
// CRM timestamps are org-local, and a UTC server's new Date() lags Bahrain
// by 3h around midnight, shifting the month boundary.
function bahrainNow(): Date {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

/** Month index (year * 12 + month) to a "2026-06" key. */
function keyOfIdx(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = idx % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** "Jun 2026" for a month index. */
function labelOfIdx(idx: number): string {
  return `${MONTH_NAMES[idx % 12]} ${Math.floor(idx / 12)}`;
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  const parsed = new Date(dateStr).getTime();
  if (Number.isNaN(parsed)) return 0;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

function shortDate(iso: string | undefined): string {
  if (!iso) return '·';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '·';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function bhd(value: number): string {
  return `BHD ${Math.round(value).toLocaleString('en-US')}`;
}

export class FinancialsService {
  constructor(
    private readonly env: Env,
    private readonly cache: CacheService,
    private readonly crm: CrmReadService,
    private readonly zoho: ZohoClient,
  ) {}

  async overview(): Promise<{
    data: FinancialsPayload;
    parts: SourceMeta[];
  }> {
    const [bookingsRead, invoicesRead] = await Promise.all([
      this.crm.bookings(),
      this.invoicesSlim(),
    ]);

    // Completed basis per the revenue spec: Done or Awaiting Review, since the
    // fee is deducted at Awaiting Review. Matches the appointments and
    // commission tabs so money in reconciles with them.
    const completed = bookingsRead.data.filter(
      (b) =>
        (b.Status === 'Done' || b.Status === 'Awaiting Review') &&
        (b.Rate ?? 0) > 1,
    );

    const months = lastMonths(SPARK_MONTHS);
    const sums = new Map<string, number>(months.map((m) => [m, 0]));
    for (const booking of completed) {
      const month = monthOf(booking);
      if (month && sums.has(month)) {
        sums.set(month, (sums.get(month) ?? 0) + (booking.Rate ?? 0));
      }
    }
    const spark = months.map((m) => Math.round(sums.get(m) ?? 0));
    const monthBhd = spark[spark.length - 1];
    const prevBhd = spark[spark.length - 2] ?? 0;
    const vsPrevPct =
      prevBhd > 0 ? Math.round(((monthBhd - prevBhd) / prevBhd) * 100) : 0;

    // Drafts and voided invoices are not receivables.
    const real = invoicesRead.data.filter(
      (inv) => inv.status !== 'draft' && inv.status !== 'void',
    );

    // Outstanding counts every unpaid invoice (balance, so partial
    // payments are honest), not just the rows that fit the table.
    const outstanding = Math.round(
      real
        .filter((inv) => inv.status !== 'paid')
        .reduce((sum, inv) => sum + (inv.balance || inv.total || 0), 0),
    );

    const rows = real
      .slice()
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, INVOICES_SHOWN)
      .map((inv) => ({
        id: inv.invoice_number ?? '·',
        customer: inv.customer_name ?? 'Unknown customer',
        amount_bhd: inv.total,
        status:
          inv.status === 'paid' ? ('paid' as const) : ('awaiting' as const),
        due_display: shortDate(inv.due_date ?? undefined),
      }));

    return {
      data: {
        platform_revenue: {
          month_bhd: monthBhd,
          vs_prev_pct: vsPrevPct,
          split_plain: this.splitPlain(completed, months[months.length - 1]),
          spark,
          verified: false,
        },
        invoices: rows,
        outstanding_bhd: outstanding,
        // Payout figures land with the payout rules engine; until then
        // they are null with a reason, never a zero that reads as "we owe
        // nothing".
        payouts_due_bhd: null,
        saleem_share_bhd: null,
        treatment_manual_bhd: null,
      },
      parts: [
        bookingsRead.meta,
        { ...invoicesRead.meta, reasons: [REVENUE_UNVERIFIED_REASON] },
        {
          fetched_at: new Date(),
          cached: false,
          stale: false,
          reasons: [PAYOUTS_PENDING_REASON],
        },
      ],
    };
  }

  // Pipeline-weighted revenue forecast: open deals bucketed by Closing_Date
  // month (current + next 2), each Amount weighted by the deal's Zoho
  // Probability when set, else the pipeline's historical win rate derived
  // from the same payload. Open deals with past or missing closing dates
  // land in overdue/undated buckets so nothing silently disappears.
  //
  // Per-stage historical win probability is NOT derivable from a deals
  // snapshot (closed deals only show terminal stages), hence per-deal
  // Probability with the pipeline-level fallback. weight_note tells the
  // reader which weights carried the number.
  async forecast(): Promise<{ data: ForecastPayload; parts: SourceMeta[] }> {
    const dealsRead = await this.crm.deals();
    const deals = dealsRead.data;

    const isWon = (d: DealRecord) => d.Stage === WON_STAGE[d.Pipeline ?? ''];
    const isLost = (d: DealRecord) => d.Stage === LOST_STAGE[d.Pipeline ?? ''];
    const isOpen = (d: DealRecord) => !isWon(d) && !isLost(d);

    // Pipeline-level historical win rate (won / closed) as the Probability
    // fallback.
    const winRateByPipeline = new Map<string, number>();
    for (const pipe of new Set(
      deals.map((d) => d.Pipeline).filter((p): p is string => Boolean(p)),
    )) {
      const won = deals.filter((d) => d.Pipeline === pipe && isWon(d)).length;
      const lost = deals.filter((d) => d.Pipeline === pipe && isLost(d)).length;
      winRateByPipeline.set(pipe, won + lost > 0 ? won / (won + lost) : 0.5);
    }

    const bh = bahrainNow();
    const nowIdx = bh.getUTCFullYear() * 12 + bh.getUTCMonth();
    const todayKey = keyOfIdx(nowIdx);
    const todayYmd = `${todayKey}-${String(bh.getUTCDate()).padStart(2, '0')}`;

    interface MonthAcc extends ForecastMonthData {
      pipelines: Map<string, number>;
    }
    const months: MonthAcc[] = [];
    for (let i = 0; i < FORECAST_MONTHS; i++) {
      months.push({
        key: keyOfIdx(nowIdx + i),
        label: labelOfIdx(nowIdx + i),
        unweighted_bhd: 0,
        weighted_bhd: 0,
        deal_count: 0,
        pipelines: new Map(),
      });
    }
    const monthByKey = new Map(months.map((m) => [m.key, m]));

    const overdue = { unweighted_bhd: 0, weighted_bhd: 0, deal_count: 0 };
    const undated = { unweighted_bhd: 0, weighted_bhd: 0, deal_count: 0 };
    let explicit = 0;
    let fallback = 0;

    for (const d of deals) {
      if (!isOpen(d)) continue;
      const amount = Number(d.Amount) || 0;
      const prob = Number(d.Probability);
      let weight: number;
      if (Number.isFinite(prob) && prob > 0) {
        weight = prob / 100;
        explicit++;
      } else {
        weight = winRateByPipeline.get(d.Pipeline ?? '') ?? 0.5;
        fallback++;
      }
      const weighted = amount * weight;

      if (!d.Closing_Date) {
        undated.unweighted_bhd += amount;
        undated.weighted_bhd += weighted;
        undated.deal_count++;
        continue;
      }
      const key = d.Closing_Date.slice(0, 7);
      if (d.Closing_Date < todayYmd && key < todayKey) {
        overdue.unweighted_bhd += amount;
        overdue.weighted_bhd += weighted;
        overdue.deal_count++;
        continue;
      }
      const bucket = monthByKey.get(key);
      if (!bucket) continue; // beyond the 3-month horizon
      bucket.unweighted_bhd += amount;
      bucket.weighted_bhd += weighted;
      bucket.deal_count++;
      const pipe = d.Pipeline ?? 'No pipeline';
      bucket.pipelines.set(pipe, (bucket.pipelines.get(pipe) ?? 0) + weighted);
    }

    // Won-to-date this month, for context next to the current-month
    // forecast. Closing_Date is the actual close date on won deals (the
    // computeKpis convention).
    const wonToDate = Math.round(
      deals
        .filter(
          (d) => isWon(d) && (d.Closing_Date ?? '').slice(0, 7) === todayKey,
        )
        .reduce((s, d) => s + (Number(d.Amount) || 0), 0),
    );

    // 3-month weighted total per pipeline, largest first.
    const pipelineTotals = new Map<string, number>();
    for (const m of months) {
      for (const [pipe, v] of m.pipelines) {
        pipelineTotals.set(pipe, (pipelineTotals.get(pipe) ?? 0) + v);
      }
    }
    const byPipeline = [...pipelineTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pipeline, v]) => ({ pipeline, weighted_bhd: Math.round(v) }));

    const total = explicit + fallback;
    const weightNote =
      fallback > explicit
        ? `Most open deals (${fallback} of ${total}) have no probability set in Zoho, so their weights fall back to each pipeline's historical win rate.`
        : `Weighted by per deal Zoho probability for ${explicit} deals, with the pipeline win rate fallback for ${fallback}.`;

    const round = (b: ForecastBucketData): ForecastBucketData => ({
      ...b,
      unweighted_bhd: Math.round(b.unweighted_bhd),
      weighted_bhd: Math.round(b.weighted_bhd),
    });

    return {
      data: {
        months: months.map((m) => ({
          key: m.key,
          label: m.label,
          ...round(m),
        })),
        overdue: round(overdue),
        undated: round(undated),
        won_to_date_bhd: wonToDate,
        by_pipeline: byPipeline,
        weight_note: weightNote,
      },
      parts: [dealsRead.meta],
    };
  }

  // Monthly burn from Zoho Books expenses: trailing-12-month series with the
  // platform revenue join (completed bookings, the same definition as the
  // overview spark), category breakdown, and this-vs-last-month figures.
  async burn(): Promise<{ data: BurnPayload; parts: SourceMeta[] }> {
    const [expensesRead, bookingsRead] = await Promise.all([
      this.expensesTrailing(),
      this.crm.bookings(),
    ]);

    const bh = bahrainNow();
    const nowIdx = bh.getUTCFullYear() * 12 + bh.getUTCMonth();

    const buckets: BurnMonthData[] = [];
    for (let i = BURN_MONTHS - 1; i >= 0; i--) {
      const idx = nowIdx - i;
      buckets.push({
        key: keyOfIdx(idx),
        label: labelOfIdx(idx),
        burn_bhd: 0,
        revenue_bhd: 0,
      });
    }
    const bucketByKey = new Map(buckets.map((b) => [b.key, b]));

    const categories = new Map<
      string,
      { category: string; total: number; thisMonth: number }
    >();
    const thisKey = keyOfIdx(nowIdx);
    const lastKey = keyOfIdx(nowIdx - 1);

    for (const e of expensesRead.data) {
      const total = e.total || 0;
      const key = (e.date ?? '').slice(0, 7);
      const bucket = bucketByKey.get(key);
      if (bucket) bucket.burn_bhd += total;

      const cat = e.account_name ?? 'Uncategorized';
      const acc = categories.get(cat) ?? {
        category: cat,
        total: 0,
        thisMonth: 0,
      };
      acc.total += total;
      if (key === thisKey) acc.thisMonth += total;
      categories.set(cat, acc);
    }

    // Revenue join: completed platform bookings per month, bucketed the
    // same way as the overview spark so the two views never disagree.
    for (const booking of bookingsRead.data) {
      if (
        (booking.Status !== 'Done' && booking.Status !== 'Awaiting Review') ||
        (booking.Rate ?? 0) <= 1
      )
        continue;
      const month = monthOf(booking);
      if (!month) continue;
      const bucket = bucketByKey.get(month);
      if (bucket) bucket.revenue_bhd += booking.Rate ?? 0;
    }

    const months = buckets.map((b) => ({
      ...b,
      burn_bhd: Math.round(b.burn_bhd),
      revenue_bhd: Math.round(b.revenue_bhd),
    }));
    const thisMonth = months.find((b) => b.key === thisKey)?.burn_bhd ?? 0;
    const lastMonth = months.find((b) => b.key === lastKey)?.burn_bhd ?? 0;

    const changePct =
      lastMonth === 0
        ? thisMonth > 0
          ? 100
          : 0
        : Math.round(((thisMonth - lastMonth) / lastMonth) * 100);

    const byCategory = [...categories.values()]
      .map((c) => ({
        category: c.category,
        total_bhd: Math.round(c.total),
        this_month_bhd: Math.round(c.thisMonth),
      }))
      .sort((a, b) => b.total_bhd - a.total_bhd)
      .slice(0, CATEGORIES_SHOWN);

    return {
      data: {
        this_month_bhd: thisMonth,
        last_month_bhd: lastMonth,
        change_pct: changePct,
        months,
        by_category: byCategory,
        revenue_note:
          'Revenue is completed platform bookings, the same definition as the platform revenue card. Burn is Zoho Books expenses by account.',
      },
      parts: [expensesRead.meta, bookingsRead.meta],
    };
  }

  // Receivables aging by balance, bucketed on days past due, with the
  // late-payer ranking (customers by open balance) and approximate DSO.
  // Invoice customers are partners and corporates, never patients.
  async receivables(): Promise<{
    data: ReceivablesPayload;
    parts: SourceMeta[];
  }> {
    const invoicesRead = await this.invoicesSlim();

    const real = invoicesRead.data.filter(
      (inv) => inv.status !== 'draft' && inv.status !== 'void',
    );
    const open = real.filter(
      (inv) => OPEN_STATUSES.has(inv.status ?? '') && inv.balance > 0,
    );

    const now = Date.now();
    const isOverdue = (inv: SlimInvoice) =>
      Boolean(inv.due_date) && new Date(inv.due_date as string).getTime() < now;

    const buckets = AGING_BUCKETS.map((b) => {
      const list = open.filter((inv) =>
        b.test(inv.due_date ? daysSince(inv.due_date) : 0),
      );
      return {
        key: b.key,
        label: b.label,
        invoice_count: list.length,
        amount_bhd: Math.round(
          list.reduce((s, inv) => s + (inv.balance || 0), 0),
        ),
      };
    });

    const totalReceivable = Math.round(
      open.reduce((s, inv) => s + (inv.balance || 0), 0),
    );
    const overdueCount = open.filter(isOverdue).length;

    // Approximate DSO: outstanding balance vs the trailing-90-day invoiced
    // total. Null (with the authored reason) when nothing was invoiced in
    // the window; a zero would read as "we collect instantly".
    const cutoff90 = new Date(now - 90 * 86_400_000);
    const invoiced90 = real
      .filter((inv) => inv.date && new Date(inv.date) >= cutoff90)
      .reduce((s, inv) => s + (inv.total || 0), 0);
    const dso =
      invoiced90 > 0 ? Math.round((totalReceivable / invoiced90) * 90) : null;

    // Late-payer ranking: customers by outstanding balance.
    const byCustomer = new Map<
      string,
      { customer: string; count: number; balance: number; maxOverdue: number }
    >();
    for (const inv of open) {
      const name = inv.customer_name ?? 'Unknown customer';
      const acc = byCustomer.get(name) ?? {
        customer: name,
        count: 0,
        balance: 0,
        maxOverdue: 0,
      };
      acc.count++;
      acc.balance += inv.balance || 0;
      if (inv.due_date) {
        acc.maxOverdue = Math.max(acc.maxOverdue, daysSince(inv.due_date));
      }
      byCustomer.set(name, acc);
    }
    const latePayers = [...byCustomer.values()]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, LATE_PAYERS_SHOWN)
      .map((c) => ({
        customer: c.customer,
        open_invoices: c.count,
        balance_bhd: Math.round(c.balance),
        oldest_overdue_days: Math.max(0, c.maxOverdue),
      }));

    const parts: SourceMeta[] = [
      dso === null
        ? { ...invoicesRead.meta, reasons: [DSO_UNAVAILABLE_REASON] }
        : invoicesRead.meta,
    ];

    return {
      data: {
        total_bhd: totalReceivable,
        open_count: open.length,
        overdue_count: overdueCount,
        dso_days: dso,
        buckets,
        late_payers: latePayers,
      },
      parts,
    };
  }

  /** "Consult BHD 2,140 · Follow-up BHD 320." for the current month. */
  private splitPlain(completed: BookingRecord[], currentMonth: string): string {
    const byType = new Map<string, number>();
    for (const booking of completed) {
      if (monthOf(booking) !== currentMonth) continue;
      const type = booking.Type ?? 'Consult';
      byType.set(type, (byType.get(type) ?? 0) + (booking.Rate ?? 0));
    }
    const parts = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, sum]) => `${type} ${bhd(sum)}`);
    if (parts.length === 0) {
      return 'No completed bookings have landed this month yet.';
    }
    return `${parts.join(' · ')}.`;
  }

  private requireBooksOrg(): string {
    if (!this.env.ZOHO_BOOKS_ORG_ID) {
      throw new Error(
        'Zoho Books is not configured: set ZOHO_BOOKS_ORG_ID for the Books reads.',
      );
    }
    return this.env.ZOHO_BOOKS_ORG_ID;
  }

  // All invoices, slimmed to the fields the overview and receivables reads
  // consume. Key versioned (v2) because the original zoho_books:invoices
  // entry cached a pre-shaped { rows, outstanding_bhd } payload that cannot
  // serve the receivables math.
  private invoicesSlim(): Promise<CachedRead<SlimInvoice[]>> {
    const orgId = this.requireBooksOrg();
    return this.cache.read('zoho_books:invoices_v2', 'zoho_books', async () => {
      const records = (await this.zoho.booksGetAll(
        'https://www.zohoapis.com/books/v3/invoices',
        'invoices',
        { organization_id: orgId },
      )) as BooksInvoice[];
      return records.map((inv) => ({
        invoice_number: inv.invoice_number ?? null,
        customer_name: inv.customer_name ?? null,
        status: inv.status ?? null,
        date: inv.date ?? null,
        due_date: inv.due_date ?? null,
        total: Number(inv.total ?? 0),
        balance: Number(inv.balance ?? 0),
      }));
    });
  }

  // Trailing-12-month expenses, slimmed. The window rides the Bahrain clock;
  // a cached entry can lag the rolling window by at most the zoho_books TTL.
  private expensesTrailing(): Promise<CachedRead<SlimExpense[]>> {
    const orgId = this.requireBooksOrg();
    return this.cache.read(
      'zoho_books:expenses_12m',
      'zoho_books',
      async () => {
        const bh = bahrainNow();
        const nowIdx = bh.getUTCFullYear() * 12 + bh.getUTCMonth();
        const dateStart = `${keyOfIdx(nowIdx - (BURN_MONTHS - 1))}-01`;
        const dateEnd = `${keyOfIdx(nowIdx)}-${String(bh.getUTCDate()).padStart(2, '0')}`;
        const records = (await this.zoho.booksGetAll(
          'https://www.zohoapis.com/books/v3/expenses',
          'expenses',
          {
            organization_id: orgId,
            date_start: dateStart,
            date_end: dateEnd,
          },
        )) as BooksExpense[];
        return records.map((e) => ({
          date: e.date ?? null,
          total: Number(e.total ?? 0),
          account_name: e.account_name ?? null,
        }));
      },
    );
  }
}

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm CRM read cache, the Books read client, and the parsed env across
// every financials route within one warm instance.
const FINANCIALS_KEY = '__financialsService';

type GlobalWithFinancials = typeof globalThis & {
  [FINANCIALS_KEY]?: FinancialsService;
};

export function getFinancialsService(): FinancialsService {
  const g = globalThis as GlobalWithFinancials;
  if (!g[FINANCIALS_KEY]) {
    g[FINANCIALS_KEY] = new FinancialsService(
      getEnv(),
      getCache(),
      getCrmRead(),
      getZohoClient(),
    );
  }
  return g[FINANCIALS_KEY];
}

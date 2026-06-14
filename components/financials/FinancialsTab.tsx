"use client";

import { useQuery } from "@tanstack/react-query";

import { Spark } from "@/components/charts/Spark";
import { Grid, spans } from "@/components/shell/Grid";
import { Bar } from "@/components/ui/Bar";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat, StatRow } from "@/components/ui/Stat";
import type {
  FinancialsBurnData,
  FinancialsData,
  FinancialsForecastData,
  FinancialsReceivablesData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* Financials (spec 02 section 8.5). Two cards that are never visually
   summed: platform revenue (the true picture, verified against the admin
   panel) and partnership invoices (Books, partnership money only). The
   Verified chip appears ONLY when the payload says verified; otherwise the
   chip reads Unverified and the footer carries the admin_panel_pending
   reason. The payout tiles come back null until the payout rules work
   lands and render the muted not-connected treatment.

   Below the snapshot sit the sections ported from the legacy /finance page:
   the pipeline-weighted forecast, receivables aging with the late-payer
   ranking, and the revenue-vs-burn series with the category breakdown. Each
   section runs its own query so one slow upstream never blanks the rest. */

type InvoiceRow = FinancialsData["invoices"][number];
type BurnMonthRow = FinancialsBurnData["months"][number];
type LatePayerRow = FinancialsReceivablesData["late_payers"][number];

const INVOICE_COLUMNS: DataTableColumn<InvoiceRow>[] = [
  {
    key: "customer",
    label: "Invoice",
    render: (row) => <b className="font-semibold text-title">{row.customer}</b>,
  },
  {
    key: "amount_bhd",
    label: "Amount",
    numeric: true,
    render: (row) => fmtBHD(row.amount_bhd),
  },
  { key: "due_display", label: "Due", numeric: true },
  {
    key: "status",
    label: "State",
    numeric: true,
    render: (row) =>
      row.status === "paid" ? (
        <Chip variant="good">Paid</Chip>
      ) : (
        <Chip variant="info">Awaiting payment</Chip>
      ),
  },
];

function monthName(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "this month";
  return d.toLocaleDateString("en-US", { month: "long" });
}

/* "Up 22% on the prior month." with the direction in words, never a minus. */
function vsPrevSentence(pct: number): string {
  if (pct === 0) return "Level with the prior month.";
  const direction = pct > 0 ? "Up" : "Down";
  return `${direction} ${Math.abs(pct)}% on the prior month.`;
}

/* "BHD 540 ahead" / "BHD 320 over" with the direction in words. */
function netWords(net: number): string {
  if (net === 0) return "Level";
  return net > 0 ? `${fmtBHD(net)} ahead` : `${fmtBHD(-net)} over`;
}

const BURN_MONTH_COLUMNS: DataTableColumn<BurnMonthRow>[] = [
  {
    key: "label",
    label: "Month",
    render: (row) => <b className="font-semibold text-title">{row.label}</b>,
  },
  {
    key: "revenue_bhd",
    label: "Revenue",
    numeric: true,
    render: (row) => fmtBHD(row.revenue_bhd),
  },
  {
    key: "burn_bhd",
    label: "Burn",
    numeric: true,
    render: (row) => fmtBHD(row.burn_bhd),
  },
  {
    key: "net",
    label: "Net",
    numeric: true,
    render: (row) => {
      const net = row.revenue_bhd - row.burn_bhd;
      return (
        <span className={net >= 0 ? "font-semibold text-title" : "text-ink-2"}>
          {netWords(net)}
        </span>
      );
    },
  },
];

const LATE_PAYER_COLUMNS: DataTableColumn<LatePayerRow>[] = [
  {
    key: "customer",
    label: "Customer",
    render: (row) => <b className="font-semibold text-title">{row.customer}</b>,
  },
  { key: "open_invoices", label: "Open invoices", numeric: true },
  {
    key: "balance_bhd",
    label: "Balance",
    numeric: true,
    render: (row) => <b className="num font-semibold text-title">{fmtBHD(row.balance_bhd)}</b>,
  },
  {
    key: "oldest_overdue_days",
    label: "Oldest overdue",
    numeric: true,
    render: (row) =>
      row.oldest_overdue_days > 0 ? (
        <Chip variant={row.oldest_overdue_days > 30 ? "warn" : "info"}>
          {row.oldest_overdue_days} days late
        </Chip>
      ) : (
        <Chip variant="mut">Not yet due</Chip>
      ),
  },
];

const ROWS_SKELETON = (
  <div className="flex flex-col gap-[10px] py-1">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} height={16} />
    ))}
  </div>
);

/* Pipeline forecast, next 3 months. Open deals by expected close month; the
   bar is the probability-weighted value scaled to the largest unweighted
   month, so "likely of" reads directly against the bar length. */
function ForecastCard() {
  const query = useQuery({
    queryKey: qk.financialsForecast(),
    queryFn: () =>
      fetchEnvelope<FinancialsForecastData>("financials_forecast", "/financials/forecast"),
  });

  return (
    <Card data-focus-id="pipeline-forecast">
      <CardHeader
        title="Pipeline forecast, next 3 months"
        subtitle="Open deals by expected close month, weighted by win probability."
        right={<Chip variant="info">CRM</Chip>}
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={ROWS_SKELETON}
          isEmpty={(data) => data.months.every((m) => m.deal_count === 0)}
          emptyCopy="No open deals carry an expected close date in the next three months."
        >
          {(data) => {
            const maxUnweighted = Math.max(...data.months.map((m) => m.unweighted_bhd), 1);
            return (
              <>
                <div className="flex flex-col gap-3">
                  {data.months.map((m, i) => (
                    <div key={m.key}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-semibold text-ink-2">
                          {m.label}
                          {i === 0 && data.won_to_date_bhd > 0 ? (
                            <span className="font-normal text-ink-3">
                              {" "}
                              ({fmtBHD(data.won_to_date_bhd)} already won)
                            </span>
                          ) : null}
                        </span>
                        <span className="num whitespace-nowrap text-ink-3">
                          <b className="text-title">{fmtBHD(m.weighted_bhd)}</b> likely of{" "}
                          {fmtBHD(m.unweighted_bhd)}, {m.deal_count}{" "}
                          {m.deal_count === 1 ? "deal" : "deals"}
                        </span>
                      </div>
                      <Bar value={(m.weighted_bhd / maxUnweighted) * 100} height={8} />
                    </div>
                  ))}
                </div>
                {data.overdue.deal_count > 0 || data.undated.deal_count > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.overdue.deal_count > 0 ? (
                      <Chip variant="warn">
                        {data.overdue.deal_count} past their close date, {fmtBHD(data.overdue.weighted_bhd)} likely
                      </Chip>
                    ) : null}
                    {data.undated.deal_count > 0 ? (
                      <Chip variant="mut">
                        {data.undated.deal_count} with no close date, {fmtBHD(data.undated.weighted_bhd)} likely
                      </Chip>
                    ) : null}
                  </div>
                ) : null}
                {data.by_pipeline.length > 0 ? (
                  <p className="mt-3 text-xs text-ink-2">
                    {data.by_pipeline
                      .map((p) => `${p.pipeline} ${fmtBHD(p.weighted_bhd)}`)
                      .join(" · ")}
                    {" over the three months."}
                  </p>
                ) : null}
              </>
            );
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={query.data?.data?.weight_note ?? "Weights come from Zoho deal probability."}
      />
    </Card>
  );
}

/* Receivables aging. Open invoice balances bucketed on days past due; the
   two oldest buckets switch the bar to the attention fill when money sits
   in them. The DSO read lives in the footer. */
function ReceivablesCard() {
  const query = useQuery({
    queryKey: qk.financialsReceivables(),
    queryFn: () =>
      fetchEnvelope<FinancialsReceivablesData>(
        "financials_receivables",
        "/financials/receivables",
      ),
  });

  const data = query.data?.data;
  const footer = data
    ? `Total receivable ${fmtBHD(data.total_bhd)} across ${data.open_count} open ${
        data.open_count === 1 ? "invoice" : "invoices"
      }.` +
      (data.dso_days !== null
        ? ` Collection takes about ${data.dso_days} days.`
        : " Days sales outstanding is not available yet.")
    : "Open invoice balances by days past due.";

  return (
    <Card data-focus-id="receivables-aging">
      <CardHeader
        title="Receivables aging"
        subtitle="Open invoice balances by days past due. Customers are partners, not patients."
        right={<Chip variant="info">Books</Chip>}
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={ROWS_SKELETON}
          isEmpty={(d) => d.open_count === 0}
          emptyCopy="Every invoice is paid. Nothing is waiting on a customer."
        >
          {(d) => (
            <div className="flex flex-col gap-3">
              {d.buckets.map((b) => {
                const late = (b.key === "b90" || b.key === "b90p") && b.invoice_count > 0;
                return (
                  <div key={b.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-semibold text-ink-2">
                        {b.label}
                        {late ? <span className="font-normal text-ink-3"> (needs a chase)</span> : null}
                      </span>
                      <span className="num whitespace-nowrap text-ink-3">
                        <b className="text-title">{fmtBHD(b.amount_bhd)}</b>, {b.invoice_count}{" "}
                        {b.invoice_count === 1 ? "invoice" : "invoices"}
                      </span>
                    </div>
                    <Bar
                      value={d.total_bhd > 0 ? (b.amount_bhd / d.total_bhd) * 100 : 0}
                      height={8}
                      fill={late ? "warn" : "accent"}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </QueryPanel>
      </div>
      <CardFooter note={footer} />
    </Card>
  );
}

/* Revenue vs burn, trailing 12 months. The stat row carries this month's
   figures; the table is the month-by-month join. Revenue here is completed
   platform bookings, the same definition as the platform revenue card. */
function BurnCard() {
  const query = useQuery({
    queryKey: qk.financialsBurn(),
    queryFn: () => fetchEnvelope<FinancialsBurnData>("financials_burn", "/financials/burn"),
  });

  return (
    <Card data-focus-id="revenue-vs-burn">
      <CardHeader
        title="Revenue vs burn, 12 months"
        subtitle="Completed platform bookings against Zoho Books expenses, month by month."
      />
      <div className="px-[18px] pb-2 pt-[13px]">
        <QueryPanel query={query} skeleton={ROWS_SKELETON}>
          {(data) => {
            const current = data.months[data.months.length - 1];
            const net = current ? current.revenue_bhd - current.burn_bhd : 0;
            return (
              <>
                <StatRow>
                  <Stat
                    value={fmtBHD(data.this_month_bhd)}
                    small={vsPrevSentence(data.change_pct)}
                    label="Burn this month"
                  />
                  <Stat
                    value={fmtBHD(current?.revenue_bhd ?? 0)}
                    label="Revenue this month"
                  />
                  <Stat value={netWords(net)} label="Net position" />
                </StatRow>
                <DataTable
                  columns={BURN_MONTH_COLUMNS}
                  rows={data.months.slice().reverse()}
                  rowKey={(row) => row.key}
                />
              </>
            );
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={
          query.data?.data?.revenue_note ??
          "Burn is Zoho Books expenses by account."
        }
      />
    </Card>
  );
}

/* Burn by category, trailing 12 months. Zoho Books expense accounts,
   largest first, with this month's spend noted beside the total. */
function BurnCategoriesCard() {
  const query = useQuery({
    queryKey: qk.financialsBurn(),
    queryFn: () => fetchEnvelope<FinancialsBurnData>("financials_burn", "/financials/burn"),
  });

  return (
    <Card data-focus-id="burn-by-category">
      <CardHeader
        title="Burn by category, trailing 12 months"
        subtitle="Zoho Books expense accounts, largest first."
        right={<Chip variant="info">Books</Chip>}
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={ROWS_SKELETON}
          isEmpty={(data) => data.by_category.length === 0}
          emptyCopy="No expenses landed in Books over the last twelve months."
        >
          {(data) => {
            const max = Math.max(...data.by_category.map((c) => c.total_bhd), 1);
            return (
              <div className="flex flex-col gap-[10px]">
                {data.by_category.map((c) => (
                  <div key={c.category}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-ink-2">{c.category}</span>
                      <span className="num whitespace-nowrap text-ink-3">
                        <b className="text-title">{fmtBHD(c.total_bhd)}</b>
                        {c.this_month_bhd > 0 ? `, ${fmtBHD(c.this_month_bhd)} this month` : ""}
                      </span>
                    </div>
                    <Bar value={(c.total_bhd / max) * 100} />
                  </div>
                ))}
              </div>
            );
          }}
        </QueryPanel>
      </div>
    </Card>
  );
}

/* Top outstanding balances: who to chase first, customers ranked by open
   balance with the oldest overdue age in words. */
function LatePayersCard() {
  const query = useQuery({
    queryKey: qk.financialsReceivables(),
    queryFn: () =>
      fetchEnvelope<FinancialsReceivablesData>(
        "financials_receivables",
        "/financials/receivables",
      ),
  });

  const overdueCount = query.data?.data?.overdue_count;

  return (
    <Card data-focus-id="late-payers">
      <CardHeader
        title="Top outstanding balances"
        subtitle="Who to chase first. Customers ranked by open balance."
        right={
          overdueCount != null && overdueCount > 0 ? (
            <Chip variant="warn">{overdueCount} overdue</Chip>
          ) : (
            <Chip variant="info">Books</Chip>
          )
        }
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={ROWS_SKELETON}
          isEmpty={(d) => d.late_payers.length === 0}
          emptyCopy="No customer holds an open balance right now."
        >
          {(d) => (
            <DataTable
              columns={LATE_PAYER_COLUMNS}
              rows={d.late_payers}
              rowKey={(row) => row.customer}
            />
          )}
        </QueryPanel>
      </div>
    </Card>
  );
}

const PAGE_SKELETON = (
  <Grid>
    <Card className={`${spans.c6} px-[18px] py-[15px]`}>
      <Skeleton height={14} width={180} className="mb-3" />
      <Skeleton height={32} width={140} className="mb-3" />
      <Skeleton height={70} />
    </Card>
    <Card className={`${spans.c6} px-[18px] py-[15px]`}>
      <Skeleton height={14} width={170} className="mb-3" />
      <div className="flex flex-col gap-[10px]">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} height={16} />
        ))}
      </div>
    </Card>
    {Array.from({ length: 4 }, (_, i) => (
      <Card key={i} className={`${spans.c3} flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px]`}>
        <Skeleton height={12} width={110} />
        <Skeleton height={28} width={90} />
        <Skeleton height={12} />
      </Card>
    ))}
  </Grid>
);

export function FinancialsTab() {
  const query = useQuery({
    queryKey: qk.financials(),
    queryFn: () => fetchEnvelope<FinancialsData>("financials", "/financials"),
  });

  return (
    <>
      <QueryPanel query={query} skeleton={PAGE_SKELETON}>
        {(data, meta) => {
          const month = monthName(meta.updated_at);
          const revenue = data.platform_revenue;
          const unverifiedReason =
            meta.reasons.find((r) => r.key === "admin_panel_pending")?.text ??
            "The admin panel check for this number is coming.";
          const payoutsReason =
            meta.reasons.find((r) => r.key === "payouts_pending")?.title ??
            "Connects with the payout rules work";
          return (
            <Grid>
              <div className={spans.c6} data-focus-id="platform-revenue">
                <Card>
                  <CardHeader
                    title={`Platform revenue, ${month}`}
                    subtitle={
                      revenue.verified
                        ? "The true picture. Verified against the admin panel."
                        : "Measured from the platform gateway."
                    }
                    right={
                      revenue.verified ? (
                        <Chip variant="good">Verified</Chip>
                      ) : (
                        <Chip variant="info">Unverified</Chip>
                      )
                    }
                  />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    <div className="num text-[32px] font-bold leading-[1.05] tracking-[-.01em] text-title">
                      {fmtBHD(revenue.month_bhd)}
                    </div>
                    <p className="mb-3 mt-[6px] text-[12.5px] text-ink-2">
                      {vsPrevSentence(revenue.vs_prev_pct)} {revenue.split_plain}
                    </p>
                    {revenue.spark.length >= 2 ? <Spark values={revenue.spark} fill /> : null}
                  </div>
                  <CardFooter
                    note={
                      revenue.verified
                        ? "Consult and treatment money flows through the platform gateway, not Books."
                        : unverifiedReason
                    }
                  />
                </Card>
              </div>

              <div className={spans.c6} data-focus-id="partnership-invoices">
                <Card>
                  <CardHeader
                    title="Partnership invoices"
                    subtitle="From Zoho Books. Partnership money only, not total revenue."
                    right={<Chip variant="info">Books</Chip>}
                  />
                  <div className="px-[18px] pb-2 pt-2">
                    {data.invoices.length === 0 ? (
                      <p className="py-2 pb-4 text-[13px] text-ink-2">
                        No partnership invoices this period.
                      </p>
                    ) : (
                      <DataTable
                        columns={INVOICE_COLUMNS}
                        rows={data.invoices}
                        rowKey={(row) => row.id}
                      />
                    )}
                  </div>
                  <CardFooter
                    note={
                      data.outstanding_bhd > 0
                        ? `Outstanding: ${fmtBHD(data.outstanding_bhd)}.`
                        : "Nothing outstanding."
                    }
                  />
                </Card>
              </div>

              {data.payouts_due_bhd === null ? (
                <KpiCard
                  className={spans.c3}
                  label="Owed to providers"
                  value={<PendingValue>Not connected yet</PendingValue>}
                  note={payoutsReason}
                  dot="mut"
                />
              ) : (
                <KpiCard
                  className={spans.c3}
                  label="Owed to providers"
                  value={fmtBHD(data.payouts_due_bhd)}
                  note="This payout cycle"
                  dot="mut"
                />
              )}
              {data.saleem_share_bhd === null ? (
                <KpiCard
                  className={spans.c3}
                  label={`Saleem share, ${month}`}
                  value={<PendingValue>Not connected yet</PendingValue>}
                  note={payoutsReason}
                  dot="mut"
                />
              ) : (
                <KpiCard
                  className={spans.c3}
                  label={`Saleem share, ${month}`}
                  value={fmtBHD(data.saleem_share_bhd)}
                  note="After provider payouts"
                  dot="good"
                />
              )}
              {data.treatment_manual_bhd === null ? (
                <KpiCard
                  className={spans.c3}
                  label="Treatment, manual"
                  value={<PendingValue>Not connected yet</PendingValue>}
                  note={payoutsReason}
                  dot="mut"
                />
              ) : (
                <KpiCard
                  className={spans.c3}
                  label="Treatment, manual"
                  value={fmtBHD(data.treatment_manual_bhd)}
                  note="Entered by hand"
                  dot="mut"
                />
              )}
              <KpiCard
                className={spans.c3}
                label="Collection note"
                value={
                  <span className="font-sans text-[15px] font-medium leading-[1.4] tracking-normal text-title">
                    Patient pays Saleem, Saleem remits the partner.
                  </span>
                }
                note="Documented in every hospital agreement"
                dot="mut"
              />
            </Grid>
          );
        }}
      </QueryPanel>

      {/* Ported legacy sections, each on its own query and QueryPanel. */}
      <Grid className="mt-[14px]">
        <div className={spans.c6}>
          <ForecastCard />
        </div>
        <div className={spans.c6}>
          <ReceivablesCard />
        </div>
        <div className={spans.c6}>
          <BurnCard />
        </div>
        <div className={spans.c6}>
          <BurnCategoriesCard />
        </div>
        <div className={spans.c12}>
          <LatePayersCard />
        </div>
      </Grid>
    </>
  );
}

"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";

import { Spark } from "@/components/charts/Spark";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialsData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtBHD } from "@/lib/format/bhd";
import { TITLES } from "@/config/titles";

/* Financials (spec 02 section 8.5). Two cards that are never visually
   summed: platform revenue (the true picture, verified against the admin
   panel) and partnership invoices (Books, partnership money only). The
   Verified chip appears ONLY when the payload says verified; otherwise the
   chip reads Unverified and the footer carries the admin_panel_pending
   reason. The payout tiles come back null until the payout rules work
   lands and render the muted not-connected treatment. */

type InvoiceRow = FinancialsData["invoices"][number];

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

function FinancialsContent() {
  useFocusFlash();
  const title = TITLES.financials;
  const query = useQuery({
    queryKey: qk.financials(),
    queryFn: () => fetchEnvelope<FinancialsData>("financials", "/financials"),
  });

  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>
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
    </>
  );
}

export default function FinancialsPage() {
  return (
    <Suspense fallback={null}>
      <FinancialsContent />
    </Suspense>
  );
}

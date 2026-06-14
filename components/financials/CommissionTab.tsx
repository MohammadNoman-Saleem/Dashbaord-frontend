"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Grid, spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { FreeAppointmentForm } from "@/components/financials/FreeAppointmentForm";
import { RuleRow } from "@/components/financials/RuleRow";
import type {
  PayoutBookingRow,
  PayoutsBookingsData,
  PayoutsRulesData,
  PayoutsSummaryData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* Commission tab (inside /financials). Rebuilt on real data: every booking
   carries GROSS (what the patient pays) and SALEEM REVENUE (service charge
   plus commission) as two SEPARATE figures, never summed. The rule cascade is
   shown with inline Edit for permitted viewers (can_edit_payout_rules), and a
   functional free-appointment add and edit form. Free-to-patient rows render
   "Covers BHD x", never a minus. */

const CYCLE = new Date().toISOString().slice(0, 7);

/* Consult-scale amounts keep one decimal under BHD 100, whole dinars above. */
function fmtAmount(n: number): string {
  return n >= 100 ? fmtBHD(n) : `BHD ${n.toFixed(1)}`;
}

function ruleChipVariant(label: string): ChipVariant {
  if (label === "Free to patient") return "warn";
  if (label === "Manual entry") return "mut";
  return "info";
}

const TILES_SKELETON = (
  <div className="flex flex-col gap-2">
    <Skeleton height={12} width={110} />
    <Skeleton height={28} width={90} />
    <Skeleton height={12} />
  </div>
);

const TABLE_SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    {Array.from({ length: 6 }, (_, i) => (
      <Skeleton key={i} height={16} />
    ))}
  </div>
);

const LIST_SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    {Array.from({ length: 2 }, (_, i) => (
      <Skeleton key={i} height={38} />
    ))}
  </div>
);

function monthName(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return "this month";
  return d.toLocaleDateString("en-US", { month: "long" });
}

export function CommissionTab() {
  const queryClient = useQueryClient();
  const month = monthName(CYCLE);
  const [editingManual, setEditingManual] = useState<string | null>(null);
  const [addingFree, setAddingFree] = useState(false);

  const summaryQuery = useQuery({
    queryKey: qk.payoutsSummary(CYCLE),
    queryFn: () =>
      fetchEnvelope<PayoutsSummaryData>("payouts_summary", "/payouts/summary", { cycle: CYCLE }),
  });
  const bookingsQuery = useQuery({
    queryKey: qk.payoutsBookings(CYCLE),
    queryFn: () =>
      fetchEnvelope<PayoutsBookingsData>("payouts_bookings", "/payouts/bookings", { cycle: CYCLE }),
  });
  const rulesQuery = useQuery({
    queryKey: qk.payoutsRules(),
    queryFn: () => fetchEnvelope<PayoutsRulesData>("payouts_rules", "/payouts/rules"),
  });

  /* A rule or free-appointment change moves the numbers, so refetch all three
     so the ledger, the rules, and the totals agree at once. */
  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: qk.payoutsSummary(CYCLE) });
    void queryClient.invalidateQueries({ queryKey: qk.payoutsBookings(CYCLE) });
    void queryClient.invalidateQueries({ queryKey: qk.payoutsRules() });
  }

  const bookingColumns: DataTableColumn<PayoutBookingRow>[] = [
    {
      key: "id",
      label: "Booking",
      render: (row) => (
        <span>
          <b className="font-semibold text-title">{row.patient_ref.initials}</b>
          <span className="text-ink-2"> · {row.provider}</span>
        </span>
      ),
    },
    { key: "product", label: "Product" },
    {
      key: "gross_bhd",
      label: "Gross",
      numeric: true,
      render: (row) => fmtAmount(row.gross_bhd),
    },
    {
      key: "saleem_revenue_bhd",
      label: "Saleem revenue",
      numeric: true,
      render: (row) =>
        row.covers_bhd != null
          ? `Covers ${fmtAmount(row.covers_bhd)}`
          : fmtAmount(row.saleem_revenue_bhd),
    },
    {
      key: "provider_payout_bhd",
      label: "Provider payout",
      numeric: true,
      render: (row) => fmtAmount(row.provider_payout_bhd),
    },
    {
      key: "rule_label",
      label: "Rule applied",
      numeric: true,
      render: (row) => <Chip variant={ruleChipVariant(row.rule_label)}>{row.rule_label}</Chip>,
    },
  ];

  return (
    <Grid>
      <div className={spans.c12} data-focus-id="payout-tiles">
        <QueryPanel
          query={summaryQuery}
          skeleton={
            <Grid>
              {Array.from({ length: 4 }, (_, i) => (
                <Card
                  key={i}
                  className={`${spans.c3} flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px]`}
                >
                  {TILES_SKELETON}
                </Card>
              ))}
            </Grid>
          }
        >
          {(summary) => (
            <Grid>
              <KpiCard
                className={spans.c3}
                label={`Gross, ${month}`}
                value={fmtBHD(summary.gross_bhd)}
                note="What patients paid in full"
                dot="mut"
              />
              <KpiCard
                className={spans.c3}
                label={`Saleem revenue, ${month}`}
                value={fmtBHD(summary.saleem_revenue_bhd)}
                note="Service charge plus commission, shown beside gross, never summed in"
                dot="good"
              />
              <KpiCard
                className={spans.c3}
                label="Provider payouts"
                value={fmtBHD(summary.provider_payouts_bhd)}
                note={summary.cycle_close_note}
                dot="mut"
              />
              <KpiCard
                className={spans.c3}
                label="Commission to confirm"
                value={summary.commission_unset_count.toLocaleString()}
                suffix={summary.commission_unset_count === 1 ? "booking" : "bookings"}
                note={
                  summary.commission_unset_count > 0
                    ? "No doctor or hospital percent set, the rule default was used"
                    : "Every booking had a percent to use"
                }
                dot={summary.commission_unset_count > 0 ? "warn" : "good"}
              />
            </Grid>
          )}
        </QueryPanel>
      </div>

      <div className={spans.c12} data-focus-id="payout-bookings">
        <Card>
          <CardHeader
            title="Bookings, gross vs Saleem revenue"
            subtitle="What the patient paid in full, what Saleem keeps after the rule, the provider payout, and which rule decided it."
          />
          <div className="px-[18px] pb-2 pt-2">
            <QueryPanel
              query={bookingsQuery}
              skeleton={TABLE_SKELETON}
              isEmpty={(d) => d.rows.length === 0}
              emptyCopy="No bookings in this cycle yet."
            >
              {(d) => (
                <DataTable columns={bookingColumns} rows={d.rows} rowKey={(row) => row.id} />
              )}
            </QueryPanel>
          </div>
          <CardFooter note="Gross is the full patient payment. Saleem revenue is the service charge plus commission, a separate figure." />
        </Card>
      </div>

      <div className={spans.c6} data-focus-id="payout-rules">
        <Card>
          <CardHeader
            title="How the split is decided"
            subtitle="First matching rule wins, top to bottom. Edits apply to new bookings only."
          />
          <div className="px-[18px] pb-2 pt-2">
            <QueryPanel
              query={rulesQuery}
              skeleton={LIST_SKELETON}
              isEmpty={(d) => d.rules.length === 0}
              emptyCopy="No payout rules are configured yet."
            >
              {(d) => (
                <div>
                  {d.rules.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} onSaved={refreshAll} />
                  ))}
                </div>
              )}
            </QueryPanel>
          </div>
          <CardFooter note="Rule changes apply to new bookings only. Past splits never move." />
        </Card>
      </div>

      <div className={spans.c6} data-focus-id="payout-free">
        <Card>
          <CardHeader
            title="Free appointments"
            subtitle="Patient pays nothing. Record what Saleem covers or earns."
            right={
              rulesQuery.data?.data?.rules.some((r) => r.can_edit) && !addingFree ? (
                <Button variant="ghost" size="sm" onClick={() => setAddingFree(true)}>
                  Add
                </Button>
              ) : null
            }
          />
          <div className="px-[18px] pb-4 pt-[13px]">
            {addingFree ? (
              <FreeAppointmentForm
                onSaved={() => {
                  setAddingFree(false);
                  refreshAll();
                }}
                onCancel={() => setAddingFree(false)}
              />
            ) : null}

            <ManualEntriesList
              bookings={bookingsQuery.data?.data?.rows ?? []}
              canEdit={Boolean(rulesQuery.data?.data?.rules.some((r) => r.can_edit))}
              editingId={editingManual}
              onEdit={setEditingManual}
              onSaved={() => {
                setEditingManual(null);
                refreshAll();
              }}
            />
          </div>
          <CardFooter note="Free-to-patient rows read Covers BHD, never a minus." />
        </Card>
      </div>
    </Grid>
  );
}

/* The manual (free) rows already in the ledger, each editable in place for
   permitted viewers. Reuses the bookings query so a saved edit shows up
   through the same refetch. */
function ManualEntriesList({
  bookings,
  canEdit,
  editingId,
  onEdit,
  onSaved,
}: {
  bookings: PayoutBookingRow[];
  canEdit: boolean;
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onSaved: () => void;
}) {
  const manual = bookings.filter((b) => b.manual);
  if (manual.length === 0) {
    return <p className="py-2 text-[13px] text-ink-2">No free appointments recorded this cycle.</p>;
  }
  return (
    <div>
      {manual.map((row) =>
        editingId === row.id ? (
          <div key={row.id} className="border-b border-line-soft py-3 last:border-b-0">
            <FreeAppointmentForm
              entry={{
                id: row.id,
                product: row.product,
                provider: row.provider,
                saleem_revenue_bhd: row.saleem_revenue_bhd,
                covers_bhd: row.covers_bhd,
              }}
              onSaved={onSaved}
              onCancel={() => onEdit(null)}
            />
          </div>
        ) : (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <b className="block text-[13px] font-semibold text-title">{row.product}</b>
              <span className="block text-xs text-ink-2">
                {row.provider} ·{" "}
                {row.covers_bhd != null
                  ? `Covers ${fmtAmount(row.covers_bhd)}`
                  : fmtAmount(row.saleem_revenue_bhd)}
              </span>
            </div>
            {canEdit ? (
              <Button variant="ghost" size="sm" onClick={() => onEdit(row.id)}>
                Edit
              </Button>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

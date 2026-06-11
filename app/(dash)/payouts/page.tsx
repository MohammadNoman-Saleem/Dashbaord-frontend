"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Split } from "lucide-react";

import { Grid, spans } from "@/components/shell/Grid";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { KpiCard } from "@/components/ui/KpiCard";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  PayoutBookingRow,
  PayoutsBookingsData,
  PayoutsRulesData,
  PayoutsSummaryData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtBHD } from "@/lib/format/bhd";
import { TITLES } from "@/config/titles";

/* Commission and Payouts (spec 02 section 8.8). The payouts endpoints are
   still fixtures, so a banner at the top says the numbers are sample data;
   the rule Edit buttons and the treatment form submit are honestly disabled
   until the payout rules work connects. Free-to-patient ledger rows phrase
   the Saleem column as "Covers BHD {x}", never a minus sign. */

const CYCLE = new Date().toISOString().slice(0, 7);

/* Booking amounts keep one decimal under BHD 100 (consult fees), whole
   dinars above (treatment cases), matching how the team reads them. */
function fmtAmount(n: number): string {
  return n >= 100 ? fmtBHD(n) : `BHD ${n.toFixed(1)}`;
}

function ruleChipVariant(label: string): ChipVariant {
  if (label === "Free to patient") return "warn";
  if (label === "Manual entry") return "mut";
  return "info";
}

const BOOKING_COLUMNS: DataTableColumn<PayoutBookingRow>[] = [
  {
    key: "id",
    label: "Booking",
    render: (row) => (
      <span>
        <b className="font-semibold text-title">{row.id}</b>
        <span className="text-ink-2"> · {row.provider}</span>
      </span>
    ),
  },
  { key: "product", label: "Product" },
  {
    key: "patient_paid_bhd",
    label: "Patient paid",
    numeric: true,
    render: (row) => fmtAmount(row.patient_paid_bhd),
  },
  {
    key: "provider_payout_bhd",
    label: "Provider payout",
    numeric: true,
    render: (row) => fmtAmount(row.provider_payout_bhd),
  },
  {
    key: "saleem",
    label: "Saleem",
    numeric: true,
    render: (row) =>
      row.covers_bhd != null
        ? `Covers ${fmtAmount(row.covers_bhd)}`
        : fmtAmount(row.saleem_share_bhd ?? 0),
  },
  {
    key: "rule_label",
    label: "Rule applied",
    numeric: true,
    render: (row) => <Chip variant={ruleChipVariant(row.rule_label)}>{row.rule_label}</Chip>,
  },
];

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
    {Array.from({ length: 4 }, (_, i) => (
      <Skeleton key={i} height={38} />
    ))}
  </div>
);

function monthName(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return "this month";
  return d.toLocaleDateString("en-US", { month: "long" });
}

function PayoutsContent() {
  useFocusFlash();
  const title = TITLES.payouts;
  const month = monthName(CYCLE);

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

  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>

      <Banner title="These numbers are sample data until the payout rules work connects." />

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
                  label={`Patients paid, ${month}`}
                  value={fmtBHD(summary.patients_paid_bhd)}
                  note="Every booking splits three ways"
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
                  label="Saleem revenue"
                  value={fmtBHD(summary.saleem_revenue_bhd)}
                  note="After payouts"
                  dot="good"
                />
                <KpiCard
                  className={spans.c3}
                  label="Needs review"
                  value={summary.needs_review_count.toLocaleString()}
                  suffix={summary.needs_review_count === 1 ? "booking" : "bookings"}
                  note={
                    summary.needs_review_count > 0
                      ? "Waiting for a look before the cycle closes"
                      : "Nothing waiting"
                  }
                  dot={summary.needs_review_count > 0 ? "warn" : "good"}
                />
              </Grid>
            )}
          </QueryPanel>
        </div>

        <div className={spans.c12} data-focus-id="payout-bookings">
          <Card>
            <CardHeader
              title="Recent bookings, split out"
              subtitle="What the patient paid, what the provider gets, what Saleem keeps, and which rule decided it."
            />
            <div className="px-[18px] pb-2 pt-2">
              <QueryPanel
                query={bookingsQuery}
                skeleton={TABLE_SKELETON}
                isEmpty={(d) => d.rows.length === 0}
                emptyCopy="No bookings in this cycle yet."
              >
                {(d) => <DataTable columns={BOOKING_COLUMNS} rows={d.rows} rowKey={(row) => row.id} />}
              </QueryPanel>
            </div>
            <CardFooter note="Patient pays Saleem, Saleem keeps its share and remits the partner. Written into every agreement." />
          </Card>
        </div>

        <div className={spans.c6} data-focus-id="payout-rules">
          <Card>
            <CardHeader
              title="How the split is decided"
              subtitle="First matching rule wins, top to bottom."
            />
            <div className="px-[18px] pb-2 pt-2">
              <QueryPanel
                query={rulesQuery}
                skeleton={LIST_SKELETON}
                isEmpty={(d) => d.rules.length === 0}
                emptyCopy="The rule cascade appears here once the payout rules connect."
              >
                {(d) => (
                  <div>
                    {d.rules.map((rule) => (
                      <ListRow
                        key={rule.id}
                        icon={Split}
                        title={`${rule.priority} · ${rule.label}`}
                        subtitle={rule.params_display}
                        right={
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            title="Connects with the payout rules editor."
                          >
                            Edit
                          </Button>
                        }
                      />
                    ))}
                  </div>
                )}
              </QueryPanel>
            </div>
            <CardFooter note="Rule changes apply to new bookings only. Past splits never move." />
          </Card>
        </div>

        <div className={spans.c6} data-focus-id="payout-treatment">
          <Card>
            <CardHeader
              title="Record a treatment case"
              subtitle="Treatment is negotiated per case, so it is entered by hand."
            />
            <div className="px-[18px] pb-4 pt-[13px]">
              <Field label="Patient paid, total BHD" htmlFor="treat-total">
                <FieldInput id="treat-total" inputMode="decimal" placeholder="4,900" />
              </Field>
              <Field label="Hospital share, BHD" htmlFor="treat-hospital">
                <FieldInput id="treat-hospital" inputMode="decimal" placeholder="4,165" />
              </Field>
              <Field label="Saleem share, BHD" htmlFor="treat-saleem">
                <FieldInput id="treat-saleem" inputMode="decimal" placeholder="735" />
              </Field>
              <Field label="Who collected the money" htmlFor="treat-collector">
                <FieldSelect id="treat-collector" defaultValue="saleem">
                  <option value="saleem">Saleem, remits the hospital</option>
                  <option value="hospital">Hospital, remits Saleem</option>
                </FieldSelect>
              </Field>
              <Button disabled>Record the case</Button>
              <p className="mt-2 text-xs text-ink-3">
                Connects with the payout rules work, due later this month.
              </p>
            </div>
          </Card>
        </div>
      </Grid>
    </>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={null}>
      <PayoutsContent />
    </Suspense>
  );
}

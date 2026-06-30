"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { MiniBars } from "@/components/charts/MiniBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { PatientRef } from "@/components/ui/PatientRef";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  AppointmentsAnalyticsData,
  AppointmentsAnalyticsRow,
  AppointmentsPeriod,
  GrowthRetentionData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtBHD } from "@/lib/format/bhd";
import { fmtDate } from "@/lib/format/datetime";
import { TITLES } from "@/config/titles";

/* Appointments analytics (Stage 1). Read-only view over the cached Zoho
   bookings read. A period control (MTD, QTD, YTD, all time) drives one
   analytics query for the KPI strip, the stage pipeline, the doctor
   breakdown, and a recent-appointments table. A separate query reads the
   existing booking-retention cohorts so the scan is not duplicated here.
   The period lives in the URL ?period= so a deep link lands on the same
   window from a cold load, following the funnels page pattern. */

const PERIOD_ITEMS = [
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All time" },
];

const PERIODS: AppointmentsPeriod[] = ["mtd", "qtd", "ytd", "all"];

/* Status to Chip variant. Done reads as good; the in-flight stages read as
   neutral information; everything else stays muted. There is no red. */
function statusVariant(status: string): ChipVariant {
  if (status === "Done") return "good";
  if (status === "Confirmed" || status === "Session Started" || status === "Awaiting Review") {
    return "info";
  }
  return "mut";
}

/* Fee text. A zero or negative fee reads as a calm dash, not "BHD 0". */
function feeCell(n: number): string {
  return n > 0 ? fmtBHD(n) : "-";
}

/* Date text. A null date reads as a calm dash rather than "NaN". */
function dateCell(date: string | null): string {
  return date ? fmtDate(date) : "-";
}

/* The reference the team reads for a patient, mirroring PatientRef's own
   display rule. Never the patient name, so this is safe for a CSV cell. */
function patientReference(row: AppointmentsAnalyticsRow): string {
  return `${row.patient_ref.ref ?? row.patient_ref.zoho_id} ${row.patient_ref.initials}`;
}

/* Wrap a CSV field: double any quotes and wrap in quotes when it carries a
   comma, quote, or newline. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/* Build a CSV from the visible rows and download it through a transient
   anchor. The patient column carries only the reference, never the name. */
function downloadRecentCsv(rows: AppointmentsAnalyticsRow[]): void {
  const header = ["Appointment", "Patient (ref)", "Doctor", "Status", "Fee BHD", "Date"];
  const lines = rows.map((row) =>
    [
      row.name,
      patientReference(row),
      row.doctor,
      row.status,
      row.fee_bhd > 0 ? String(Math.round(row.fee_bhd)) : "",
      row.date ? fmtDate(row.date) : "",
    ]
      .map(csvField)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "appointments-recent.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const RECENT_COLUMNS: DataTableColumn<AppointmentsAnalyticsRow>[] = [
  { key: "name", label: "Appointment" },
  {
    key: "patient",
    label: "Patient",
    lockNote: "name-seers only",
    render: (row) => <PatientRef patient={{ ...row, ...row.patient_ref }} />,
  },
  { key: "doctor", label: "Doctor" },
  {
    key: "status",
    label: "Status",
    render: (row) => <Chip variant={statusVariant(row.status)}>{row.status}</Chip>,
  },
  { key: "fee", label: "Fee BHD", numeric: true, render: (row) => feeCell(row.fee_bhd) },
  { key: "date", label: "Date", numeric: true, render: (row) => dateCell(row.date) },
];

type CohortRow = GrowthRetentionData["booking_cohorts"]["cohorts"][number];

/* Immature repeat windows arrive as null; they read as a calm dash. */
function repeatCell(pct: number | null): string {
  return pct == null ? "-" : `${pct}%`;
}

const COHORT_COLUMNS: DataTableColumn<CohortRow>[] = [
  { key: "label", label: "First booking" },
  { key: "size", label: "New patients", numeric: true, render: (r) => r.size.toLocaleString() },
  { key: "repeat_1m_pct", label: "1 month", numeric: true, render: (r) => repeatCell(r.repeat_1m_pct) },
  { key: "repeat_2m_pct", label: "2 months", numeric: true, render: (r) => repeatCell(r.repeat_2m_pct) },
  { key: "repeat_3m_pct", label: "3 months", numeric: true, render: (r) => repeatCell(r.repeat_3m_pct) },
  {
    key: "repeat_revenue",
    label: "Repeat revenue",
    numeric: true,
    render: (r) => fmtBHD(r.repeat_revenue),
  },
];

function AnalyticsSkeleton() {
  return (
    <Grid>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={spans.c3}>
          <Skeleton height={122} />
        </div>
      ))}
      <div className={spans.c6}>
        <Skeleton height={220} />
      </div>
      <div className={spans.c6}>
        <Skeleton height={220} />
      </div>
      <div className={spans.c12}>
        <Skeleton height={280} />
      </div>
    </Grid>
  );
}

function AppointmentsContent() {
  useFocusFlash();
  const router = useRouter();
  const searchParams = useSearchParams();

  const title = TITLES.appointments;
  const requested = searchParams.get("period");
  const period: AppointmentsPeriod = PERIODS.includes(requested as AppointmentsPeriod)
    ? (requested as AppointmentsPeriod)
    : "mtd";

  const query = useQuery({
    queryKey: [...qk.appointmentsAnalytics(period)],
    queryFn: () =>
      fetchEnvelope<AppointmentsAnalyticsData>(
        "appointments_analytics",
        "/appointments/analytics",
        { period },
      ),
  });

  /* The booking-retention cohorts come from the existing growth endpoint and
     do not move with the period control. */
  const retention = useQuery({
    queryKey: qk.growth("retention"),
    queryFn: () => fetchEnvelope<GrowthRetentionData>("growth_retention", "/growth/retention"),
  });

  function navigate(nextPeriod: string) {
    const params = new URLSearchParams();
    params.set("period", nextPeriod);
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/appointments?${params.toString()}`);
  }

  return (
    <>
      <div className="mb-3 mt-[10px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
          <p className="text-[13.5px] text-ink-2">{title.sub}</p>
        </div>
        <Pills
          items={PERIOD_ITEMS}
          value={period}
          onChange={navigate}
          aria-label="Reporting period"
        />
      </div>

      <QueryPanel query={query} skeleton={<AnalyticsSkeleton />}>
        {(data, _meta, flags) => {
          const m = data.metrics;
          const maxStage = Math.max(1, ...data.stage_breakdown.map((s) => s.count));
          const maxRevenue = Math.max(1, ...data.by_doctor.map((d) => d.revenue_bhd));
          const maxSaleemIncome = Math.max(
            1,
            ...data.by_doctor.map((d) => d.saleem_income_bhd ?? 0),
          );
          const stageRows = data.stage_breakdown.map((s) => ({
            label: s.name,
            value: s.count,
            pct: (s.count / maxStage) * 100,
          }));
          const doctorRows = data.by_doctor.map((d) => ({
            label: d.name,
            value: fmtBHD(d.revenue_bhd),
            pct: (d.revenue_bhd / maxRevenue) * 100,
          }));
          const doctorSaleemRows = data.by_doctor.map((d) => ({
            label: d.name,
            value: fmtBHD(d.saleem_income_bhd ?? 0),
            pct: ((d.saleem_income_bhd ?? 0) / maxSaleemIncome) * 100,
          }));
          return (
            <Grid className={flags.unreliable ? "opacity-55" : undefined}>
              <KpiCard
                className={spans.c3}
                label="Total appointments"
                value={m.total.toLocaleString()}
                note="Bookings in this period"
              />
              <KpiCard
                className={spans.c3}
                label="Completed"
                value={m.completed.toLocaleString()}
                bar={{ value: m.completion_rate_pct, fill: "good" }}
                note="Marked done"
              />
              <KpiCard
                className={spans.c3}
                label="Revenue"
                value={fmtBHD(m.revenue_bhd)}
                note="Fees from this period"
              />
              <KpiCard
                className={spans.c3}
                label="Completion rate"
                value={`${m.completion_rate_pct}%`}
                note="Share of bookings completed"
              />

              <KpiCard
                className={spans.c3}
                label="Gross income"
                value={fmtBHD(m.gross_income_bhd ?? 0)}
                note="Total fees from completed appointments"
              />
              <KpiCard
                className={spans.c3}
                label="Saleem income"
                value={fmtBHD(m.saleem_income_bhd ?? 0)}
                note="Saleem share after the provider payout"
              />

              <div className={spans.c6} data-focus-id="appointments-stages">
                <Card>
                  <CardHeader
                    title="Stage pipeline"
                    subtitle="Where bookings sit across their lifecycle."
                  />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    {data.stage_breakdown.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No bookings in this period yet.</p>
                    ) : (
                      <MiniBars rows={stageRows} />
                    )}
                  </div>
                  <CardFooter note="One row per booking stage, counted in this period." />
                </Card>
              </div>

              <div className={spans.c6} data-focus-id="appointments-doctors">
                <Card>
                  <CardHeader
                    title="Doctor breakdown"
                    subtitle="Revenue by doctor across this period."
                  />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    {data.by_doctor.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No doctor activity in this period yet.</p>
                    ) : (
                      <>
                        <p className="mb-[7px] text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3">
                          Gross revenue
                        </p>
                        <MiniBars rows={doctorRows} />
                        <p className="mb-[7px] mt-[15px] text-[10.5px] font-bold uppercase tracking-[.07em] text-ink-3">
                          Saleem income
                        </p>
                        <MiniBars rows={doctorSaleemRows} />
                      </>
                    )}
                  </div>
                  <CardFooter note="Top bars track gross revenue; lower bars track Saleem income." />
                </Card>
              </div>

              <div className={spans.c12} data-focus-id="appointments-recent">
                <Card>
                  <CardHeader
                    title="Recent appointments"
                    subtitle="Latest bookings, newest first."
                  />
                  <div className="px-[18px] pb-2 pt-[5px]">
                    {data.recent.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No appointments to show yet.</p>
                    ) : (
                      <DataTable
                        columns={RECENT_COLUMNS}
                        rows={data.recent}
                        rowKey={(row) => row.id}
                      />
                    )}
                  </div>
                  <CardFooter
                    note="Patient names stay with the name-seers; everyone else reads the reference."
                    right={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadRecentCsv(data.recent)}
                        disabled={data.recent.length === 0}
                      >
                        <Download strokeWidth={1.8} aria-hidden="true" />
                        Export CSV
                      </Button>
                    }
                  />
                </Card>
              </div>

              <div className={spans.c12} data-focus-id="appointments-retention">
                <Card>
                  <CardHeader
                    title="Booking retention, month cohorts"
                    subtitle="Of patients whose first paid booking landed in a month, how many book again."
                  />
                  <div className="px-[18px] pb-4 pt-[5px]">
                    <QueryPanel
                      query={retention}
                      skeleton={<Skeleton height={200} />}
                      isEmpty={(d) => d.booking_cohorts.cohorts.every((c) => c.size === 0)}
                      emptyCopy="No paid bookings inside the cohort window yet."
                    >
                      {(rdata) => (
                        <DataTable
                          columns={COHORT_COLUMNS}
                          rows={rdata.booking_cohorts.cohorts}
                          rowKey={(r) => r.key}
                        />
                      )}
                    </QueryPanel>
                  </div>
                  <CardFooter note="Independent of the period control above." />
                </Card>
              </div>
            </Grid>
          );
        }}
      </QueryPanel>
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsContent />
    </Suspense>
  );
}

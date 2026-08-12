"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AppointmentFilters } from "@/components/appointments/AppointmentFilters";
import { MiniBars } from "@/components/charts/MiniBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { CopyButton } from "@/components/ui/CopyButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { PatientRef } from "@/components/ui/PatientRef";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  AppointmentsAnalyticsData,
  AppointmentsAnalyticsRow,
  AppointmentsDoctorRow,
  AppointmentsPeriod,
  AppointmentsStatusCount,
  AppointmentsTypeCount,
  GrowthRetentionData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import {
  bahrainToday,
  filterRows,
  optionsFrom,
  readFilters,
  writeFilters,
  type AppointmentFilterState,
} from "@/lib/appointments/filters";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtBHD } from "@/lib/format/bhd";
import { fmtDateTime, fmtTime } from "@/lib/format/datetime";
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

/* The month picker offers the current month and the twelve before it, newest
   first, as YYYY-MM values with a readable label. Browser-local time is fine
   here: this is only the option list, and the actual window is computed in
   Bahrain time on the server. */
function recentMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}

/* Status to Chip variant. Done reads as good; the in-flight stages read as
   neutral information; the terminal non-completions (Cancelled, No Show) and
   everything else stay muted, carrying their severity in the word alone. There
   is no red. */
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

/* Consult-scale amounts keep one decimal under BHD 100, whole dinars above, so
   a BHD 9.5 Saleem cut is not rounded to 10. Mirrors the Commission tab. */
function fmtAmount(n: number): string {
  return n >= 100 ? fmtBHD(n) : `BHD ${n.toFixed(1)}`;
}

/* Saleem cut and provider payout per consult, from the same commission engine
   the Commission tab uses. Present only on completed consults (Done or Awaiting
   Review); anything else reads as a calm dash. */
function splitCell(n: number | undefined): string {
  return n == null ? "-" : fmtAmount(n);
}

/* Appointment start with its time, then the end time and length underneath. A
   null start reads as a calm dash rather than "NaN"; a booking with no end time
   or duration shows the start alone. */
function whenCell(row: AppointmentsAnalyticsRow): ReactNode {
  if (!row.date) return <span className="text-ink-2">-</span>;
  const tail = [
    row.ends_at ? `to ${fmtTime(row.ends_at)}` : null,
    row.duration_min != null ? `${row.duration_min} min` : null,
  ].filter((part): part is string => part != null);
  return (
    <div>
      <div>{fmtDateTime(row.date)}</div>
      {tail.length > 0 ? (
        <div className="text-[11.5px] text-ink-2">{tail.join(" · ")}</div>
      ) : null}
    </div>
  );
}

/* Base URL for an appointment in the admin console. The row's admin_id is the
   resource id, parsed server-side from the booking's doctor link. */
const ADMIN_APPOINTMENT_URL =
  "https://admin.tellsaleem.com/nova/resources/appointment-resources/";

/* The admin appointment id as a link into the admin console, with the Saleem
   booking reference and its copy control underneath. Abandoned checkouts carry
   neither and read as a calm dash. */
function refCell(row: AppointmentsAnalyticsRow): ReactNode {
  if (!row.admin_id && !row.saleem_id) return <span className="text-ink-2">-</span>;
  return (
    <div className="whitespace-nowrap">
      {row.admin_id ? (
        <a
          href={`${ADMIN_APPOINTMENT_URL}${row.admin_id}`}
          target="_blank"
          rel="noreferrer"
          className="num text-[13px] font-semibold text-accent hover:underline"
        >
          #{row.admin_id}
        </a>
      ) : null}
      {row.saleem_id ? (
        <div className="flex items-center gap-1 text-[11.5px] text-ink-2">
          <span className="num">{row.saleem_id}</span>
          <CopyButton value={row.saleem_id} label="Copy booking reference" />
        </div>
      ) : null}
    </div>
  );
}

/* The three share links the booking system generates, each as a copy control.
   Only links the booking actually carries are offered; a booking with none (an
   abandoned checkout) reads as a calm dash. The link text itself is never
   rendered: these are access links, so they are copied deliberately rather than
   left sitting on screen. */
const LINK_KINDS = [
  { key: "patient_link", label: "Patient", copy: "Copy patient link" },
  { key: "doctor_link", label: "Doctor", copy: "Copy doctor link" },
  { key: "guest_link", label: "Guest", copy: "Copy guest link" },
] as const;

function linksCell(row: AppointmentsAnalyticsRow): ReactNode {
  const available = LINK_KINDS.filter((kind) => row[kind.key] != null);
  if (available.length === 0) return <span className="text-ink-2">-</span>;
  return (
    <span className="inline-flex items-center gap-[7px] whitespace-nowrap">
      {available.map((kind) => (
        <span key={kind.key} className="inline-flex items-center gap-[1px]">
          <span className="text-[11px] text-ink-3">{kind.label}</span>
          <CopyButton value={row[kind.key] as string} label={kind.copy} />
        </span>
      ))}
    </span>
  );
}

/* Appointment type text. A null or empty type reads as a calm dash; a booking
   with no type is treated as standard by the commission engine. */
function typeCell(type: string | null): string {
  return type && type.trim() ? type : "-";
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
   anchor. The patient column carries only the reference, never the name. The
   three share links are deliberately left out: they are access links, and an
   exported spreadsheet circulates far more freely than the page does. */
function downloadRecentCsv(rows: AppointmentsAnalyticsRow[]): void {
  const header = [
    "Admin ID",
    "Reference",
    "Patient (ref)",
    "Doctor",
    "Type",
    "Status",
    "Fee BHD",
    "Saleem BHD",
    "Provider BHD",
    "Rule",
    "Start",
    "End",
    "Duration min",
  ];
  const lines = rows.map((row) =>
    [
      row.admin_id ?? "",
      row.saleem_id ?? "",
      patientReference(row),
      row.doctor,
      row.type ?? "",
      row.status,
      row.fee_bhd > 0 ? String(Math.round(row.fee_bhd)) : "",
      row.saleem_bhd != null ? String(row.saleem_bhd) : "",
      row.provider_payout_bhd != null ? String(row.provider_payout_bhd) : "",
      row.rule_label ?? "",
      row.date ? fmtDateTime(row.date) : "",
      row.ends_at ? fmtDateTime(row.ends_at) : "",
      row.duration_min != null ? String(row.duration_min) : "",
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
  { key: "reference", label: "Reference", render: refCell },
  {
    key: "patient",
    label: "Patient",
    lockNote: "name-seers only",
    render: (row) => <PatientRef patient={{ ...row, ...row.patient_ref }} />,
  },
  { key: "doctor", label: "Doctor" },
  { key: "type", label: "Type", render: (row) => typeCell(row.type) },
  {
    key: "status",
    label: "Status",
    render: (row) => <Chip variant={statusVariant(row.status)}>{row.status}</Chip>,
  },
  { key: "fee", label: "Fee BHD", numeric: true, render: (row) => feeCell(row.fee_bhd) },
  {
    key: "saleem",
    label: "Saleem BHD",
    numeric: true,
    render: (row) => splitCell(row.saleem_bhd),
  },
  {
    key: "provider",
    label: "Provider BHD",
    numeric: true,
    render: (row) => splitCell(row.provider_payout_bhd),
  },
  {
    key: "rule",
    label: "Rule",
    render: (row) =>
      row.rule_label ? (
        <Chip variant="info">{row.rule_label}</Chip>
      ) : (
        <span className="text-ink-2">-</span>
      ),
  },
  { key: "when", label: "Date and time", numeric: true, render: whenCell },
  { key: "links", label: "Links", render: linksCell },
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

/* The commission rate the engine resolved for a doctor (their own first, then
   the hospital). "not set" means neither was found, so the doctor's bookings
   used the rule default. This is the column to scan when Saleem income looks
   low: a doctor you expect at 10, 15, or 20 percent showing "not set" is where
   the per-doctor percentage is failing to resolve. */
function commissionCell(pct: number | null | undefined): string {
  return pct == null ? "not set" : `${pct}%`;
}

const DOCTOR_COLUMNS: DataTableColumn<AppointmentsDoctorRow>[] = [
  { key: "name", label: "Doctor" },
  { key: "count", label: "Appts", numeric: true, render: (d) => d.count.toLocaleString() },
  {
    key: "commission_pct",
    label: "Commission %",
    numeric: true,
    render: (d) => commissionCell(d.commission_pct),
  },
  {
    key: "saleem",
    label: "Saleem BHD",
    numeric: true,
    render: (d) => fmtBHD(d.saleem_income_bhd ?? 0),
  },
];

/* Reconciliation diagnostic tables (revenue spec, step 1). Status breakdown
   shows where gross sits so the completed basis is visible; type distribution
   shows every raw spelling with its normalized form and the track assigned
   today, so the Novo set can be completed from real data. */
const STATUS_COLUMNS: DataTableColumn<AppointmentsStatusCount>[] = [
  { key: "status", label: "Status" },
  { key: "count", label: "Count", numeric: true, render: (r) => r.count.toLocaleString() },
  { key: "gross", label: "Gross BHD", numeric: true, render: (r) => fmtBHD(r.gross_bhd) },
];

const TYPE_COLUMNS: DataTableColumn<AppointmentsTypeCount>[] = [
  { key: "type_raw", label: "Type" },
  { key: "type_normalized", label: "Normalized" },
  { key: "count", label: "Count", numeric: true, render: (r) => r.count.toLocaleString() },
  { key: "track", label: "Track", render: (r) => (r.track === "novo" ? "Novo" : "Standard") },
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

  // A specific month (YYYY-MM), when picked, overrides the period pills. The
  // period stays in the URL as the fallback for when the month is cleared.
  const requestedMonth = searchParams.get("month");
  const monthValid =
    requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
  const monthOptions = recentMonths(13);

  const query = useQuery({
    queryKey: [...qk.appointmentsAnalytics(period, monthValid ?? undefined)],
    queryFn: () =>
      fetchEnvelope<AppointmentsAnalyticsData>(
        "appointments_analytics",
        "/appointments/analytics",
        { period, month: monthValid ?? undefined },
      ),
  });

  /* The booking-retention cohorts come from the existing growth endpoint and
     do not move with the period control. */
  const retention = useQuery({
    queryKey: qk.growth("retention"),
    queryFn: () => fetchEnvelope<GrowthRetentionData>("growth_retention", "/growth/retention"),
  });

  // Table filters, also carried in the URL so a filtered view survives a reload
  // and can be shared. These narrow the Recent table only; see the note in
  // lib/appointments/filters.ts.
  const filters = readFilters(searchParams);

  // One place to set the window and the filters. period is always written so
  // clearing the month falls back to it; month is written only when a specific
  // month is chosen. Filters ride along on every push so changing the period
  // does not silently drop them.
  function pushParams(
    nextPeriod: string,
    nextMonth: string | null,
    nextFilters: AppointmentFilterState = filters,
  ) {
    const params = new URLSearchParams();
    params.set("period", nextPeriod);
    if (nextMonth) params.set("month", nextMonth);
    writeFilters(nextFilters, params);
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/appointments?${params.toString()}`);
  }

  // Today needs the loaded window to contain today, so it also resets the period
  // to MTD and clears any specific month. Without that, picking Today while
  // June is selected would filter a June payload down to nothing.
  function applyToday() {
    const today = bahrainToday();
    pushParams("mtd", null, { ...filters, from: today, to: today });
  }

  return (
    <>
      <div className="mb-3 mt-[10px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
          <p className="text-[13.5px] text-ink-2">{title.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pills
            items={PERIOD_ITEMS}
            value={monthValid ? "" : period}
            onChange={(p) => pushParams(p, null)}
            aria-label="Reporting period"
          />
          <select
            aria-label="Specific month"
            value={monthValid ?? ""}
            onChange={(e) => pushParams(period, e.target.value || null)}
            className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
          >
            <option value="">Or pick a month</option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <QueryPanel query={query} skeleton={<AnalyticsSkeleton />}>
        {(data, _meta, flags) => {
          const m = data.metrics;
          const maxStage = Math.max(1, ...data.stage_breakdown.map((s) => s.count));
          const stageRows = data.stage_breakdown.map((s) => ({
            label: s.name,
            value: s.count,
            pct: (s.count / maxStage) * 100,
          }));
          // Filter options come from the rows on screen, so the panel only offers
          // values that can match. The filtered set drives the table and the CSV;
          // the cards above stay period-wide, which the table header states.
          const filterOptions = optionsFrom(data.recent);
          const visibleRows = filterRows(data.recent, filters);
          const filtered = visibleRows.length !== data.recent.length;
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
                note="Done or awaiting review"
              />
              <KpiCard
                className={spans.c3}
                label="Free consults"
                value={m.free.toLocaleString()}
                note="Discounted 100 percent, so they add no revenue"
              />
              <KpiCard
                className={spans.c3}
                label="Completion rate"
                value={`${m.completion_rate_pct}%`}
                note="Completed over every booking, cancellations included"
              />
              <KpiCard
                className={spans.c3}
                label="Cancelled or no show"
                value={(m.cancelled + m.no_show).toLocaleString()}
                note={`${m.cancelled.toLocaleString()} cancelled, ${m.no_show.toLocaleString()} no show`}
              />

              <KpiCard
                className={spans.c3}
                label="Gross income"
                value={fmtBHD(m.gross_income_bhd ?? 0)}
                note="Fees from completed paid consults, free ones add nothing"
              />
              <KpiCard
                className={spans.c3}
                label="Saleem income"
                value={fmtBHD(m.saleem_income_bhd ?? 0)}
                note="Saleem share after the provider payout, free appointments included"
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
                  <CardFooter note="One row per booking stage, counted in this period. Cancelled and no show are included, so the rows add up to the total above." />
                </Card>
              </div>

              <div className={spans.c6} data-focus-id="appointments-doctors">
                <Card>
                  <CardHeader
                    title="Doctor breakdown"
                    subtitle="Resolved commission rate and Saleem income by doctor."
                  />
                  <div className="px-[18px] pb-2 pt-[5px]">
                    {data.by_doctor.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No doctor activity in this period yet.</p>
                    ) : (
                      <DataTable
                        columns={DOCTOR_COLUMNS}
                        rows={data.by_doctor}
                        rowKey={(d) => d.name}
                      />
                    )}
                  </div>
                  <CardFooter
                    note={
                      m.commission_unset && m.commission_unset > 0
                        ? `${m.commission_unset} standard bookings had no commission rate set and used the default. Check those doctors in Zoho.`
                        : "Every standard booking resolved a commission rate."
                    }
                  />
                </Card>
              </div>

              <div className={spans.c6} data-focus-id="appointments-status">
                <Card>
                  <CardHeader
                    title="Status breakdown"
                    subtitle="Every status in this period, with its gross."
                  />
                  <div className="px-[18px] pb-2 pt-[5px]">
                    {data.status_breakdown.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No bookings in this period yet.</p>
                    ) : (
                      <DataTable
                        columns={STATUS_COLUMNS}
                        rows={data.status_breakdown}
                        rowKey={(r) => r.status}
                      />
                    )}
                  </div>
                  <CardFooter note="Completed basis is Done plus Awaiting Review; the other statuses are excluded." />
                </Card>
              </div>

              <div className={spans.c6} data-focus-id="appointments-types">
                <Card>
                  <CardHeader
                    title="Type distribution"
                    subtitle="Distinct booking types, normalized, and the track assigned today."
                  />
                  <div className="px-[18px] pb-2 pt-[5px]">
                    {data.type_distribution.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No booking types in this period yet.</p>
                    ) : (
                      <DataTable
                        columns={TYPE_COLUMNS}
                        rows={data.type_distribution}
                        rowKey={(r) => r.type_raw}
                      />
                    )}
                  </div>
                  <CardFooter note="Use these spellings to complete the Novo set. Track shown is the current classification." />
                </Card>
              </div>

              <div className={spans.c12} data-focus-id="appointments-recent">
                <Card>
                  <CardHeader
                    title="Recent appointments"
                    subtitle={
                      filtered
                        ? `${visibleRows.length.toLocaleString()} of ${data.recent.length.toLocaleString()} bookings match these filters. The cards above still cover the whole period.`
                        : "Latest bookings, newest first."
                    }
                  />
                  <div className="px-[18px] pt-[11px]">
                    <AppointmentFilters
                      filters={filters}
                      options={filterOptions}
                      onChange={(next) => pushParams(period, monthValid, next)}
                      onToday={applyToday}
                    />
                  </div>
                  <div className="px-[18px] pb-2 pt-[9px]">
                    {data.recent.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No appointments to show yet.</p>
                    ) : visibleRows.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">
                        No appointments match these filters.
                        {filters.from !== null || filters.to !== null
                          ? " If the dates sit outside the reporting period above, widen it to All time."
                          : ""}
                      </p>
                    ) : (
                      <DataTable
                        columns={RECENT_COLUMNS}
                        rows={visibleRows}
                        rowKey={(row) => row.id}
                      />
                    )}
                  </div>
                  <CardFooter
                    note="Saleem cut and provider payout show on completed consults. Copy a patient, doctor, or guest link from the Links column. Patient names stay with the name-seers; everyone else reads the reference."
                    right={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadRecentCsv(visibleRows)}
                        disabled={visibleRows.length === 0}
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

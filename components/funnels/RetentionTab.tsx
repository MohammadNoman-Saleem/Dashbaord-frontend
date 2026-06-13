"use client";

// Funnels, Retention tab. Three sections from one endpoint:
//   1. Behaviour retention: Mixpanel weekly cohort matrices (anonymous
//      device-level visits and paid bookings). Null with an authored reason
//      while Mixpanel is rate limited cold; the CRM sections still render.
//   2. Lead to booking: per-source conversion and velocity from the CRM
//      email join. Labels are sources, never identities.
//   3. Repeat booking cohorts: month-of-first-paid-booking cohorts with
//      repeat shares and revenue. Immature windows read "Pending", never 0.

import type { UseQueryResult } from "@tanstack/react-query";

import { RetentionGrid } from "@/components/charts/RetentionGrid";
import { FunnelTabSkeleton } from "@/components/funnels/TabSkeleton";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { QueryPanel } from "@/components/ui/QueryPanel";
import type { GrowthRetentionData } from "@/lib/api/contract";
import type { Envelope, Meta } from "@/lib/api/envelope";
import { fmtBHD } from "@/lib/format/bhd";

type SourceRow = GrowthRetentionData["lead_to_booking"]["by_source"][number];
type CohortRow = GrowthRetentionData["booking_cohorts"]["cohorts"][number];

/* Immature repeat windows arrive as null (the month is not over yet);
   they read "Pending" in calm muted text, never a zero. */
function repeatCell(pct: number | null) {
  return pct == null ? <span className="text-ink-3">Pending</span> : `${pct}%`;
}

const SOURCE_COLUMNS: DataTableColumn<SourceRow>[] = [
  { key: "source", label: "Source" },
  { key: "leads", label: "Leads", numeric: true, render: (r) => r.leads.toLocaleString() },
  { key: "booked", label: "Booked", numeric: true, render: (r) => r.booked.toLocaleString() },
  { key: "conversion_pct", label: "Conversion", numeric: true, render: (r) => `${r.conversion_pct}%` },
  {
    key: "median_days",
    label: "Median days",
    numeric: true,
    render: (r) => (r.median_days == null ? <span className="text-ink-3">No bookings</span> : r.median_days),
  },
];

const COHORT_COLUMNS: DataTableColumn<CohortRow>[] = [
  { key: "label", label: "Cohort" },
  { key: "size", label: "Patients", numeric: true, render: (r) => r.size.toLocaleString() },
  { key: "repeat_1m_pct", label: "Within 1 mo", numeric: true, render: (r) => repeatCell(r.repeat_1m_pct) },
  { key: "repeat_2m_pct", label: "Within 2 mo", numeric: true, render: (r) => repeatCell(r.repeat_2m_pct) },
  { key: "repeat_3m_pct", label: "Within 3 mo", numeric: true, render: (r) => repeatCell(r.repeat_3m_pct) },
  { key: "first_revenue", label: "First revenue", numeric: true, render: (r) => fmtBHD(r.first_revenue) },
  { key: "repeat_revenue", label: "Repeat revenue", numeric: true, render: (r) => fmtBHD(r.repeat_revenue) },
];

function behaviourReason(meta: Meta): string {
  return (
    meta.reasons.find((r) => r.key === "mixpanel_rate_limited")?.text ??
    "Mixpanel has no saved cohorts for this view yet. It refreshes again within the hour."
  );
}

export function RetentionTab({ query }: { query: UseQueryResult<Envelope<GrowthRetentionData>> }) {
  return (
    <QueryPanel query={query} skeleton={<FunnelTabSkeleton tiles={3} />}>
      {(data, meta, flags) => {
        const dim = flags.unreliable ? "opacity-55" : undefined;
        const ltb = data.lead_to_booking;
        const cohorts = data.booking_cohorts;
        return (
          <Grid className={dim}>
            <KpiCard
              className={spans.c4}
              label="Leads converting to a paid booking"
              value={`${ltb.overall.conversion_pct}%`}
              suffix={`${ltb.overall.booked.toLocaleString()} of ${ltb.overall.leads.toLocaleString()} leads`}
              note="Email join, all time"
              dot="good"
            />
            <KpiCard
              className={spans.c4}
              label="Median days to first booking"
              value={ltb.overall.median_days == null ? "No bookings yet" : ltb.overall.median_days}
              suffix={ltb.overall.median_days == null ? undefined : "days"}
              note="From lead creation to first paid booking"
              dot="good"
            />
            <KpiCard
              className={spans.c4}
              label="Identified repeat-booking patients"
              value={cohorts.identified_patients.toLocaleString()}
              note="Unique paying patients across all cohorts"
              dot="good"
            />

            <div className={spans.c6} data-focus-id="retention-visits">
              <Card>
                <CardHeader
                  title="Visit retention, weekly cohorts"
                  subtitle="Share of new visitors who come back to the consult page."
                />
                <div className="px-[18px] pb-4 pt-[13px]">
                  {data.behaviour == null ? (
                    <p className="py-2 text-[13px] text-ink-2">{behaviourReason(meta)}</p>
                  ) : (
                    <RetentionGrid columns={data.behaviour.columns} cohorts={data.behaviour.visits} />
                  )}
                </div>
                <CardFooter note="Anonymous device-level visits from Mixpanel, not patient identity." />
              </Card>
            </div>

            <div className={spans.c6} data-focus-id="retention-bookings">
              <Card>
                <CardHeader
                  title="Booking retention, weekly cohorts"
                  subtitle="Share of new visitors who go on to pay for a consult."
                />
                <div className="px-[18px] pb-4 pt-[13px]">
                  {data.behaviour == null ? (
                    <p className="py-2 text-[13px] text-ink-2">{behaviourReason(meta)}</p>
                  ) : (
                    <RetentionGrid columns={data.behaviour.columns} cohorts={data.behaviour.bookings} />
                  )}
                </div>
                <CardFooter note="Day 0 reads low by design: few visitors pay in their first week." />
              </Card>
            </div>

            <div className={spans.c12} data-focus-id="retention-lead-to-booking">
              <Card>
                <CardHeader
                  title="Lead to booking, by source"
                  subtitle="Which sources turn into paid bookings, and how fast."
                />
                <div className="px-[18px] pb-4 pt-[5px]">
                  {ltb.by_source.length === 0 ? (
                    <p className="py-2 text-[13px] text-ink-2">No leads with an email to join on yet.</p>
                  ) : (
                    <DataTable columns={SOURCE_COLUMNS} rows={ltb.by_source} rowKey={(r) => r.source} />
                  )}
                </div>
                <CardFooter
                  note={`${ltb.leads_with_email.toLocaleString()} of ${ltb.leads_total.toLocaleString()} lead records carry an email. ${ltb.definition}`}
                />
              </Card>
            </div>

            <div className={spans.c12} data-focus-id="retention-booking-cohorts">
              <Card>
                <CardHeader
                  title="Repeat bookings, month cohorts"
                  subtitle="Of patients whose first paid booking landed in a month, how many book again."
                />
                <div className="px-[18px] pb-4 pt-[5px]">
                  {cohorts.cohorts.every((c) => c.size === 0) ? (
                    <p className="py-2 text-[13px] text-ink-2">No paid bookings inside the cohort window yet.</p>
                  ) : (
                    <DataTable columns={COHORT_COLUMNS} rows={cohorts.cohorts} rowKey={(r) => r.key} />
                  )}
                </div>
                <CardFooter note={cohorts.definition} />
              </Card>
            </div>
          </Grid>
        );
      }}
    </QueryPanel>
  );
}

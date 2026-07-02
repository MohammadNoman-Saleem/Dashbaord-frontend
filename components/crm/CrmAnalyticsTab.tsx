"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { MiniBars } from "@/components/charts/MiniBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  CrmSegmentMetric,
  CrmSegmentsData,
  GrowthRetentionData,
  PipelineLossesData,
  PipelineVelocityData,
  VelocityPipeline,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* CRM Analytics tab: geographic and specialty breakdowns (new, from the shared
   classification), plus SLA stage velocity, loss analysis, and the lead-to
   -booking cohort, all reused from the existing pipeline and growth endpoints
   rather than duplicated. */

const METRIC_ITEMS = [
  { key: "count", label: "Deals" },
  { key: "amount", label: "Value" },
];

type L2BRow = GrowthRetentionData["lead_to_booking"]["by_source"][number];
type LossOwner = PipelineLossesData["owners"][number];

const VELOCITY_COLUMNS: DataTableColumn<VelocityPipeline>[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "open", label: "Open avg days", numeric: true, render: (v) => v.open_avg_days.toLocaleString() },
  { key: "won", label: "Won cycle days", numeric: true, render: (v) => (v.won ? v.won.avg_days.toLocaleString() : "·") },
  { key: "fastest", label: "Fastest stage", render: (v) => (v.fastest ? `${v.fastest.name} (${v.fastest.avg_days}d)` : "·") },
  { key: "bottleneck", label: "Bottleneck stage", render: (v) => (v.bottleneck ? `${v.bottleneck.name} (${v.bottleneck.avg_days}d)` : "·") },
];

const OWNER_COLUMNS: DataTableColumn<LossOwner>[] = [
  { key: "owner", label: "Owner" },
  { key: "count", label: "Lost deals", numeric: true, render: (o) => o.count.toLocaleString() },
  { key: "value", label: "Lost value BHD", numeric: true, render: (o) => fmtBHD(o.value_bhd) },
];

const L2B_COLUMNS: DataTableColumn<L2BRow>[] = [
  { key: "source", label: "Source" },
  { key: "leads", label: "Leads", numeric: true, render: (r) => r.leads.toLocaleString() },
  { key: "booked", label: "Booked", numeric: true, render: (r) => r.booked.toLocaleString() },
  { key: "conversion", label: "Conversion %", numeric: true, render: (r) => `${r.conversion_pct}%` },
  { key: "median", label: "Median days", numeric: true, render: (r) => (r.median_days == null ? "·" : r.median_days.toLocaleString()) },
];

export function CrmAnalyticsTab() {
  const [metric, setMetric] = useState<CrmSegmentMetric>("count");

  const segments = useQuery({
    queryKey: [...qk.crmSegments(metric)],
    queryFn: () => fetchEnvelope<CrmSegmentsData>("crm_segments", "/crm/segments", { metric }),
  });
  const velocity = useQuery({
    queryKey: [...qk.pipelineVelocity()],
    queryFn: () => fetchEnvelope<PipelineVelocityData>("pipeline_velocity", "/pipeline/velocity"),
  });
  const losses = useQuery({
    queryKey: [...qk.pipelineLosses()],
    queryFn: () => fetchEnvelope<PipelineLossesData>("pipeline_losses", "/pipeline/losses"),
  });
  const retention = useQuery({
    queryKey: qk.growth("retention"),
    queryFn: () => fetchEnvelope<GrowthRetentionData>("growth_retention", "/growth/retention"),
  });

  const l2b = retention.data?.data?.lead_to_booking;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-[.07em] text-ink-3">
          Geographic and specialty
        </h3>
        <Pills
          items={METRIC_ITEMS}
          value={metric}
          onChange={(k) => setMetric(k as CrmSegmentMetric)}
          aria-label="Segment metric"
        />
      </div>

      <QueryPanel query={segments} skeleton={<Skeleton height={220} />}>
        {(s) => {
          const label = metric === "amount" ? "value" : "deals";
          const maxG = Math.max(1, ...s.geographic.map((x) => x.value));
          const maxS = Math.max(1, ...s.specialty.map((x) => x.value));
          const val = (n: number) => (metric === "amount" ? fmtBHD(n) : n.toLocaleString());
          return (
            <Grid>
              <div className={spans.c6}>
                <Card>
                  <CardHeader title="Geographic" subtitle="Destination demand across customer deals." />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    {s.geographic.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No destination data yet.</p>
                    ) : (
                      <MiniBars
                        rows={s.geographic.map((x) => ({ label: x.name, value: val(x.value), pct: (x.value / maxG) * 100 }))}
                      />
                    )}
                  </div>
                  <CardFooter note={`By ${label}, customer deals only.`} />
                </Card>
              </div>
              <div className={spans.c6}>
                <Card>
                  <CardHeader title="Medical specialty" subtitle="Concern grouping across customer deals." />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    {s.specialty.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No specialty data yet.</p>
                    ) : (
                      <MiniBars
                        rows={s.specialty.map((x) => ({ label: x.name, value: val(x.value), pct: (x.value / maxS) * 100 }))}
                      />
                    )}
                  </div>
                  <CardFooter note={`By ${label}, customer deals only.`} />
                </Card>
              </div>
            </Grid>
          );
        }}
      </QueryPanel>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="SLA and stage velocity"
            subtitle="Open-stage age is approximate; won cycle is the real created-to-close time."
          />
          <div className="px-[18px] pb-2 pt-[5px]">
            <QueryPanel
              query={velocity}
              skeleton={<Skeleton height={200} />}
              isEmpty={(d) => d.pipelines.length === 0}
              emptyCopy="No velocity data yet."
            >
              {(d) => <DataTable columns={VELOCITY_COLUMNS} rows={d.pipelines} rowKey={(v) => v.pipeline} />}
            </QueryPanel>
          </div>
          <CardFooter note="Days per pipeline. Stage age is days since the deal was created, not true time-in-stage." />
        </Card>
      </div>

      <div className="mt-4">
        <QueryPanel query={losses} skeleton={<Skeleton height={220} />}>
          {(l) => {
            const maxM = Math.max(1, ...l.months.map((m) => m.value_bhd));
            return (
              <Grid>
                <KpiCard className={spans.c3} label="Lost deals" value={l.totals.lost_count.toLocaleString()} note="Trailing 12 months" />
                <KpiCard className={spans.c3} label="Lost value" value={fmtBHD(l.totals.lost_value_bhd)} note="Trailing 12 months" />
                <KpiCard className={spans.c6} label="Top loss reason" value={l.totals.top_reason ?? "·"} note="Most common reason" />

                <div className={spans.c6}>
                  <Card>
                    <CardHeader title="Lost value over time" subtitle="Monthly lost deal value, trailing 12 months." />
                    <div className="px-[18px] pb-4 pt-[13px]">
                      {l.months.length === 0 ? (
                        <p className="py-2 text-[13px] text-ink-2">No lost deals yet.</p>
                      ) : (
                        <MiniBars
                          rows={l.months.map((m) => ({ label: m.label, value: fmtBHD(m.value_bhd), pct: (m.value_bhd / maxM) * 100 }))}
                        />
                      )}
                    </div>
                  </Card>
                </div>
                <div className={spans.c6}>
                  <Card>
                    <CardHeader title="Lost by owner" subtitle="Where lost value sits." />
                    <div className="px-[18px] pb-2 pt-[5px]">
                      {l.owners.length === 0 ? (
                        <p className="py-2 text-[13px] text-ink-2">No lost deals yet.</p>
                      ) : (
                        <DataTable columns={OWNER_COLUMNS} rows={l.owners} rowKey={(o) => o.owner} />
                      )}
                    </div>
                  </Card>
                </div>
              </Grid>
            );
          }}
        </QueryPanel>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Lead to booking"
            subtitle="Of leads with an email, how many booked a paid appointment, by source."
          />
          <div className="px-[18px] pb-2 pt-[5px]">
            <QueryPanel
              query={retention}
              skeleton={<Skeleton height={200} />}
              isEmpty={(d) => d.lead_to_booking.by_source.length === 0}
              emptyCopy="No lead-to-booking data yet."
            >
              {(d) => <DataTable columns={L2B_COLUMNS} rows={d.lead_to_booking.by_source} rowKey={(r) => r.source} />}
            </QueryPanel>
          </div>
          {l2b ? (
            <CardFooter
              note={
                <span className="num">
                  Overall {l2b.overall.conversion_pct}% conversion · {l2b.overall.booked} of {l2b.overall.leads} leads
                </span>
              }
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}

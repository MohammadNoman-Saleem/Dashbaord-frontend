"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { FunnelBars } from "@/components/charts/FunnelBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  CrmFunnelData,
  CrmFunnelPeriod,
  CrmFunnelSegment,
  CrmMetricsData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";

/* CRM Overview tab: overall lead and deal KPIs, per-pipeline month over month,
   and the customer and provider funnels. The funnel section carries its own
   period control, per-section, matching the old dashboard; the KPIs and
   per-pipeline cards read one all-time metrics call with month-over-month
   deltas inside it. */

const PIPELINE_ORDER = [
  "Telemedicine",
  "Treatment",
  "Corporates",
  "Doctor",
  "Hospital or Clinic",
];

const FUNNEL_PERIODS = [
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All time" },
];

const FUNNEL_SEGMENTS: CrmFunnelSegment[] = ["Customers", "Providers"];

/* Signed percent for the KPI suffix. */
function changeText(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}% vs last month`;
}

export function CrmOverviewTab() {
  const [funnelPeriod, setFunnelPeriod] = useState<CrmFunnelPeriod>("all");

  const metrics = useQuery({
    queryKey: [...qk.crmMetrics()],
    queryFn: () => fetchEnvelope<CrmMetricsData>("crm_metrics", "/crm/metrics"),
  });

  const funnel = useQuery({
    queryKey: [...qk.crmFunnel(funnelPeriod)],
    queryFn: () =>
      fetchEnvelope<CrmFunnelData>("crm_funnel", "/crm/funnel", { period: funnelPeriod }),
  });

  return (
    <>
      <QueryPanel query={metrics} skeleton={<Skeleton height={320} />}>
        {(m) => (
          <Grid>
            <KpiCard className={spans.c3} label="Total leads" value={m.total_leads.toLocaleString()} note="All leads in Zoho" />
            <KpiCard
              className={spans.c3}
              label="Leads this month"
              value={m.total_leads_this_month.toLocaleString()}
              suffix={changeText(m.leads_change_pct)}
              note="New leads created this month"
            />
            <KpiCard className={spans.c3} label="Total deals" value={m.total_deals.toLocaleString()} note="All deals in Zoho" />
            <KpiCard
              className={spans.c3}
              label="Deals this month"
              value={m.total_deals_this_month.toLocaleString()}
              suffix={changeText(m.deals_change_pct)}
              note="New deals created this month"
            />
            <KpiCard className={spans.c3} label="Open deals" value={m.total_deals_open.toLocaleString()} note="In flight now" />
            <KpiCard className={spans.c3} label="Won" value={m.total_won.toLocaleString()} note="Across all pipelines" />
            <KpiCard className={spans.c3} label="Open pipeline value" value={fmtBHD(m.pipeline_value_bhd)} note="Value of open deals" />

            <div className={`${spans.c12} mt-1`}>
              <h3 className="text-[13px] font-bold uppercase tracking-[.07em] text-ink-3">
                Pipelines month over month
              </h3>
            </div>
            {PIPELINE_ORDER.map((pipe) => {
              const p = m.by_pipeline[pipe];
              if (!p) return null;
              return (
                <KpiCard
                  key={pipe}
                  className={spans.c4}
                  label={pipe}
                  value={p.this_month.toLocaleString()}
                  suffix={changeText(p.change_pct)}
                  note={`${p.won} won of ${p.total}, ${p.win_rate_pct}% win rate, ${fmtBHD(p.value_bhd)}`}
                />
              );
            })}
          </Grid>
        )}
      </QueryPanel>

      <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold uppercase tracking-[.07em] text-ink-3">
          Monthly funnels
        </h3>
        <Pills
          items={FUNNEL_PERIODS}
          value={funnelPeriod}
          onChange={(k) => setFunnelPeriod(k as CrmFunnelPeriod)}
          aria-label="Funnel period"
        />
      </div>

      <QueryPanel query={funnel} skeleton={<Skeleton height={220} />}>
        {(f) => (
          <Grid>
            {FUNNEL_SEGMENTS.map((segment) => {
              const s = f.summary[segment];
              const rows = [
                { label: "Leads", value: s.total_leads },
                { label: "Deals", value: s.total_deals },
                { label: "Won", value: s.total_won },
              ];
              return (
                <div key={segment} className={spans.c6}>
                  <Card>
                    <CardHeader
                      title={segment}
                      subtitle="Leads to deals to won across the selected window."
                    />
                    <div className="px-[18px] pb-4 pt-[13px]">
                      {s.total_leads === 0 && s.total_deals === 0 ? (
                        <p className="py-2 text-[13px] text-ink-2">No activity in this window yet.</p>
                      ) : (
                        <FunnelBars rows={rows} />
                      )}
                    </div>
                    <CardFooter
                      note={`Leads to deals ${s.leads_to_deals_pct}%, deals to won ${s.deals_to_won_pct}%.`}
                    />
                  </Card>
                </div>
              );
            })}
          </Grid>
        )}
      </QueryPanel>
    </>
  );
}

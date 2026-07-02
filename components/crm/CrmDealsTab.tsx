"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { MiniBars } from "@/components/charts/MiniBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  CrmDealRow,
  CrmDealsData,
  CrmJourneyData,
  CrmPipelineData,
  CrmPipelinePeriod,
  CrmPipelineStage,
  CrmSubtypeData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtBHD } from "@/lib/format/bhd";
import { fmtDate } from "@/lib/format/datetime";

/* CRM Deals tab: per-pipeline stage bars, loss reasons and a quality table
   (driven by a pipeline selector and its own period control), the treatment
   journey breakdown (Treatment only), the customer sub-type breakdown (customer
   pipelines only), and the all-deals table. Customer-deal rows show initials;
   provider and corporate deals show the business name. No export. */

const PIPELINE_ITEMS = [
  { key: "Telemedicine", label: "Telemedicine" },
  { key: "Treatment", label: "Treatment" },
  { key: "Corporates", label: "Corporates" },
  { key: "Doctor", label: "Doctor" },
  { key: "Hospital or Clinic", label: "Hospital" },
];

const PERIOD_ITEMS = [
  { key: "all", label: "All time" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
];

const CUSTOMER_PIPELINES = new Set(["Telemedicine", "Treatment"]);

const JOURNEY_LABELS: Record<string, string> = {
  ASSISTED_JOURNEY: "Assisted",
  NAVIGATION_ONLY: "Navigation",
  Untagged: "Untagged",
};

/* Deal outcome to Chip variant. Won reads as good, open as neutral info, lost
   stays muted. No red. */
function outcomeVariant(outcome: CrmDealRow["outcome"]): ChipVariant {
  if (outcome === "won") return "good";
  if (outcome === "open") return "info";
  return "mut";
}

const STAGE_COLUMNS: DataTableColumn<CrmPipelineStage>[] = [
  { key: "name", label: "Stage" },
  { key: "count", label: "Deals", numeric: true, render: (s) => s.count.toLocaleString() },
  { key: "value", label: "Value BHD", numeric: true, render: (s) => fmtBHD(s.value_bhd) },
];

const DEAL_COLUMNS: DataTableColumn<CrmDealRow>[] = [
  { key: "record", label: "Deal" },
  { key: "pipeline", label: "Pipeline" },
  {
    key: "stage",
    label: "Stage",
    render: (r) => <Chip variant={outcomeVariant(r.outcome)}>{r.stage}</Chip>,
  },
  { key: "amount", label: "Amount BHD", numeric: true, render: (r) => fmtBHD(r.amount_bhd) },
  { key: "lead_source", label: "Source" },
  { key: "created", label: "Created", numeric: true, render: (r) => (r.created ? fmtDate(r.created) : "·") },
];

export function CrmDealsTab() {
  const [activePipeline, setActivePipeline] = useState("Telemedicine");
  const [period, setPeriod] = useState<CrmPipelinePeriod>("all");
  const [dealsPage, setDealsPage] = useState(1);
  const [dealsPipeline, setDealsPipeline] = useState("");

  const pipeline = useQuery({
    queryKey: [...qk.crmPipeline(period)],
    queryFn: () => fetchEnvelope<CrmPipelineData>("crm_pipeline", "/crm/pipeline", { period }),
  });
  const journey = useQuery({
    queryKey: [...qk.crmJourney()],
    queryFn: () => fetchEnvelope<CrmJourneyData>("crm_journey", "/crm/journey"),
  });
  const subtype = useQuery({
    queryKey: [...qk.crmSubtype()],
    queryFn: () => fetchEnvelope<CrmSubtypeData>("crm_subtype", "/crm/subtype"),
  });
  const deals = useQuery({
    queryKey: [...qk.crmDeals(dealsPage, dealsPipeline)],
    queryFn: () =>
      fetchEnvelope<CrmDealsData>("crm_deals", "/crm/deals", {
        page: dealsPage,
        page_size: 25,
        pipeline: dealsPipeline || undefined,
      }),
  });

  const dealsData = deals.data?.data;
  const isCustomer = CUSTOMER_PIPELINES.has(activePipeline);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills items={PIPELINE_ITEMS} value={activePipeline} onChange={setActivePipeline} aria-label="Pipeline" />
        <Pills
          items={PERIOD_ITEMS}
          value={period}
          onChange={(k) => setPeriod(k as CrmPipelinePeriod)}
          aria-label="Pipeline period"
        />
      </div>

      <QueryPanel query={pipeline} skeleton={<Skeleton height={320} />}>
        {(p) => {
          const sum = p.pipelines[activePipeline];
          if (!sum) {
            return <p className="py-2 text-[13px] text-ink-2">No data for this pipeline.</p>;
          }
          const maxStage = Math.max(1, ...sum.stages.map((s) => s.count));
          const maxLoss = Math.max(1, ...sum.loss_reasons.map((r) => r.count));
          return (
            <Grid>
              <KpiCard className={spans.c3} label="Deals" value={sum.total.toLocaleString()} note="In this pipeline" />
              <KpiCard
                className={spans.c3}
                label="Won"
                value={sum.won.toLocaleString()}
                suffix={`${sum.win_rate_pct}%`}
                note="Win rate of all deals"
              />
              <KpiCard className={spans.c3} label="Open" value={sum.open.toLocaleString()} note="In flight now" />
              <KpiCard className={spans.c3} label="Value" value={fmtBHD(sum.value_bhd)} note="Total deal value" />

              <div className={spans.c6}>
                <Card>
                  <CardHeader title="Pipeline stages" subtitle="Deals by stage in funnel order." />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    <MiniBars
                      rows={sum.stages.map((s) => ({
                        label: s.name,
                        value: s.count.toLocaleString(),
                        pct: (s.count / maxStage) * 100,
                      }))}
                    />
                  </div>
                  <CardFooter note={`${sum.won} won, ${sum.lost} lost, ${sum.open} open.`} />
                </Card>
              </div>

              <div className={spans.c6}>
                <Card>
                  <CardHeader title="Loss reasons" subtitle="Why deals were lost in this pipeline." />
                  <div className="px-[18px] pb-4 pt-[13px]">
                    {sum.loss_reasons.length === 0 ? (
                      <p className="py-2 text-[13px] text-ink-2">No lost deals in this pipeline.</p>
                    ) : (
                      <MiniBars
                        rows={sum.loss_reasons.map((r) => ({
                          label: r.reason,
                          value: r.count.toLocaleString(),
                          pct: (r.count / maxLoss) * 100,
                        }))}
                      />
                    )}
                  </div>
                  <CardFooter note={`Loss rate ${sum.loss_rate_pct}%.`} />
                </Card>
              </div>

              <div className={spans.c12}>
                <Card>
                  <CardHeader title="Pipeline quality" subtitle="Stage counts and value." />
                  <div className="px-[18px] pb-2 pt-[5px]">
                    <DataTable columns={STAGE_COLUMNS} rows={sum.stages} rowKey={(s) => s.name} />
                  </div>
                </Card>
              </div>
            </Grid>
          );
        }}
      </QueryPanel>

      {activePipeline === "Treatment" ? (
        <div className="mt-4">
          <QueryPanel query={journey} skeleton={<Skeleton height={160} />}>
            {(j) => (
              <Card>
                <CardHeader title="Treatment journey" subtitle="Assisted, navigation, and untagged." />
                <div className="px-[18px] pb-4 pt-[13px]">
                  <Grid>
                    {j.tags.map((tag) => {
                      const b = j.by_tag[tag];
                      return (
                        <KpiCard
                          key={tag}
                          className={spans.c4}
                          label={JOURNEY_LABELS[tag] ?? tag}
                          value={b.won.toLocaleString()}
                          suffix={`${b.win_rate_pct}%`}
                          note={`${b.total} deals, ${fmtBHD(b.value_bhd)}, avg ${b.avg_days_to_completion ?? "·"} days`}
                        />
                      );
                    })}
                  </Grid>
                </div>
                <CardFooter note="Won and win rate by journey tag. Day averages are approximate." />
              </Card>
            )}
          </QueryPanel>
        </div>
      ) : null}

      {isCustomer ? (
        <div className="mt-4">
          <QueryPanel query={subtype} skeleton={<Skeleton height={160} />}>
            {(st) => (
              <Card>
                <CardHeader title="Customer sub-type" subtitle="Direct, sponsored, and untagged across the customer pipelines." />
                <div className="px-[18px] pb-4 pt-[13px]">
                  <Grid>
                    {st.subtypes.map((tag) => {
                      const b = st.by_subtype[tag];
                      return (
                        <KpiCard
                          key={tag}
                          className={spans.c4}
                          label={tag}
                          value={b.won.toLocaleString()}
                          suffix={`${b.win_rate_pct}%`}
                          note={`${b.total} deals, ${fmtBHD(b.value_bhd)}`}
                        />
                      );
                    })}
                  </Grid>
                </div>
                <CardFooter note="Won and win rate by sub-type across Telemedicine and Treatment." />
              </Card>
            )}
          </QueryPanel>
        </div>
      ) : null}

      <div className="mt-4">
        <Card>
          <CardHeader
            title="All deals"
            subtitle="Newest first. Customer deals show initials; provider and corporate deals show the business name."
            right={
              <select
                aria-label="Pipeline filter"
                value={dealsPipeline}
                onChange={(e) => {
                  setDealsPipeline(e.target.value);
                  setDealsPage(1);
                }}
                className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
              >
                <option value="">All pipelines</option>
                {(dealsData?.pipelines ?? []).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            }
          />
          <div className="px-[18px] pb-2 pt-[5px]">
            <QueryPanel
              query={deals}
              skeleton={<Skeleton height={240} />}
              isEmpty={(d) => d.rows.length === 0}
              emptyCopy="No deals match this filter."
            >
              {(d) => <DataTable columns={DEAL_COLUMNS} rows={d.rows} rowKey={(r) => r.id} />}
            </QueryPanel>
          </div>
          {dealsData ? (
            <CardFooter
              note={
                <span className="num">
                  Page {dealsData.page} of {dealsData.pages} · {dealsData.total} deals
                </span>
              }
              right={
                <span className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={dealsData.page <= 1}
                    onClick={() => setDealsPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={dealsData.page >= dealsData.pages}
                    onClick={() => setDealsPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </span>
              }
            />
          ) : null}
        </Card>
      </div>
    </>
  );
}

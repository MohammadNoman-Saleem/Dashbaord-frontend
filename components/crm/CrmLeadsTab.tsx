"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { FunnelBars } from "@/components/charts/FunnelBars";
import { MiniBars } from "@/components/charts/MiniBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type {
  CrmLeadFunnelData,
  CrmLeadFunnelPeriod,
  CrmLeadRow,
  CrmLeadSourcesData,
  CrmLeadsData,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtDate } from "@/lib/format/datetime";

/* CRM Leads tab: the lead conversion funnel with a segment toggle and its own
   period control, the lead sources bars, and the full leads table. Every row is
   initials only, and there is no export, matching the CRM slice privacy rule. */

const PERIOD_ITEMS = [
  { key: "all", label: "All time" },
  { key: "ytd", label: "YTD" },
  { key: "mtd", label: "MTD" },
];

const SEGMENT_ITEMS = [
  { key: "overall", label: "All" },
  { key: "Customers", label: "Customers" },
  { key: "Providers", label: "Providers" },
];

type SegmentPick = "overall" | "Customers" | "Providers";

/* Lead status to Chip variant. Deal Ready reads as good, New and Not Qualified
   stay muted, the in-flight statuses read as neutral information. No red. */
function statusVariant(status: string): ChipVariant {
  if (status === "Deal Ready") return "good";
  if (status === "New" || status === "Not Qualified") return "mut";
  return "info";
}

const LEAD_COLUMNS: DataTableColumn<CrmLeadRow>[] = [
  { key: "record", label: "Lead", render: (r) => `${r.ref} · ${r.initials}` },
  { key: "segment", label: "Segment" },
  { key: "lead_source", label: "Source" },
  {
    key: "lead_status",
    label: "Status",
    render: (r) => <Chip variant={statusVariant(r.lead_status)}>{r.lead_status}</Chip>,
  },
  { key: "created", label: "Created", numeric: true, render: (r) => (r.created ? fmtDate(r.created) : "·") },
];

export function CrmLeadsTab() {
  const [period, setPeriod] = useState<CrmLeadFunnelPeriod>("all");
  const [segment, setSegment] = useState<SegmentPick>("overall");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const funnel = useQuery({
    queryKey: [...qk.crmLeadFunnel(period)],
    queryFn: () => fetchEnvelope<CrmLeadFunnelData>("crm_lead_funnel", "/crm/lead-funnel", { period }),
  });
  const sources = useQuery({
    queryKey: [...qk.crmLeadSources(period, segment)],
    queryFn: () =>
      fetchEnvelope<CrmLeadSourcesData>("crm_lead_sources", "/crm/lead-sources", {
        period,
        segment,
      }),
  });
  const leads = useQuery({
    queryKey: [...qk.crmLeads(page, status)],
    queryFn: () =>
      fetchEnvelope<CrmLeadsData>("crm_leads", "/crm/leads", {
        page,
        page_size: 25,
        status: status || undefined,
      }),
  });

  const leadsData = leads.data?.data;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills
          items={SEGMENT_ITEMS}
          value={segment}
          onChange={(k) => setSegment(k as SegmentPick)}
          aria-label="Lead segment"
        />
        <Pills
          items={PERIOD_ITEMS}
          value={period}
          onChange={(k) => setPeriod(k as CrmLeadFunnelPeriod)}
          aria-label="Lead funnel period"
        />
      </div>

      <Grid>
        <div className={spans.c6}>
          <Card>
            <CardHeader title="Lead conversion funnel" subtitle="How many leads reached each stage." />
            <div className="px-[18px] pb-4 pt-[13px]">
              <QueryPanel query={funnel} skeleton={<Skeleton height={200} />}>
                {(f) => {
                  const s = segment === "overall" ? f.overall : f.by_segment[segment];
                  const rows = [
                    { label: "Leads", value: s.total },
                    { label: "Contacted", value: s.contacted },
                    { label: "Call done", value: s.call_done },
                    { label: "Deal ready", value: s.deal_ready },
                    { label: "Converted", value: s.converted },
                  ];
                  return (
                    <>
                      <FunnelBars rows={rows} />
                      <p className="mt-3 text-[12.5px] text-ink-2">
                        Converted {s.converted_rate}% of leads. Not qualified {s.not_qualified.toLocaleString()} ({s.not_qualified_rate}%).
                      </p>
                    </>
                  );
                }}
              </QueryPanel>
            </div>
            <CardFooter note="Cumulative: each stage counts leads that reached it or beyond. Not qualified is tracked separately." />
          </Card>
        </div>

        <div className={spans.c6}>
          <Card>
            <CardHeader title="Lead sources" subtitle="Where leads come from." />
            <div className="px-[18px] pb-4 pt-[13px]">
              <QueryPanel
                query={sources}
                skeleton={<Skeleton height={200} />}
                isEmpty={(d) => d.sources.length === 0}
                emptyCopy="No lead sources yet."
              >
                {(d) => {
                  const max = Math.max(1, ...d.sources.map((x) => x.count));
                  return (
                    <MiniBars
                      rows={d.sources.map((x) => ({
                        label: x.name,
                        value: x.count.toLocaleString(),
                        pct: (x.count / max) * 100,
                      }))}
                    />
                  );
                }}
              </QueryPanel>
            </div>
            <CardFooter note="Counted over the selected period and segment." />
          </Card>
        </div>
      </Grid>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="All leads"
            subtitle="Newest first. Names stay on the server; rows show the reference and initials."
            right={
              <select
                aria-label="Lead status filter"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-[9px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink"
              >
                <option value="">All statuses</option>
                {(leadsData?.statuses ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            }
          />
          <div className="px-[18px] pb-2 pt-[5px]">
            <QueryPanel
              query={leads}
              skeleton={<Skeleton height={240} />}
              isEmpty={(d) => d.rows.length === 0}
              emptyCopy="No leads match this filter."
            >
              {(d) => <DataTable columns={LEAD_COLUMNS} rows={d.rows} rowKey={(r) => r.id} />}
            </QueryPanel>
          </div>
          {leadsData ? (
            <CardFooter
              note={
                <span className="num">
                  Page {leadsData.page} of {leadsData.pages} · {leadsData.total} leads
                </span>
              }
              right={
                <span className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={leadsData.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={leadsData.page >= leadsData.pages}
                    onClick={() => setPage((p) => p + 1)}
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

"use client";

// Funnels, General tab (spec 02 section 8.3): four tiles, the 14-day visits
// area chart, and the top-pages bars. Site visits and dead clicks come back
// null while their Mixpanel sources are not wired; those tiles render the
// muted not-measured treatment with the authored reason from meta, never a
// zero pretending to be data.
//
// Below the funnel block sits the engagement section from
// /api/growth/engagement: DAU/MAU with a 30-day trend, the top events
// table, and traffic with the device split. It rides its own query so a
// busy Mixpanel never blanks the whole tab.

import type { UseQueryResult } from "@tanstack/react-query";

import { MiniBars } from "@/components/charts/MiniBars";
import { Spark } from "@/components/charts/Spark";
import { FunnelTabSkeleton } from "@/components/funnels/TabSkeleton";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import type { FunnelGeneralData, GrowthEngagementData } from "@/lib/api/contract";
import type { Envelope, Meta } from "@/lib/api/envelope";

function reasonText(meta: Meta, key: string, fallback: string): string {
  return meta.reasons.find((r) => r.key === key)?.text ?? fallback;
}

function reasonTitle(meta: Meta, key: string, fallback: string): string {
  return meta.reasons.find((r) => r.key === key)?.title ?? fallback;
}

/* "+12%" or "-4%" with words for the no-base case, per the honesty rule. */
function trendLabel(pct: number | null, against: string): string {
  if (pct == null) return `No ${against} to compare against`;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs ${against}`;
}

type EventRow = GrowthEngagementData["top_events"][number];

const EVENT_COLUMNS: DataTableColumn<EventRow>[] = [
  { key: "name", label: "Event" },
  { key: "count_7d", label: "7 days", numeric: true, render: (r) => r.count_7d.toLocaleString() },
  { key: "count_30d", label: "30 days", numeric: true, render: (r) => r.count_30d.toLocaleString() },
  {
    key: "trend_pct",
    label: "Week on week",
    numeric: true,
    render: (r) =>
      r.trend_pct == null ? (
        <span className="text-ink-3">No prior week</span>
      ) : (
        `${r.trend_pct > 0 ? "+" : ""}${r.trend_pct}%`
      ),
  },
];

function EngagementSection({ query }: { query: UseQueryResult<Envelope<GrowthEngagementData>> }) {
  return (
    <QueryPanel query={query} skeleton={<FunnelTabSkeleton tiles={3} />}>
      {(data, meta, flags) => {
        const dim = flags.unreliable ? "opacity-55" : undefined;
        const split = data.traffic.device_split;
        const splitTotal = split ? split.mobile + split.desktop + split.other : 0;
        const splitRows = split
          ? [
              { label: "Mobile", value: split.mobile },
              { label: "Desktop", value: split.desktop },
              { label: "Other", value: split.other },
            ]
          : [];
        return (
          <Grid className={`mt-3 ${dim ?? ""}`}>
            <KpiCard
              className={spans.c4}
              label="Daily active users"
              value={data.active_users.dau.toLocaleString()}
              suffix="yesterday"
              spark={data.active_users.trend_30d.map((p) => p.dau)}
              sparkFill
              note={`Unique users of ${data.active_users.event}, last 30 days`}
              dot="good"
            />
            <KpiCard
              className={spans.c4}
              label="Monthly active users"
              value={data.active_users.mau.toLocaleString()}
              suffix="30 days"
              note="Deduplicated across the window"
              dot="good"
            />
            <KpiCard
              className={spans.c4}
              label="Stickiness"
              value={`${data.active_users.stickiness_pct}%`}
              suffix="DAU of MAU"
              note="How much of the month's audience shows up daily"
              dot="good"
            />

            <div className={spans.c7} data-focus-id="growth-top-events">
              <Card>
                <CardHeader title="Top events" subtitle="The ten busiest events, by the last 7 days." />
                <div className="px-[18px] pb-4 pt-[5px]">
                  {data.top_events.length === 0 ? (
                    <p className="py-2 text-[13px] text-ink-2">
                      Events land here once Mixpanel serves them.
                    </p>
                  ) : (
                    <DataTable columns={EVENT_COLUMNS} rows={data.top_events} rowKey={(r) => r.name} />
                  )}
                </div>
                <CardFooter note="Counts are event totals, not unique people." />
              </Card>
            </div>

            <div className={spans.c5} data-focus-id="growth-traffic">
              <Card>
                <CardHeader title="Traffic" subtitle={`Unique visitors, last ${data.traffic.window_days} days.`} />
                <div className="flex flex-col gap-[13px] px-[18px] pb-4 pt-[13px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] text-ink-2">Homepage</span>
                    <span className="num text-[17px] font-bold text-title">
                      {data.traffic.homepage_views.toLocaleString()}
                    </span>
                  </div>
                  <p className="-mt-2 text-xs text-ink-3">
                    {trendLabel(data.traffic.trend_homepage_pct, "the prior 30 days")}
                  </p>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] text-ink-2">Consult page</span>
                    <span className="num text-[17px] font-bold text-title">
                      {data.traffic.consult_views.toLocaleString()}
                    </span>
                  </div>
                  <p className="-mt-2 text-xs text-ink-3">
                    {trendLabel(data.traffic.trend_consult_pct, "the prior 30 days")}
                  </p>
                  {split == null ? (
                    <p className="text-[13px] text-ink-2">
                      {meta.reasons.find((r) => r.key === "device_split_unavailable")?.text ??
                        "The device split is not measured yet."}
                    </p>
                  ) : (
                    <>
                      <MiniBars
                        rows={splitRows.map((r) => ({
                          label: r.label,
                          value: r.value.toLocaleString(),
                          pct: splitTotal > 0 ? (r.value / splitTotal) * 100 : 0,
                        }))}
                      />
                      <p className="sr-only">
                        {splitRows.map((r) => `${r.label}: ${r.value.toLocaleString()}`).join(". ")}
                      </p>
                    </>
                  )}
                </div>
                <CardFooter note="Homepage visitors, split by operating system." />
              </Card>
            </div>
          </Grid>
        );
      }}
    </QueryPanel>
  );
}

export function GeneralTab({
  query,
  engagement,
}: {
  query: UseQueryResult<Envelope<FunnelGeneralData>>;
  engagement: UseQueryResult<Envelope<GrowthEngagementData>>;
}) {
  return (
    <>
      <QueryPanel query={query} skeleton={<FunnelTabSkeleton tiles={4} />}>
        {(data, meta, flags) => {
        const dim = flags.unreliable ? "opacity-55" : undefined;
        const maxPage = Math.max(...data.top_pages.map((p) => p.views), 1);
        return (
          <Grid className={dim}>
            {data.tiles.site_visits === null ? (
              <KpiCard
                className={spans.c3}
                label="Site visits, 14 days"
                value={<PendingValue>Not measured yet</PendingValue>}
                note={reasonTitle(meta, "sessions_not_configured", "Sessions are not measured yet.")}
                dot="mut"
              />
            ) : (
              <KpiCard
                className={spans.c3}
                label="Site visits, 14 days"
                value={data.tiles.site_visits.toLocaleString()}
                note="All sources, last 14 days"
                dot="good"
              />
            )}
            <KpiCard
              className={spans.c3}
              label="Consult page views"
              value={data.tiles.consult_page_views.toLocaleString()}
              note="Main paid landing"
              dot="good"
            />
            <KpiCard
              className={spans.c3}
              label="Booking starts"
              value={data.tiles.booking_starts.toLocaleString()}
              note="Across all products"
              dot="good"
            />
            {data.tiles.dead_clicks === null ? (
              <KpiCard
                className={spans.c3}
                label="Dead clicks"
                value={<PendingValue>Not measured yet</PendingValue>}
                note={reasonTitle(meta, "dead_clicks_not_instrumented", "Not instrumented yet.")}
                dot="mut"
              />
            ) : (
              <KpiCard
                className={spans.c3}
                label="Dead clicks"
                value={data.tiles.dead_clicks.toLocaleString()}
                note="See the UI/UX tab"
                dot="warn"
              />
            )}

            <div className={spans.c7} data-focus-id="funnels-visits">
              <Card>
                <CardHeader title="Visits, last 14 days" subtitle="Daily site visits, all sources." />
                <div className="px-[18px] pb-4 pt-[13px]">
                  {data.visits_14d.length === 0 ? (
                    <p className="py-2 text-[13px] text-ink-2">
                      {reasonText(
                        meta,
                        "sessions_not_configured",
                        "Daily visits land here once sessions are measured.",
                      )}
                    </p>
                  ) : (
                    <>
                      <Spark values={data.visits_14d} fill />
                      <p className="sr-only">
                        Daily visits: {data.visits_14d.map((v) => v.toLocaleString()).join(", ")}
                      </p>
                    </>
                  )}
                </div>
              </Card>
            </div>

            <div className={spans.c5} data-focus-id="funnels-top-pages">
              <Card>
                <CardHeader title="Where people spend time" subtitle="Top pages this fortnight." />
                <div className="px-[18px] pb-4 pt-[13px]">
                  {data.top_pages.length === 0 ? (
                    <p className="py-2 text-[13px] text-ink-2">
                      Page views land here once Mixpanel serves them.
                    </p>
                  ) : (
                    <>
                      <MiniBars
                        rows={data.top_pages.map((p) => ({
                          label: p.label,
                          value: p.views.toLocaleString(),
                          pct: (p.views / maxPage) * 100,
                        }))}
                      />
                      <p className="sr-only">
                        {data.top_pages.map((p) => `${p.label}: ${p.views.toLocaleString()} views`).join(". ")}
                      </p>
                    </>
                  )}
                </div>
                <CardFooter note="Views are page loads, not people." />
              </Card>
            </div>
          </Grid>
        );
      }}
      </QueryPanel>
      <EngagementSection query={engagement} />
    </>
  );
}

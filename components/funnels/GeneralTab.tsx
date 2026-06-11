"use client";

// Funnels, General tab (spec 02 section 8.3): four tiles, the 14-day visits
// area chart, and the top-pages bars. Site visits and dead clicks come back
// null while their Mixpanel sources are not wired; those tiles render the
// muted not-measured treatment with the authored reason from meta, never a
// zero pretending to be data.

import type { UseQueryResult } from "@tanstack/react-query";

import { MiniBars } from "@/components/charts/MiniBars";
import { Spark } from "@/components/charts/Spark";
import { FunnelTabSkeleton } from "@/components/funnels/TabSkeleton";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import type { FunnelGeneralData } from "@/lib/api/contract";
import type { Envelope, Meta } from "@/lib/api/envelope";

function reasonText(meta: Meta, key: string, fallback: string): string {
  return meta.reasons.find((r) => r.key === key)?.text ?? fallback;
}

function reasonTitle(meta: Meta, key: string, fallback: string): string {
  return meta.reasons.find((r) => r.key === key)?.title ?? fallback;
}

export function GeneralTab({ query }: { query: UseQueryResult<Envelope<FunnelGeneralData>> }) {
  return (
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
  );
}

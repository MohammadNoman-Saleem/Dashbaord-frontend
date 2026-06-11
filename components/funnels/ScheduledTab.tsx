"use client";

// Funnels, Scheduled tab (spec 02 section 8.3): the named-doctor booking
// funnel plus confirmed appointments by specialty. The specialty breakdown
// is empty until the property is instrumented; the empty state carries the
// authored reason from meta instead of inventing zeros.

import type { UseQueryResult } from "@tanstack/react-query";

import { FunnelBars } from "@/components/charts/FunnelBars";
import { MiniBars } from "@/components/charts/MiniBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FunnelScheduledData } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";

const FUNNEL_SKELETON = (
  <div className="flex flex-col gap-[9px] py-1">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} height={22} />
    ))}
  </div>
);

const BARS_SKELETON = (
  <div className="flex flex-col gap-[10px] py-1">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} height={12} />
    ))}
  </div>
);

export function ScheduledTab({ query }: { query: UseQueryResult<Envelope<FunnelScheduledData>> }) {
  const data = query.data?.data;
  const meta = query.data?.meta;
  const endToEnd = data?.steps.length ? data.steps[data.steps.length - 1].pct_of_first : null;
  const specialtyReason =
    meta?.reasons.find((r) => r.key === "specialty_not_instrumented")?.text ??
    "The specialty breakdown lands here once the property is instrumented.";

  return (
    <Grid>
      <div className={spans.c8} data-focus-id="funnels-scheduled">
        <Card>
          <CardHeader
            title="Scheduled appointment funnel"
            subtitle="Choosing a named doctor and booking a slot."
          />
          <div className="px-[18px] pb-4 pt-[13px]">
            <QueryPanel
              query={query}
              skeleton={FUNNEL_SKELETON}
              isEmpty={(d) => d.steps.length === 0}
              emptyCopy="No scheduled funnel data for this month yet."
            >
              {(d, _meta, flags) => (
                <div className={flags.unreliable ? "opacity-55" : undefined}>
                  <FunnelBars rows={d.steps.map((s) => ({ label: s.label, value: s.count }))} />
                  <p className="sr-only">
                    {d.steps
                      .map((s) => `${s.label}: ${s.count.toLocaleString()} (${s.pct_of_first}% of the first step)`)
                      .join(". ")}
                  </p>
                </div>
              )}
            </QueryPanel>
          </div>
          <CardFooter
            note="Steps come from the saved Mixpanel funnel, ordering enforced."
            right={endToEnd != null ? <span className="num">{endToEnd}% end to end</span> : null}
          />
        </Card>
      </div>

      <div className={spans.c4} data-focus-id="funnels-specialty">
        <Card>
          <CardHeader title="By specialty, confirmed" />
          <div className="px-[18px] pb-4 pt-[13px]">
            <QueryPanel
              query={query}
              skeleton={BARS_SKELETON}
              isEmpty={(d) => d.confirmed_by_specialty.length === 0}
              emptyCopy={specialtyReason}
            >
              {(d) => {
                const max = Math.max(...d.confirmed_by_specialty.map((s) => s.count), 1);
                return (
                  <>
                    <MiniBars
                      rows={d.confirmed_by_specialty.map((s) => ({
                        label: s.label,
                        value: s.count,
                        pct: (s.count / max) * 100,
                      }))}
                    />
                    <p className="sr-only">
                      {d.confirmed_by_specialty.map((s) => `${s.label}: ${s.count} confirmed`).join(". ")}
                    </p>
                  </>
                );
              }}
            </QueryPanel>
          </div>
        </Card>
      </div>
    </Grid>
  );
}

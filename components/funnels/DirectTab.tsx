"use client";

// Funnels, Direct Appointment tab (spec 02 section 8.3): Full Booking and
// Instant pills swap the dataset (the selection lives in the URL as
// ?variant=), FunnelBars with step percentages, the end-to-end conversion in
// the footer, and a side card with the three plain readings. While the paid
// step is not yet checked against the admin panel (paid_verified false) the
// footer says so honestly instead of wearing a Verified chip.

import type { UseQueryResult } from "@tanstack/react-query";
import { Check, Filter, User } from "lucide-react";

import { FunnelBars } from "@/components/charts/FunnelBars";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FunnelDirectData } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";

const VARIANT_PILLS = [
  { key: "full", label: "Full Booking" },
  { key: "instant", label: "Instant" },
];

type DirectTabProps = {
  query: UseQueryResult<Envelope<FunnelDirectData>>;
  variant: "full" | "instant";
  onVariantChange: (variant: string) => void;
};

export function DirectTab({ query, variant, onVariantChange }: DirectTabProps) {
  return (
    <Grid>
      <div className={spans.c8} data-focus-id="funnels-direct">
        <Card>
          <CardHeader
            title="Direct appointment funnel"
            subtitle="From the consult page to a completed payment."
            right={
              <Pills
                items={VARIANT_PILLS}
                value={variant}
                onChange={onVariantChange}
                aria-label="Funnel variant"
              />
            }
          />
          <div className="px-[18px] pb-4 pt-[13px]">
            <QueryPanel
              query={query}
              skeleton={
                <div className="flex flex-col gap-[9px] py-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} height={22} />
                  ))}
                </div>
              }
              isEmpty={(d) => d.steps.length === 0}
              emptyCopy="No funnel data for this period yet."
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
            note={
              query.data?.data?.paid_verified ? (
                <span className="inline-flex flex-wrap items-center gap-[6px]">
                  <Chip variant="good">Verified</Chip>
                  The paid step is checked against the admin panel, not just measured.
                </span>
              ) : (
                "The paid step check against the admin panel is coming."
              )
            }
            right={
              query.data?.data ? (
                <span className="num">{query.data.data.end_to_end_pct}% end to end</span>
              ) : null
            }
          />
        </Card>
      </div>

      <div className={spans.c4} data-focus-id="funnels-direct-readings">
        <Card>
          <CardHeader title="What to read here" />
          <div className="px-[18px] pb-4 pt-2">
            <QueryPanel
              query={query}
              skeleton={
                <div className="flex flex-col gap-2 py-1">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} height={38} />
                  ))}
                </div>
              }
            >
              {(d) => (
                <div>
                  <ListRow icon={Filter} title="The biggest drop" subtitle={d.readings.biggest_drop} />
                  <ListRow
                    icon={Check}
                    variant="good"
                    title="The healthy step"
                    subtitle={d.readings.healthy_step}
                  />
                  <ListRow icon={User} title="Owner" subtitle={d.readings.owner} />
                </div>
              )}
            </QueryPanel>
          </div>
        </Card>
      </div>
    </Grid>
  );
}

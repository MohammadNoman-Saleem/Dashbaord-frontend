"use client";

import { useQuery } from "@tanstack/react-query";

import { Grid, spans } from "@/components/shell/Grid";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { KpiStripCard } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* The four-card KPI strip under the greeting (02 section 8.1). The backend
   resolves which metrics a person sees via GET /api/kpi/strip?person=, so
   this row just renders what it is served. Each card is c3 in the mockup
   (.card.kpi.c3), so the strip goes two-up at 1180px and stacks at 880px. */

/* bar_state 'default' maps to the Bar's accent fill. */
function barFill(state: KpiStripCard["bar_state"]): "accent" | "good" | "warn" {
  if (state === "good" || state === "warn") return state;
  return "accent";
}

function StripSkeleton() {
  return (
    <Grid>
      {[0, 1, 2, 3].map((i) => (
        <Card
          key={i}
          className={`${spans.c3} flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px]`}
        >
          <Skeleton width={110} height={10} />
          <Skeleton width={130} height={26} />
          <Skeleton className="mt-auto" width="70%" height={11} />
        </Card>
      ))}
    </Grid>
  );
}

export function KpiStripRow({ person }: { person: string }) {
  const query = useQuery({
    queryKey: qk.kpiStrip(person),
    queryFn: () => fetchEnvelope<KpiStripCard[]>("kpi_strip", "/kpi/strip", { person }),
  });

  return (
    <QueryPanel
      query={query}
      skeleton={<StripSkeleton />}
      isEmpty={(cards) => cards.length === 0}
      emptyCopy="No numbers to show for this view yet."
    >
      {(cards) => (
        <Grid>
          {cards.map((card) => (
            <KpiCard
              key={card.metric_key}
              className={spans.c3}
              label={card.label}
              value={card.value_display}
              suffix={card.small}
              spark={card.spark}
              bar={card.bar_pct != null ? { value: card.bar_pct, fill: barFill(card.bar_state) } : undefined}
              note={card.note}
              dot={card.dot}
            />
          ))}
        </Grid>
      )}
    </QueryPanel>
  );
}

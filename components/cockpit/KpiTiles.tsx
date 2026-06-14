"use client";

import { KpiCard } from "@/components/ui/KpiCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { spans } from "@/components/shell/Grid";
import type { CockpitQueueData } from "@/lib/api/contract";

/* The four cockpit KPI tiles: Due now, Due today, Waiting on partners, Parked.
   Counts and notes come straight from the queue payload's tiles block. The
   note dot stays calm: due_now carries the only warn dot, everything else is
   good, mirroring the mockup where attention is carried by the words. */

type KpiTilesProps = {
  tiles: CockpitQueueData["tiles"] | null;
};

export function CockpitKpiTiles({ tiles }: KpiTilesProps) {
  if (!tiles) {
    return (
      <>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={spans.c3}>
            <div className="rounded-card border border-line-soft bg-surface p-[17px] shadow-card">
              <Skeleton height={12} width="55%" />
              <div className="mt-3">
                <Skeleton height={28} width="35%" />
              </div>
              <div className="mt-4">
                <Skeleton height={12} width="80%" />
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <div className={spans.c3}>
        <KpiCard label="Due now" value={tiles.due_now.count} note={tiles.due_now.note} dot="warn" />
      </div>
      <div className={spans.c3}>
        <KpiCard label="Due today" value={tiles.due_today.count} note={tiles.due_today.note} dot="good" />
      </div>
      <div className={spans.c3}>
        <KpiCard
          label="Waiting on partners"
          value={tiles.waiting_partners.count}
          note={tiles.waiting_partners.note}
          dot="good"
        />
      </div>
      <div className={spans.c3}>
        <KpiCard label="Parked" value={tiles.parked.count} note={tiles.parked.note} dot="good" />
      </div>
    </>
  );
}

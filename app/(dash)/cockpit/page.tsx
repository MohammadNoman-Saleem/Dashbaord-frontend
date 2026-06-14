"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { CockpitAiCard } from "@/components/cockpit/AiCard";
import { CockpitCaseFile } from "@/components/cockpit/CaseFile";
import { CockpitKpiTiles } from "@/components/cockpit/KpiTiles";
import { CockpitParked } from "@/components/cockpit/Parked";
import { CockpitQueue } from "@/components/cockpit/Queue";
import { CockpitSlaPolicy } from "@/components/cockpit/SlaPolicy";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CockpitQueueData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";

/* The V4 Cockpit (cockpit-sla-spec.md, mockup lines 719-835). The case
   manager's working surface: every active lead with its next step and the
   clock that governs it. The page fetches the queue once to drive the four KPI
   tiles, the queue list, and the default selection (the first row, which is
   the most-due lead). Selecting a queue row lifts its id, and the case file
   card fetches that lead's detail. The parked table, the AI proposal panel and
   the SLA policy reference sit below.

   Read-only in v1: the next-action Send, Edit and Snooze controls render but
   are disabled, matching the mockup's own "Proposed" labeling. */

export default function CockpitPage() {
  useFocusFlash();
  return <CockpitInner />;
}

function CockpitInner() {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.cockpitQueue(viewAs ?? "self"),
    queryFn: () =>
      fetchEnvelope<CockpitQueueData>("cockpit_queue", "/cockpit/queue", {
        person: viewAs,
        viewer: viewAs,
      }),
  });

  const data = query.data?.data ?? null;
  const activeId = selectedId ?? (data && data.active.length > 0 ? data.active[0].lead_ref.zoho_id : null);

  return (
    <Grid>
      <CockpitKpiTiles tiles={data?.tiles ?? null} />

      <div className={spans.c5} data-focus-id="cockpit-queue">
        <QueryPanel
          query={query}
          skeleton={
            <Card>
              <CardHeader title="The queue" subtitle="Sorted by one thing: what is due now." />
              <div className="flex flex-col gap-2 px-[18px] py-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} height={56} />
                ))}
              </div>
            </Card>
          }
        >
          {(d) => <CockpitQueue data={d} selectedId={activeId} onSelect={setSelectedId} />}
        </QueryPanel>
      </div>

      <div className={spans.c7} data-focus-id="cockpit-case">
        <CockpitCaseFile leadId={activeId} />
      </div>

      <div className={spans.c7} data-focus-id="cockpit-parked">
        <CockpitParked />
      </div>

      <div className={spans.c5} data-focus-id="cockpit-ai">
        <CockpitAiCard />
      </div>

      <div className={spans.c12} data-focus-id="cockpit-sla">
        <CockpitSlaPolicy />
      </div>
    </Grid>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { CockpitAiCard } from "@/components/cockpit/AiCard";
import { CockpitCaseFile } from "@/components/cockpit/CaseFile";
import { CockpitKpiTiles } from "@/components/cockpit/KpiTiles";
import { CockpitParked } from "@/components/cockpit/Parked";
import { PatientSearch } from "@/components/cockpit/PatientSearch";
import { CockpitQueue } from "@/components/cockpit/Queue";
import { CockpitSlaPolicy } from "@/components/cockpit/SlaPolicy";
import { CockpitToday } from "@/components/cockpit/Today";
import { Grid } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import type { CockpitQueueData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { flashFocus, useFocusFlash } from "@/lib/deepLink";
import { useViewer } from "@/lib/viewer";

/* The Cockpit. The primary surface is ONE thing: the Today list (what needs her
   now, one row per case, tap to act). Everything else - the full SLA queue, the
   case file, the parked pool, and reference (KPIs, SLA policy, AI) - lives behind
   tabs so the landing stays a single, dead-simple to-do list. Selecting a Today
   row opens that case in the Case file tab. */

type DetailTab = "case" | "queue" | "parked" | "reference";

export default function CockpitPage() {
  useFocusFlash();
  return <CockpitInner />;
}

function CockpitInner() {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;
  const caseParam = searchParams.get("case");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("case");

  const { me } = useViewer();
  const seesNames = me ? Boolean(me.capabilities.sees_patient_names) : false;

  // The queue drives the full-queue tab, the KPI tiles, and the default case
  // selection (the most-due lead) when nothing has been picked yet.
  const query = useQuery({
    queryKey: qk.cockpitQueue(viewAs ?? "self"),
    queryFn: () =>
      fetchEnvelope<CockpitQueueData>("cockpit_queue", "/cockpit/queue", {
        person: viewAs,
        viewer: viewAs,
      }),
  });
  const data = query.data?.data ?? null;
  const activeId =
    selectedId ??
    caseParam ??
    (data && data.active.length > 0 ? data.active[0].lead_ref.zoho_id : null);

  function openCase(id: string) {
    setSelectedId(id);
    setTab("case");
    // Scroll the case card into view and flash it, so it is unmistakable that
    // selecting a lead opened it. Retries until the tab's card mounts.
    flashFocus("cockpit-case");
  }

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <div className="flex items-start gap-5 max-xl:flex-col">
        {/* Left pane: search + the Today list. The primary surface. */}
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3.5 xl:mx-0 xl:w-[420px] xl:max-w-none xl:shrink-0">
          {seesNames ? (
            <div data-focus-id="cockpit-patient-search">
              <PatientSearch onSelect={openCase} />
            </div>
          ) : null}
          <div data-focus-id="cockpit-today">
            <CockpitToday person={viewAs} selectedId={selectedId} onSelect={openCase} />
          </div>
        </div>

        {/* Right pane: tabbed detail, sticky and self-scrolling on wide screens. */}
        <div className="mx-auto w-full min-w-0 max-w-[680px] xl:sticky xl:top-[100px] xl:mx-0 xl:max-h-[calc(100vh-116px)] xl:max-w-none xl:flex-1 xl:overflow-y-auto">
          <Tabs
            aria-label="Cockpit detail"
            value={tab}
            onChange={(k) => setTab(k as DetailTab)}
            items={[
              { key: "case", label: "Case file" },
              { key: "queue", label: "Full queue" },
              { key: "parked", label: "Parked" },
              { key: "reference", label: "Reference" },
            ]}
          />

          <div className="mt-3">
            {tab === "case" ? (
              <div data-focus-id="cockpit-case" className="scroll-mt-[110px]">
                <CockpitCaseFile leadId={activeId} onOpenCase={openCase} />
              </div>
            ) : null}

            {tab === "queue" ? (
              <div data-focus-id="cockpit-queue">
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
                  {(d) => <CockpitQueue data={d} selectedId={activeId} onSelect={openCase} />}
                </QueryPanel>
              </div>
            ) : null}

            {tab === "parked" ? (
              <div data-focus-id="cockpit-parked">
                <CockpitParked />
              </div>
            ) : null}

            {tab === "reference" ? (
              <div className="flex flex-col gap-3.5" data-focus-id="cockpit-sla">
                <Grid>
                  <CockpitKpiTiles tiles={data?.tiles ?? null} />
                </Grid>
                <CockpitSlaPolicy />
                <CockpitAiCard />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

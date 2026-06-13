"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";

import { ObjectivesCard } from "@/components/kpis/ObjectivesCard";
import { TargetsCard } from "@/components/kpis/TargetsCard";
import { Grid, spans } from "@/components/shell/Grid";
import type { DeliverableRow, KpiTargetRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { TITLES } from "@/config/titles";

/* KPIs and Deliverables (spec 02 section 8.6): the month's targets table
   with scoped add, edit, delete, and a drill into the records behind each
   auto metric (controls render only where the server says can_edit /
   drillable), then the month's objectives with scoped inline status edits
   and plain progress sentences. */

const MONTH = new Date().toISOString().slice(0, 7);

function KpisContent() {
  useFocusFlash();
  const title = TITLES.kpis;

  const targetsQuery = useQuery({
    queryKey: qk.kpiTargets(MONTH),
    queryFn: () =>
      fetchEnvelope<KpiTargetRow[]>("kpi_targets", "/kpi/targets", { month: MONTH }),
  });
  const deliverablesQuery = useQuery({
    queryKey: qk.deliverables(MONTH),
    queryFn: () =>
      fetchEnvelope<DeliverableRow[]>("deliverables", "/deliverables", { month: MONTH }),
  });

  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>
      <Grid>
        <div className={spans.c12}>
          <TargetsCard query={targetsQuery} month={MONTH} />
        </div>

        <div className={spans.c12} data-focus-id="objectives">
          <ObjectivesCard query={deliverablesQuery} month={MONTH} />
        </div>
      </Grid>
    </>
  );
}

export default function KpisPage() {
  return (
    <Suspense fallback={null}>
      <KpisContent />
    </Suspense>
  );
}

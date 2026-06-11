"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, Target } from "lucide-react";

import { TargetsCard } from "@/components/kpis/TargetsCard";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { ListRow, type ListRowVariant } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DeliverableRow, KpiTargetRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { PEOPLE } from "@/config/people";
import { TITLES } from "@/config/titles";

/* KPIs and Deliverables (spec 02 section 8.6): the month's targets table
   with scoped edit and delete (controls render only where the server says
   can_edit), then the month's objectives with status chips and plain
   progress sentences. */

const MONTH = new Date().toISOString().slice(0, 7);

const STATUS_CHIP: Record<DeliverableRow["status"], { variant: ChipVariant; label: string }> = {
  done: { variant: "good", label: "Done" },
  on_track: { variant: "good", label: "On track" },
  in_progress: { variant: "info", label: "In progress" },
  in_review: { variant: "warn", label: "In review" },
  needs_start: { variant: "mut", label: "Needs a start" },
};

function rowIcon(status: DeliverableRow["status"]) {
  if (status === "done") return Check;
  if (status === "needs_start") return CircleAlert;
  return Target;
}

function rowVariant(status: DeliverableRow["status"]): ListRowVariant {
  if (status === "done") return "good";
  if (status === "in_review" || status === "needs_start") return "warn";
  return "info";
}

/* "khalid" reads as "Khalid"; known people use their configured names. */
function ownerName(key: string): string {
  const known = (PEOPLE as Record<string, { name: string }>)[key];
  if (known) return known.name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "long" });
}

const OBJECTIVES_SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} height={38} />
    ))}
  </div>
);

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
          <Card>
            <CardHeader
              title={`${monthLabel(MONTH)} objectives`}
              subtitle="Ship-by-end-of-month commitments, one owner each."
            />
            <div className="px-[18px] pb-4 pt-2">
              <QueryPanel
                query={deliverablesQuery}
                skeleton={OBJECTIVES_SKELETON}
                isEmpty={(rows) => rows.length === 0}
                emptyCopy={`No objectives logged for ${monthLabel(MONTH)} yet.`}
              >
                {(rows) => (
                  <div>
                    {rows.map((row) => {
                      const chip = STATUS_CHIP[row.status];
                      return (
                        <ListRow
                          key={row.id}
                          icon={rowIcon(row.status)}
                          variant={rowVariant(row.status)}
                          title={row.title}
                          subtitle={`${row.owner_keys.map(ownerName).join(" + ")} · ${row.progress_note}`}
                          right={<Chip variant={chip.variant}>{chip.label}</Chip>}
                        />
                      );
                    })}
                  </div>
                )}
              </QueryPanel>
            </div>
          </Card>
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

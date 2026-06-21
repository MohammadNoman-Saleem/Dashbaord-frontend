"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { MiniBars, type MiniBarRow } from "@/components/charts/MiniBars";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TeamSummaryData, TeamSummaryRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";

/* Home panel p-team-kpis (spec 02 section 8.1). One MiniBars row per person:
   current value against the month's goal, optimism fill when behind,
   recovery fill when ahead. */

/* Current month as YYYY-MM, resolved in Bahrain time (Asia/Bahrain, no DST)
   so the panel tracks the real month instead of a frozen literal. en-CA
   formats as YYYY-MM-DD, so the first seven characters are the month. */
const MONTH = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bahrain" }).slice(0, 7);
const MONTH_LABEL = new Date(`${MONTH}-01T00:00:00`).toLocaleDateString("en-US", {
  month: "long",
});

const STATE_WORDS: Record<TeamSummaryRow["state"], string> = {
  ahead: "ahead",
  behind: "behind",
  on_track: "on track",
};

function toMiniBarRow(row: TeamSummaryRow): MiniBarRow {
  return {
    label: row.name,
    value: row.summary_display,
    pct: row.pct,
    status: row.state === "behind" ? "behind" : row.state === "ahead" ? "ahead" : undefined,
  };
}

function TeamKpisSkeleton() {
  return (
    <div className="flex flex-col gap-[11px]">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={12} />
      ))}
    </div>
  );
}

export function TeamKpisPanel(_props: { person: string }) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.kpiTeamSummary(MONTH),
    queryFn: () =>
      fetchEnvelope<TeamSummaryData>("kpi_team_summary", "/kpi/team-summary", { month: MONTH }),
  });

  return (
    <Card>
      <CardHeader
        title={`Team targets, ${MONTH_LABEL}`}
        subtitle="Current value against the month's goal."
      />
      <div className="px-[18px] pt-[13px] pb-4">
        <QueryPanel
          query={query}
          skeleton={<TeamKpisSkeleton />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy={`No team targets are set for ${MONTH_LABEL} yet.`}
        >
          {(d, _meta, flags) => (
            <div className={flags.unreliable ? "opacity-55" : undefined}>
              <MiniBars rows={d.rows.map(toMiniBarRow)} />
              {/* MiniBars is decorative; this is the text equivalent. */}
              <p className="sr-only">
                {d.rows
                  .map((row) => `${row.name}: ${row.summary_display}, ${STATE_WORDS[row.state]}`)
                  .join(". ")}
              </p>
            </div>
          )}
        </QueryPanel>
      </div>
      {query.data?.data ? (
        <CardFooter
          note="Saturday updates feed these."
          right={<Link href={buildDeepLink({ view: "kpis" }, viewAs)}>All KPIs</Link>}
        />
      ) : null}
    </Card>
  );
}

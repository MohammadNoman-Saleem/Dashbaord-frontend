"use client";

import { useQuery } from "@tanstack/react-query";

import { spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CasesSummaryData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* The four KPI cards at the top of the Cases view (spec 02 section 8.2).
   Rendered as a fragment of grid children so each card takes its own c3
   cell, which is why this row manages its states inline instead of through
   QueryPanel (panel bodies live inside one cell; these cards do not). */

export function CasesKpiRow() {
  const query = useQuery({
    queryKey: qk.casesSummary(),
    queryFn: () => fetchEnvelope<CasesSummaryData>("cases_summary", "/cases/summary"),
  });

  if (query.isPending) {
    return (
      <>
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className={`flex min-h-[122px] flex-col gap-2 px-[17px] py-[15px] ${spans.c3}`}>
            <Skeleton height={11} width="55%" />
            <Skeleton height={28} width="38%" />
            <Skeleton height={12} width="72%" className="mt-auto" />
          </Card>
        ))}
      </>
    );
  }

  const cards = query.data?.data?.cards;
  if (!cards) {
    return (
      <Card className={`px-[18px] py-4 ${spans.c12}`}>
        <div className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
          <span>
            These numbers couldn&apos;t load. The rest of the page is fine. Retry, or tell Al
            Saeed if it keeps happening.
          </span>
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      {cards.map((card) => (
        <KpiCard
          key={card.metric_key}
          className={spans.c3}
          label={card.label}
          value={card.value_display}
          suffix={card.small}
          bar={card.bar_pct != null ? { value: card.bar_pct } : undefined}
          spark={card.spark}
          note={card.note}
          dot={card.dot}
        />
      ))}
    </>
  );
}

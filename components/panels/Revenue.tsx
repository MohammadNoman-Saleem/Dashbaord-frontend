"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Spark } from "@/components/charts/Spark";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialsData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { buildDeepLink } from "@/lib/deepLink";
import { fmtBHD } from "@/lib/format/bhd";

/* Home panel p-revenue (spec 02 section 8.1). Platform revenue for the
   running month: BHD value with the month-over-month change, spark, the
   split sentence, and a Verified chip when the figure is checked against
   the admin panel. Partnership invoices live in /financials, never summed
   into this card. */

function RevenueSkeleton() {
  return (
    <div className="flex flex-col gap-[9px]">
      <Skeleton height={27} width="52%" />
      <Skeleton height={44} />
      <Skeleton height={12} width="74%" />
    </div>
  );
}

export function RevenuePanel(_props: { person: string }) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.financials(),
    queryFn: () => fetchEnvelope<FinancialsData>("financials", "/financials"),
  });

  const envelope = query.data;
  const verified =
    envelope?.data?.platform_revenue.verified === true && envelope.meta.reliable;

  /* The endpoint always reports the running month, so the header month and
     the comparison month come from the clock. The live DTO can replace this
     with explicit month fields when it lands. */
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-US", { month: "long" });
  const prevLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long" },
  );

  return (
    <Card>
      <CardHeader
        title={`Revenue, ${monthLabel} so far`}
        subtitle="Verified against the admin panel, our source of truth."
        right={verified ? <Chip variant="good">Verified</Chip> : undefined}
      />
      <div className="px-[18px] pt-[13px] pb-4">
        <QueryPanel query={query} skeleton={<RevenueSkeleton />}>
          {(d, _meta, flags) => {
            const rev = d.platform_revenue;
            const delta =
              rev.vs_prev_pct >= 0
                ? `+${rev.vs_prev_pct}% vs ${prevLabel}`
                : `down ${Math.abs(rev.vs_prev_pct)}% vs ${prevLabel}`;
            return (
              <div className={flags.unreliable ? "opacity-55" : undefined}>
                <div className="num flex items-baseline gap-[7px] text-[27px] font-bold leading-[1.05] tracking-[-.01em] text-title">
                  <span>{fmtBHD(rev.month_bhd)}</span>
                  <span className="text-[12.5px] font-medium tracking-normal text-ink-3">
                    {delta}
                  </span>
                </div>
                <Spark values={rev.spark} className="mt-1.5" />
                <p className="mt-2 text-xs text-ink-2">{rev.split_plain}</p>
              </div>
            );
          }}
        </QueryPanel>
      </div>
      {envelope?.data ? (
        <CardFooter
          note="Partnership invoices tracked separately."
          right={<Link href={buildDeepLink({ view: "financials" }, viewAs)}>Open financials</Link>}
        />
      ) : null}
    </Card>
  );
}

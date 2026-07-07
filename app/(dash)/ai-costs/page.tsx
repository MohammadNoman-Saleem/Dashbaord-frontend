"use client";

import { useQuery } from "@tanstack/react-query";

import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AiCostsData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer } from "@/lib/viewer";

/* AI costs: the exact, real-time USD spent on Amazon Nova, self-metered from
   every model call's returned token counts (not AWS Cost Explorer, which lags a
   day). Leadership-only: the nav link is hidden and the route 403s everyone
   outside the allow-list. Refreshes on a 1 minute interval. */

const COST_VIEWERS = ["khalid", "noman", "alsaeed"];

function usd(n: number): string {
  return "$" + (n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
function int(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

export default function AiCostsPage() {
  const { me } = useViewer();
  const allowed = COST_VIEWERS.includes(me?.person ?? "");

  const query = useQuery({
    queryKey: qk.aiCosts(),
    queryFn: () => fetchEnvelope<AiCostsData>("ai_costs", "/ai-costs"),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  if (!allowed) {
    return (
      <Grid>
        <div className={spans.c12}>
          <Card>
            <CardHeader title="AI costs" />
            <p className="px-[18px] py-4 text-[13px] text-ink-2">
              You do not have access to this page.
            </p>
          </Card>
        </div>
      </Grid>
    );
  }

  return (
    <Grid>
      <div className={spans.c12}>
        <QueryPanel
          query={query}
          skeleton={
            <Card>
              <CardHeader title="AI costs" subtitle="Exact Nova spend, updated live." />
              <div className="px-[18px] py-4">
                <Skeleton height={72} />
              </div>
            </Card>
          }
        >
          {(d) => (
            <div className="flex flex-col gap-3">
              <Card>
                <CardHeader
                  title="AI costs"
                  subtitle="Exact spend on Amazon Nova, metered from every call. Updated live."
                />
                <div className="px-[18px] pb-4 pt-1">
                  <div className="text-[40px] font-bold leading-none text-title">
                    {usd(d.total_usd)}
                  </div>
                  <div className="mt-1.5 text-[12px] text-ink-3">
                    total spent so far
                    {d.last_call_at
                      ? " · last call " + new Date(d.last_call_at).toLocaleString("en-US")
                      : " · no calls yet"}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
                    <span><span className="text-ink-3">Calls</span> <b className="num text-title">{int(d.calls)}</b></span>
                    <span><span className="text-ink-3">Input tokens</span> <b className="num text-title">{int(d.input_tokens)}</b></span>
                    <span><span className="text-ink-3">Output tokens</span> <b className="num text-title">{int(d.output_tokens)}</b></span>
                  </div>
                  {d.calls === 0 ? (
                    <p className="mt-4 text-[12px] text-ink-2">
                      No Nova calls recorded yet. Spend appears here the moment AI triage runs.
                    </p>
                  ) : null}
                </div>
              </Card>

              {d.by_model.length > 0 ? (
                <Card>
                  <CardHeader title="By model" />
                  <div className="px-[18px] pb-3 pt-1">
                    {d.by_model.map((m) => (
                      <div key={m.model} className="flex justify-between border-b border-line py-1.5 text-[13px] last:border-b-0">
                        <span className="text-ink-2">{m.model}</span>
                        <span><span className="num text-title">{usd(m.usd)}</span> <span className="text-ink-3">· {int(m.calls)} calls</span></span>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              {d.by_day.length > 0 ? (
                <Card>
                  <CardHeader title="By day" subtitle="Last 30 days with spend." />
                  <div className="px-[18px] pb-3 pt-1">
                    {d.by_day.map((day) => (
                      <div key={day.date} className="flex justify-between border-b border-line py-1.5 text-[13px] last:border-b-0">
                        <span className="num text-ink-2">{day.date}</span>
                        <span><span className="num text-title">{usd(day.usd)}</span> <span className="text-ink-3">· {int(day.calls)} calls</span></span>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <p className="px-1 text-[11px] text-ink-3">
                This is our own token accounting, exact and real time. AWS billing reconciles within
                about a day and may round differently.
              </p>
            </div>
          )}
        </QueryPanel>
      </div>
    </Grid>
  );
}

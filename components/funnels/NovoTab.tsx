"use client";

// Funnels, Novo tab (spec 02 section 8.3). While meta.reliable is false the
// QueryPanel leads with the Optimism Banner built from meta.reasons[0], the
// funnel renders at .55 opacity under a "Do not trust yet" chip, and the
// verified consult count from the admin panel stands beside the misreading.
// When the definition fix ships and reliable flips true, the banner and the
// dimming disappear with no frontend change. The funnel card carries
// data-focus-id="novo-banner" to match the pulse deep link.

import type { UseQueryResult } from "@tanstack/react-query";

import { FunnelBars } from "@/components/charts/FunnelBars";
import { MiniBars, type MiniBarRow } from "@/components/charts/MiniBars";
import { FunnelTabSkeleton } from "@/components/funnels/TabSkeleton";
import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import type { FunnelNovoData } from "@/lib/api/contract";
import type { Envelope, Meta } from "@/lib/api/envelope";

type CampaignRow = FunnelNovoData["landing_by_campaign"][number];

const CAMPAIGN_COLUMNS: DataTableColumn<CampaignRow>[] = [
  {
    key: "label",
    label: "Campaign tag",
    render: (row) => <b className="font-semibold text-title">{row.label}</b>,
  },
  {
    key: "views",
    label: "Views",
    numeric: true,
    render: (row) => row.views.toLocaleString(),
  },
];

function toBars(rows: Array<{ label: string; count: number; not_instrumented?: boolean }>): MiniBarRow[] {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return rows.map((r) => ({
    label: r.label,
    value: r.not_instrumented ? "Not measured" : r.count.toLocaleString(),
    pct: r.not_instrumented ? 0 : (r.count / max) * 100,
  }));
}

function verifiedNote(meta: Meta): string {
  return (
    meta.reasons.find((r) => r.key === "admin_panel_pending")?.title ??
    "The verified count connects from the admin panel."
  );
}

export function NovoTab({ query }: { query: UseQueryResult<Envelope<FunnelNovoData>> }) {
  return (
    <QueryPanel query={query} skeleton={<FunnelTabSkeleton tiles={4} />}>
      {(data, meta, flags) => (
        <Grid>
          <KpiCard
            className={spans.c3}
            label="Landing views"
            labelRight={<Chip variant="info">Measured</Chip>}
            value={data.tiles.landing_views.value.toLocaleString()}
            note="Counted by Mixpanel on the landing page"
            dot="good"
          />
          <KpiCard
            className={spans.c3}
            label="Funnel says paid"
            labelRight={<Chip variant="warn">Misreading</Chip>}
            value={data.tiles.funnel_says_paid.value.toLocaleString()}
            note="Definition mismatch"
            dot="warn"
          />
          {data.tiles.real_consults.value === null ? (
            <KpiCard
              className={spans.c3}
              label="Real Novo consults"
              labelRight={<Chip variant="good">Verified</Chip>}
              value={<PendingValue>Verified count coming</PendingValue>}
              note={verifiedNote(meta)}
              dot="mut"
            />
          ) : (
            <KpiCard
              className={spans.c3}
              label="Real Novo consults"
              labelRight={<Chip variant="good">Verified</Chip>}
              value={data.tiles.real_consults.value.toLocaleString()}
              note="From the admin panel"
              dot="good"
            />
          )}
          <KpiCard
            className={spans.c3}
            label="BMI checks finished"
            value={data.tiles.bmi_checks.value.toLocaleString()}
            note="Completed checks in this period"
            dot="good"
          />

          <div className={spans.c12} data-focus-id="novo-banner">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="serif text-[15px] text-title">Novo funnels</h3>
              {flags.unreliable ? <Chip variant="warn">Do not trust yet</Chip> : null}
            </div>
            {flags.unreliable ? (
              <p className="mt-1 text-xs text-ink-2">
                A clean zero here is a measurement artifact, not an operations failure.
                {data.tiles.real_consults.value !== null
                  ? ` ${data.tiles.real_consults.value.toLocaleString()} consults actually happened.`
                  : " Trust the verified count once it connects."}
              </p>
            ) : null}
          </div>

          {data.novo_funnels.map((f) => (
            <div key={f.key} className={spans.c6}>
              <Card>
                <CardHeader title={f.label} subtitle={`${f.end_to_end_pct}% land to paid`} />
                <div className="px-[18px] pb-4 pt-[13px]">
                  {f.steps.length === 0 ? (
                    <p className="py-2 text-[13px] text-ink-2">No data for this funnel yet.</p>
                  ) : (
                    <div className={flags.unreliable ? "opacity-55" : undefined}>
                      <FunnelBars rows={f.steps.map((s) => ({ label: s.label, value: s.count }))} />
                      <p className="sr-only">
                        {f.steps
                          .map((s) => `${s.label}: ${s.count.toLocaleString()} (${s.pct_of_first}% of the first step)`)
                          .join(". ")}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ))}

          <div className={spans.c12}>
            <h3 className="serif text-[15px] text-title">Saleem Direct comparison</h3>
            <p className="mt-1 text-xs text-ink-2">
              The Saleem Direct booking funnels, as a benchmark beside Novo.
            </p>
          </div>

          {data.direct_benchmarks.map((f) => (
            <div key={f.key} className={spans.c6}>
              <Card>
                <CardHeader title={f.label} subtitle={`${f.end_to_end_pct}% end to end`} />
                <div className="px-[18px] pb-4 pt-[13px]">
                  {f.steps.length === 0 ? (
                    <p className="py-2 text-[13px] text-ink-2">No data for this funnel yet.</p>
                  ) : (
                    <>
                      <FunnelBars rows={f.steps.map((s) => ({ label: s.label, value: s.count }))} />
                      <p className="sr-only">
                        {f.steps
                          .map((s) => `${s.label}: ${s.count.toLocaleString()} (${s.pct_of_first}% of the first step)`)
                          .join(". ")}
                      </p>
                    </>
                  )}
                </div>
              </Card>
            </div>
          ))}

          <div className={spans.c6} data-focus-id="novo-ctas">
            <Card>
              <CardHeader title="CTAs by type" subtitle="Clicks on the Novo landing page." />
              <div className="px-[18px] pb-4 pt-[13px]">
                {data.ctas_by_type.length === 0 ? (
                  <p className="py-2 text-[13px] text-ink-2">CTA clicks land here once they are measured.</p>
                ) : (
                  <MiniBars rows={toBars(data.ctas_by_type)} />
                )}
                <div className="mt-4 border-t border-line-soft pt-3">
                  <h4 className="serif mb-2 text-[14px] text-title">BMI categories</h4>
                  {data.bmi_categories.length === 0 ? (
                    <p className="py-1 text-[13px] text-ink-2">
                      Categories land here once checks are completed.
                    </p>
                  ) : (
                    <MiniBars rows={toBars(data.bmi_categories)} />
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className={spans.c12} data-focus-id="novo-campaigns">
            <Card>
              <CardHeader
                title="Landing traffic by campaign tag"
                subtitle="Where Novo visitors came from in this period."
              />
              <div className="px-[18px] pb-2 pt-2">
                {data.landing_by_campaign.length === 0 ? (
                  <p className="py-2 pb-4 text-[13px] text-ink-2">
                    Campaign tags land here once UTM data flows.
                  </p>
                ) : (
                  <DataTable
                    columns={CAMPAIGN_COLUMNS}
                    rows={data.landing_by_campaign}
                    rowKey={(row) => row.label}
                    className="pb-2"
                  />
                )}
              </div>
            </Card>
          </div>
        </Grid>
      )}
    </QueryPanel>
  );
}

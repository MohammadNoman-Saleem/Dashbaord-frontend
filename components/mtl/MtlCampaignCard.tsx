"use client";

import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Spark } from "@/components/charts/Spark";
import { spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { PendingValue } from "@/components/ui/PendingValue";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel, Stat, StatRow } from "@/components/ui/Stat";
import type { MedicalTravelLeadsData } from "@/lib/api/contract";
import { buildDeepLink } from "@/lib/deepLink";
import { fmtDate } from "@/lib/format/datetime";
import {
  bhdValue,
  dayBefore,
  monthLong,
  pendingPhrase,
  periodLabel,
  readTone,
  useMedicalTravelLeads,
  USD_PER_BHD,
  usdSuffix,
} from "@/components/mtl/shared";

/* The campaign card on the Marketing view (06 group D2): spend, the lead
   count against Meta's figure, the CPL split around the fatigue date, the
   daily shape, and the rule-generated moves. Same single API source as the
   Cases card; null Meta-derived fields render PendingValue with the served
   reason. */

const READ_ICONS = { warn: AlertTriangle, good: Check, info: ArrowRight } as const;

const SKELETON = (
  <div className="flex flex-col gap-3 py-1">
    <Skeleton height={34} width="70%" />
    <div className="grid grid-cols-2 gap-4 max-[880px]:grid-cols-1">
      <Skeleton height={110} />
      <Skeleton height={110} />
    </div>
  </div>
);

/* One plain paragraph describing the daily shape with the live numbers.
   The payload carries no caption string, so this composes from the served
   series only. */
function dailyCaption(d: MedicalTravelLeadsData): string {
  const daily = d.daily;
  if (daily.length === 0) return "No daily data for this window yet.";
  const total = daily.reduce((sum, day) => sum + day.leads, 0);
  if (daily.length <= 3) {
    return `${total} leads over the first ${daily.length} ${daily.length === 1 ? "day" : "days"}.`;
  }
  const firstThree = daily.slice(0, 3).reduce((sum, day) => sum + day.leads, 0);
  const rest = total - firstThree;
  const restDays = daily.length - 3;
  const perDay = (rest / restDays).toFixed(1);
  const last = daily[daily.length - 1];
  const opener = d.period.partial_day
    ? ` ${fmtDate(last.date)} opened with ${last.leads}.`
    : "";
  return `${firstThree} leads in the first three days, then about ${perDay} a day over the next ${restDays}.${opener}`;
}

export function MtlCampaignCard() {
  const viewAs = useSearchParams().get("as") ?? undefined;
  const query = useMedicalTravelLeads();
  const data = query.data?.data;

  const chip = data?.cpl ? (
    data.cpl.fatigue ? (
      <Chip variant="warn">
        Cost per lead up {data.cpl.delta_pct}% since {fmtDate(data.cpl.split_date)}
      </Chip>
    ) : (
      <Chip variant="info">{bhdValue(data.cpl.blended_bhd)} per lead, blended</Chip>
    )
  ) : undefined;

  return (
    <Card data-focus-id="marketing-campaign">
      <CardHeader
        title={
          data
            ? `Medical travel campaign, day ${data.period.campaign_day}`
            : "Medical travel campaign"
        }
        subtitle={
          data
            ? data.totals.converted > 0
              ? `Lead Gen Form, ${monthLong(data.period.from)}. The funnel behind it has started to move: ${data.totals.converted} leads are now Treatment deals.`
              : `Lead Gen Form, ${monthLong(data.period.from)}.`
            : "Lead Gen Form."
        }
        right={chip}
      />
      <div className="px-[18px] pb-4 pt-3">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.totals.zoho_leads === 0 && d.daily.length === 0}
          emptyCopy="No campaign activity in this window yet."
        >
          {(d, meta) => (
            <>
              <StatRow>
                {d.spend ? (
                  <Stat
                    value={bhdValue(d.spend.bhd, 0)}
                    small={usdSuffix(d.spend.usd)}
                    label={`spend, ${periodLabel(d.period.from, d.period.to)}`}
                  />
                ) : (
                  <Stat
                    value={<PendingValue>{pendingPhrase(meta)}</PendingValue>}
                    label="spend"
                  />
                )}
                <Stat
                  value={d.totals.zoho_leads}
                  small={
                    d.totals.meta_leads != null && d.totals.meta_leads !== d.totals.zoho_leads
                      ? `Meta says ${d.totals.meta_leads}`
                      : undefined
                  }
                  label="leads in Zoho"
                />
                {d.cpl ? (
                  <>
                    <Stat
                      value={bhdValue(d.cpl.first_week_usd / USD_PER_BHD)}
                      small={usdSuffix(d.cpl.first_week_usd)}
                      label={`per lead to ${dayBefore(d.cpl.split_date)}`}
                    />
                    <Stat
                      value={bhdValue(d.cpl.since_usd / USD_PER_BHD)}
                      small={usdSuffix(d.cpl.since_usd)}
                      label={`per lead since ${fmtDate(d.cpl.split_date)}`}
                    />
                  </>
                ) : (
                  <Stat
                    value={<PendingValue>{pendingPhrase(meta)}</PendingValue>}
                    label="per lead"
                  />
                )}
                <Stat value={d.totals.converted} label="converted to deals" />
              </StatRow>

              <div className="grid grid-cols-12 gap-[18px]">
                <div className={spans.c6}>
                  <GrpLabel>Daily leads</GrpLabel>
                  <Spark values={d.daily.map((day) => day.leads)} />
                  <p className="mt-2 text-xs leading-relaxed text-ink-2">{dailyCaption(d)}</p>
                </div>
                <div className={spans.c6}>
                  <GrpLabel>What to do with it</GrpLabel>
                  {d.reads.length === 0 ? (
                    <p className="py-1 text-[13px] text-ink-2">
                      Nothing needs a call this week.
                    </p>
                  ) : (
                    <div>
                      {d.reads.map((read) => {
                        const tone = readTone(read);
                        return (
                          <ListRow
                            key={read.key}
                            icon={READ_ICONS[tone]}
                            variant={tone}
                            title={read.title}
                            subtitle={read.body}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </QueryPanel>
      </div>
      {data ? (
        <CardFooter
          note={
            data.reconciliation && data.reconciliation.gap !== 0
              ? `Meta reports ${data.reconciliation.meta} vs ${data.reconciliation.zoho} in Zoho, gap with Aziz. Other campaigns in the window are reported separately.`
              : "Covers the medical travel lead campaign only. Other campaigns in the window are reported separately."
          }
          right={
            <Link href={buildDeepLink({ view: "cases", focus: "mtl-card" }, viewAs)}>
              Lead breakdown
            </Link>
          }
        />
      ) : null}
    </Card>
  );
}

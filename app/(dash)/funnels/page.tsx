"use client";

import { Clock, RotateCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { DirectTab } from "@/components/funnels/DirectTab";
import { GeneralTab } from "@/components/funnels/GeneralTab";
import { NovoTab } from "@/components/funnels/NovoTab";
import { RetentionTab } from "@/components/funnels/RetentionTab";
import { ScheduledTab } from "@/components/funnels/ScheduledTab";
import { UiuxTab } from "@/components/funnels/UiuxTab";
import { Button } from "@/components/ui/Button";
import { Pills } from "@/components/ui/Pills";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type {
  FunnelDirectData,
  FunnelGeneralData,
  FunnelNovoData,
  FunnelPeriod,
  FunnelScheduledData,
  FunnelUiuxData,
  GrowthEngagementData,
  GrowthRetentionData,
} from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { qk } from "@/lib/api/keys";
import { useRefreshableEnvelope } from "@/lib/api/useManualRefresh";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtAgo, fmtTime } from "@/lib/format/datetime";
import type { EndpointKey } from "@/config/endpoints";
import { TITLES } from "@/config/titles";

/* Funnels and Behaviour (spec 02 section 8.3). The six tabs are wired to
   ?tab= (general|direct|uiux|scheduled|novo|retention) and the Direct
   dataset to ?variant=, so deep links land on the right pane from a cold
   load. Each tab is one endpoint, except General which carries a second
   engagement query (DAU/MAU, top events, traffic); the header reads
   "Updated {ago}" from the tab's meta and the Refresh button refetches with
   refresh=1. A refresh that comes back meta.cached means Mixpanel kept its
   saved numbers; the toast says so in the copy-library words. */

const TAB_ITEMS = [
  { key: "general", label: "General" },
  { key: "direct", label: "Direct Appointment" },
  { key: "uiux", label: "UI/UX" },
  { key: "scheduled", label: "Scheduled" },
  { key: "novo", label: "Novo" },
  { key: "retention", label: "Retention" },
];

type TabKey = "general" | "direct" | "uiux" | "scheduled" | "novo" | "retention";

// The reporting-period control drives only the saved-funnel tabs; General,
// UI/UX, and Retention keep their own rolling trend windows.
const PERIOD_TABS: TabKey[] = ["direct", "scheduled", "novo"];
const PERIOD_PILLS = [
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All time" },
];
const PERIODS: FunnelPeriod[] = ["mtd", "qtd", "ytd", "all"];

const TAB_SOURCES: Record<TabKey, { endpoint: EndpointKey; path: string }> = {
  general: { endpoint: "funnels_general", path: "/funnels/general" },
  direct: { endpoint: "funnels_direct", path: "/funnels/direct" },
  uiux: { endpoint: "funnels_uiux", path: "/funnels/uiux" },
  scheduled: { endpoint: "funnels_scheduled", path: "/funnels/scheduled" },
  novo: { endpoint: "funnels_novo", path: "/funnels/novo" },
  retention: { endpoint: "growth_retention", path: "/growth/retention" },
};

function FunnelsContent() {
  useFocusFlash();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const title = TITLES.funnels;
  const requested = searchParams.get("tab");
  const tab: TabKey = TAB_ITEMS.some((item) => item.key === requested)
    ? (requested as TabKey)
    : "general";
  const variant = searchParams.get("variant") === "instant" ? "instant" : "full";
  const requestedPeriod = searchParams.get("period");
  const period: FunnelPeriod = PERIODS.includes(requestedPeriod as FunnelPeriod)
    ? (requestedPeriod as FunnelPeriod)
    : "mtd";
  const periodAware = PERIOD_TABS.includes(tab);

  const source = TAB_SOURCES[tab];
  // Only the saved-funnel tabs carry variant (Direct) and period; the query key
  // and request params reflect exactly what the active tab sends.
  const params: Record<string, string> = {};
  if (tab === "direct") params.variant = variant;
  if (periodAware) params.period = period;
  const { query, refresh, refreshing } = useRefreshableEnvelope<unknown>({
    queryKey: qk.funnels(
      tab,
      tab === "direct" ? variant : undefined,
      periodAware ? period : undefined,
    ),
    endpoint: source.endpoint,
    path: source.path,
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  // The General tab's second query: engagement numbers from /growth.
  // Refresh covers both queries while that tab is up.
  const engagement = useRefreshableEnvelope<GrowthEngagementData>({
    queryKey: qk.growth("engagement"),
    endpoint: "growth_engagement",
    path: "/growth/engagement",
    enabled: tab === "general",
  });
  const meta = query.data?.meta;

  // One URL builder for tab, variant, and period changes. The period is carried
  // across the funnel tabs (dropped from the URL when it is the mtd default, or
  // when the tab does not use it) so a deep link stays clean.
  function pushFunnels(
    nextTab: TabKey,
    nextVariant: string | undefined,
    nextPeriod: FunnelPeriod,
  ) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    if (nextTab === "direct" && nextVariant && nextVariant !== "full") {
      params.set("variant", nextVariant);
    }
    if (PERIOD_TABS.includes(nextTab) && nextPeriod !== "mtd") {
      params.set("period", nextPeriod);
    }
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/funnels?${params.toString()}`);
  }

  function navigate(nextTab: TabKey, nextVariant?: string) {
    pushFunnels(nextTab, nextVariant, period);
  }

  function onPeriodChange(next: string) {
    pushFunnels(tab, variant, next as FunnelPeriod);
  }

  async function onRefresh() {
    const [envelope] = await Promise.all([
      refresh(),
      tab === "general" ? engagement.refresh() : Promise.resolve(undefined),
    ]);
    if (envelope?.meta.cached) {
      toast(
        `Mixpanel is busy right now. Showing saved numbers from ${fmtTime(envelope.meta.updated_at)}. It refreshes again within the hour.`,
        Clock,
      );
    }
  }

  return (
    <>
      <div className="mb-3 mt-[10px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
          <p className="text-[13.5px] text-ink-2">{title.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {periodAware ? (
            <Pills
              items={PERIOD_PILLS}
              value={period}
              onChange={onPeriodChange}
              aria-label="Reporting period"
            />
          ) : null}
          <span className="inline-flex items-center gap-[9px] rounded-inner" data-focus-id="refresh">
            {meta ? (
              <span className="num text-xs text-ink-3">Updated {fmtAgo(meta.updated_at)}</span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void onRefresh()} disabled={refreshing}>
              <RotateCw strokeWidth={1.8} aria-hidden="true" />
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
          </span>
        </div>
      </div>

      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={(key) => navigate(key as TabKey)}
        aria-label="Funnel tabs"
      />

      {tab === "general" ? (
        <GeneralTab
          query={query as UseQueryResult<Envelope<FunnelGeneralData>>}
          engagement={engagement.query}
        />
      ) : null}
      {tab === "direct" ? (
        <DirectTab
          query={query as UseQueryResult<Envelope<FunnelDirectData>>}
          variant={variant}
          onVariantChange={(next) => navigate("direct", next)}
        />
      ) : null}
      {tab === "uiux" ? (
        <UiuxTab query={query as UseQueryResult<Envelope<FunnelUiuxData>>} />
      ) : null}
      {tab === "scheduled" ? (
        <ScheduledTab query={query as UseQueryResult<Envelope<FunnelScheduledData>>} />
      ) : null}
      {tab === "novo" ? (
        <NovoTab query={query as UseQueryResult<Envelope<FunnelNovoData>>} />
      ) : null}
      {tab === "retention" ? (
        <RetentionTab query={query as UseQueryResult<Envelope<GrowthRetentionData>>} />
      ) : null}
    </>
  );
}

export default function FunnelsPage() {
  return (
    <Suspense fallback={null}>
      <FunnelsContent />
    </Suspense>
  );
}

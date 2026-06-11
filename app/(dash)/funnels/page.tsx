"use client";

import { Clock, RotateCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { DirectTab } from "@/components/funnels/DirectTab";
import { GeneralTab } from "@/components/funnels/GeneralTab";
import { NovoTab } from "@/components/funnels/NovoTab";
import { ScheduledTab } from "@/components/funnels/ScheduledTab";
import { UiuxTab } from "@/components/funnels/UiuxTab";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import type {
  FunnelDirectData,
  FunnelGeneralData,
  FunnelNovoData,
  FunnelScheduledData,
  FunnelUiuxData,
} from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { qk } from "@/lib/api/keys";
import { useRefreshableEnvelope } from "@/lib/api/useManualRefresh";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtAgo, fmtTime } from "@/lib/format/datetime";
import type { EndpointKey } from "@/config/endpoints";
import { TITLES } from "@/config/titles";

/* Funnels and Behaviour (spec 02 section 8.3). The five tabs are wired to
   ?tab= (general|direct|uiux|scheduled|novo) and the Direct dataset to
   ?variant=, so deep links land on the right pane from a cold load. Each
   tab is one endpoint; the header reads "Updated {ago}" from its meta and
   the Refresh button refetches with refresh=1. A refresh that comes back
   meta.cached means Mixpanel kept its saved numbers; the toast says so in
   the copy-library words. */

const TAB_ITEMS = [
  { key: "general", label: "General" },
  { key: "direct", label: "Direct Appointment" },
  { key: "uiux", label: "UI/UX" },
  { key: "scheduled", label: "Scheduled" },
  { key: "novo", label: "Novo" },
];

type TabKey = "general" | "direct" | "uiux" | "scheduled" | "novo";

const TAB_SOURCES: Record<TabKey, { endpoint: EndpointKey; path: string }> = {
  general: { endpoint: "funnels_general", path: "/funnels/general" },
  direct: { endpoint: "funnels_direct", path: "/funnels/direct" },
  uiux: { endpoint: "funnels_uiux", path: "/funnels/uiux" },
  scheduled: { endpoint: "funnels_scheduled", path: "/funnels/scheduled" },
  novo: { endpoint: "funnels_novo", path: "/funnels/novo" },
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

  const source = TAB_SOURCES[tab];
  const { query, refresh, refreshing } = useRefreshableEnvelope<unknown>({
    queryKey: qk.funnels(tab, tab === "direct" ? variant : undefined),
    endpoint: source.endpoint,
    path: source.path,
    params: tab === "direct" ? { variant } : undefined,
  });
  const meta = query.data?.meta;

  function navigate(nextTab: TabKey, nextVariant?: string) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    if (nextTab === "direct" && nextVariant && nextVariant !== "full") {
      params.set("variant", nextVariant);
    }
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/funnels?${params.toString()}`);
  }

  async function onRefresh() {
    const envelope = await refresh();
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

      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={(key) => navigate(key as TabKey)}
        aria-label="Funnel tabs"
      />

      {tab === "general" ? (
        <GeneralTab query={query as UseQueryResult<Envelope<FunnelGeneralData>>} />
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

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CrmOverviewTab } from "@/components/crm/CrmOverviewTab";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { useFocusFlash } from "@/lib/deepLink";
import { TITLES } from "@/config/titles";

/* CRM analytics (Phase 2), ported from the old dashboard CRM page into the new
   design and data seam. Four tabs wired to ?tab=, read only in v1. This is the
   page shell: routing, the tab bar, and a per-tab placeholder; each tab is
   filled in its own step (Overview, then Leads, Deals, Analytics). Deep links
   land on the right tab from a cold load; an unknown or absent tab falls back
   to Overview, matching the Marketing view pattern. */

const TAB_ITEMS = [
  { key: "overview", label: "Overview" },
  { key: "leads", label: "Leads" },
  { key: "deals", label: "Deals" },
  { key: "analytics", label: "Analytics" },
];

const TAB_KEYS = ["overview", "leads", "deals", "analytics"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/* A short note on what each tab will carry, shown until the tab is built. */
const TAB_PLACEHOLDER: Record<TabKey, { title: string; sub: string }> = {
  overview: {
    title: "Overview",
    sub: "Lead and deal totals, per-pipeline month over month, and the customer and provider funnels.",
  },
  leads: {
    title: "Leads",
    sub: "Lead conversion funnel, lead sources, and the full leads table.",
  },
  deals: {
    title: "Deals",
    sub: "Pipeline stage bars, pipeline quality, treatment journey, customer sub-type, and the deals table.",
  },
  analytics: {
    title: "Analytics",
    sub: "SLA and stage velocity, loss analysis, geographic and specialty breakdowns, and the lead to booking cohort.",
  },
};

function CrmContent() {
  useFocusFlash();
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const tab: TabKey = TAB_KEYS.includes(requested as TabKey)
    ? (requested as TabKey)
    : "overview";
  const title = TITLES.crm;

  function navigate(nextTab: TabKey) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/crm?${params.toString()}`);
  }

  const placeholder = TAB_PLACEHOLDER[tab];

  return (
    <>
      <div className="mb-3 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>

      <Tabs
        items={TAB_ITEMS}
        value={tab}
        onChange={(key) => navigate(key as TabKey)}
        aria-label="CRM tabs"
      />

      {tab === "overview" ? (
        <CrmOverviewTab />
      ) : (
        <Card>
          <CardHeader title={placeholder.title} subtitle={placeholder.sub} />
          <p className="px-[18px] pb-4 pt-[13px] text-[13px] text-ink-2">
            This tab is being built.
          </p>
        </Card>
      )}
    </>
  );
}

export default function CrmPage() {
  return (
    <Suspense fallback={null}>
      <CrmContent />
    </Suspense>
  );
}

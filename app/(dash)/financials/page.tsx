"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { CommissionTab } from "@/components/financials/CommissionTab";
import { FinancialsTab } from "@/components/financials/FinancialsTab";
import { Tabs } from "@/components/ui/Tabs";
import { useFocusFlash } from "@/lib/deepLink";
import { TITLES } from "@/config/titles";

/* Financials, now two tabs wired to ?tab= (financials|commission), mirroring
   the /funnels tabbed pattern so deep links land on the right pane from a cold
   load. The Financials tab is the existing money-in, money-owed view; the
   Commission tab is the gross-vs-Saleem-revenue commission model on the
   editable payout rules. */

const TAB_ITEMS = [
  { key: "financials", label: "Financials" },
  { key: "commission", label: "Commission" },
];

type TabKey = "financials" | "commission";

function FinancialsContent() {
  useFocusFlash();
  const router = useRouter();
  const searchParams = useSearchParams();

  const title = TITLES.financials;
  const requested = searchParams.get("tab");
  const tab: TabKey = requested === "commission" ? "commission" : "financials";

  function navigate(nextTab: TabKey) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/financials?${params.toString()}`);
  }

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
        aria-label="Financials tabs"
      />

      {tab === "financials" ? <FinancialsTab /> : null}
      {tab === "commission" ? <CommissionTab /> : null}
    </>
  );
}

export default function FinancialsPage() {
  return (
    <Suspense fallback={null}>
      <FinancialsContent />
    </Suspense>
  );
}

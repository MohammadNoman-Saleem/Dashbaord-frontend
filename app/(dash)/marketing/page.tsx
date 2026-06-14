"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { MarketingTab } from "@/components/marketing/MarketingTab";
import { SocialTab } from "@/components/social/SocialTab";
import { Tabs } from "@/components/ui/Tabs";
import { useFocusFlash } from "@/lib/deepLink";
import { TITLES } from "@/config/titles";

/* Marketing (spec 02 section 8.4) now carries two tabs wired to ?tab=,
   mirroring the Funnels view: Marketing is the lead and channel content,
   Social is the GA4 plus per-platform content that used to live at the
   standalone /social route (folded in here per the parking-list rule and
   flagged for Khalid's review). Deep links land on the right pane from a
   cold load; an unknown or absent tab falls back to Marketing. The two
   subtitles read from the TITLES map so the topbar copy stays in one
   place. */

const TAB_ITEMS = [
  { key: "marketing", label: "Marketing" },
  { key: "social", label: "Social" },
];

type TabKey = "marketing" | "social";

function MarketingContent() {
  useFocusFlash();
  const router = useRouter();
  const searchParams = useSearchParams();

  const requested = searchParams.get("tab");
  const tab: TabKey = requested === "social" ? "social" : "marketing";
  const title = tab === "social" ? TITLES.social : TITLES.marketing;

  function navigate(nextTab: TabKey) {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/marketing?${params.toString()}`);
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
        aria-label="Marketing tabs"
      />

      {tab === "marketing" ? <MarketingTab /> : null}
      {tab === "social" ? <SocialTab /> : null}
    </>
  );
}

export default function MarketingPage() {
  return (
    <Suspense fallback={null}>
      <MarketingContent />
    </Suspense>
  );
}

"use client";

import { RotateCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Grid, spans } from "@/components/shell/Grid";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { TITLES } from "@/config/titles";

/* Funnels and Behaviour placeholder. The five tabs are wired to ?tab= per
   02 section 5.2 (general|direct|uiux|scheduled|novo) so deep links land on
   the right pane from a cold load. Real funnel panels arrive next stage.
   The novo pane and the refresh control carry the data-focus-id values the
   pulse fixtures deep-link to (novo-banner, refresh). */

const TAB_ITEMS = [
  { key: "general", label: "General" },
  { key: "direct", label: "Direct Appointment" },
  { key: "uiux", label: "UI/UX" },
  { key: "scheduled", label: "Scheduled" },
  { key: "novo", label: "Novo" },
];

const TAB_FOCUS: Record<string, string> = {
  general: "funnels-general-placeholder",
  direct: "funnels-direct-placeholder",
  uiux: "funnels-uiux-placeholder",
  scheduled: "funnels-scheduled-placeholder",
  novo: "novo-banner",
};

function FunnelsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const title = TITLES.funnels;
  const requested = searchParams.get("tab");
  const tab = TAB_ITEMS.some((item) => item.key === requested) ? (requested as string) : "general";
  const tabLabel = TAB_ITEMS.find((item) => item.key === tab)?.label ?? "General";

  function onTabChange(key: string) {
    const params = new URLSearchParams();
    params.set("tab", key);
    const viewAs = searchParams.get("as");
    if (viewAs) params.set("as", viewAs);
    router.push(`/funnels?${params.toString()}`);
  }

  return (
    <>
      <div className="mb-3 mt-[10px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
          <p className="text-[13.5px] text-ink-2">{title.sub}</p>
        </div>
        <span className="inline-flex rounded-inner" data-focus-id="refresh">
          <Button variant="ghost" size="sm">
            <RotateCw strokeWidth={1.8} aria-hidden="true" />
            Refresh
          </Button>
        </span>
      </div>

      <Tabs items={TAB_ITEMS} value={tab} onChange={onTabChange} aria-label="Funnel tabs" />

      <Grid>
        <div className={`${spans.c12} rounded-card`} data-focus-id={TAB_FOCUS[tab]}>
          <Card>
            <CardHeader
              title={`${tabLabel} funnel`}
              subtitle="This pane is on its way. The tab selection lives in the URL, so links and refreshes land here."
            />
            <div className="px-[18px] pb-4 pt-2 text-[13px] text-ink-2">
              The {tabLabel} panels land in the next stage.
            </div>
          </Card>
        </div>
      </Grid>
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

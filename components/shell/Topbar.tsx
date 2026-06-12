"use client";

import { useQuery } from "@tanstack/react-query";
import { Flag, Menu, MinusCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BlockersDrawer } from "@/components/shell/BlockersDrawer";
import { UrgentDrawer } from "@/components/shell/UrgentDrawer";
import { IconButton } from "@/components/ui/Button";
import { ThemeTabs } from "@/components/ui/ThemeTabs";
import { TITLES } from "@/config/titles";
import type { BlockersData, UrgentData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* Sticky topbar per 02 section 5.1 plus 06 group F: hamburger (mobile
   only), page title and subtitle for the current route, "Updated {time}"
   text, the Urgent pill with the open count, the Blockers pill directly
   after it, and the theme tabs. Owns both drawer states; opening one drawer
   closes the other, the two are never open together. Each drawer handles
   Escape through onClose. */

/* "2026-06-11T07:42:00+03:00" renders as "7:42 AM" per the copy rules. */
function formatUpdatedTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const PILL_CLASSES =
  "flex cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full border border-line bg-surface px-3 py-[7px] text-[12.5px] font-semibold text-title hover:border-accent";

const COUNT_CLASSES =
  "num rounded-full bg-optimism px-[7px] py-px text-[11px] font-bold text-trust-ink";

type TopbarProps = {
  onOpenMobileNav: () => void;
};

type DrawerKey = "urgent" | "blockers" | null;

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const [openDrawer, setOpenDrawer] = useState<DrawerKey>(null);
  const pathname = usePathname();

  /* UrgentMini's and BlockersMini's "View all" links dispatch these window
     events instead of routing away; the topbar owns the drawer state, so it
     listens here. */
  useEffect(() => {
    const openUrgent = () => setOpenDrawer("urgent");
    const openBlockers = () => setOpenDrawer("blockers");
    window.addEventListener("open-urgent-drawer", openUrgent);
    window.addEventListener("open-blockers-drawer", openBlockers);
    return () => {
      window.removeEventListener("open-urgent-drawer", openUrgent);
      window.removeEventListener("open-blockers-drawer", openBlockers);
    };
  }, []);

  const segment = pathname.split("/")[1] || "home";
  const view = (segment in TITLES ? segment : "home") as keyof typeof TITLES;
  const title = TITLES[view];

  /* 30s staleness for both boards per the query-key policy in lib/api/keys.ts. */
  const urgentQuery = useQuery({
    queryKey: qk.urgent(),
    queryFn: () => fetchEnvelope<UrgentData>("urgent", "/urgent"),
    staleTime: 30_000,
  });
  const blockersQuery = useQuery({
    queryKey: qk.blockers(),
    queryFn: () => fetchEnvelope<BlockersData>("blockers", "/blockers"),
    staleTime: 30_000,
  });
  const openCount = urgentQuery.data?.data ? urgentQuery.data.data.open.length : null;
  const blockerCount = blockersQuery.data?.data ? blockersQuery.data.data.open.length : null;
  const updatedAt = urgentQuery.data?.meta.updated_at;

  return (
    <>
      <div className="flex items-center gap-[14px] px-6 pb-2 pt-[14px] max-[880px]:flex-wrap max-[880px]:px-4 max-[880px]:pt-3">
        <div className="hidden max-[880px]:block">
          <IconButton aria-label="Open menu" onClick={onOpenMobileNav}>
            <Menu strokeWidth={1.8} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="min-w-0">
          <h1 className="text-[21px] leading-[1.2]">{title.title}</h1>
          <p className="mt-[2px] truncate text-[12.5px] text-ink-2">{title.sub}</p>
        </div>

        <div className="flex-1" />

        {updatedAt ? (
          <span className="num whitespace-nowrap text-xs text-ink-3 max-[880px]:hidden">
            Updated {formatUpdatedTime(updatedAt)}
          </span>
        ) : null}

        <button type="button" onClick={() => setOpenDrawer("urgent")} className={PILL_CLASSES}>
          <Flag strokeWidth={1.8} className="h-[15px] w-[15px]" aria-hidden="true" />
          <span>Urgent</span>
          {openCount == null ? null : <span className={COUNT_CLASSES}>{openCount}</span>}
        </button>

        <button type="button" onClick={() => setOpenDrawer("blockers")} className={PILL_CLASSES}>
          <MinusCircle strokeWidth={1.8} className="h-[15px] w-[15px]" aria-hidden="true" />
          <span>Blockers</span>
          {blockerCount == null ? null : <span className={COUNT_CLASSES}>{blockerCount}</span>}
        </button>

        <ThemeTabs />
      </div>

      <UrgentDrawer open={openDrawer === "urgent"} onClose={() => setOpenDrawer(null)} />
      <BlockersDrawer open={openDrawer === "blockers"} onClose={() => setOpenDrawer(null)} />
    </>
  );
}

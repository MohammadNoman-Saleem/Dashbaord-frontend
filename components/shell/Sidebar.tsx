"use client";

import {
  Building2,
  CalendarCheck,
  ChevronLeft,
  Coins,
  Contact,
  Cpu,
  Filter,
  Gauge,
  Home,
  Layers,
  Megaphone,
  SquareKanban,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { NavItem } from "@/components/shell/NavItem";
import { PersonMenu } from "@/components/shell/PersonMenu";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { BeatIcon } from "@/components/ui/BeatIcon";
import { useViewer } from "@/lib/viewer";

/* Sidebar per 02 section 5.1 and the approved mockup: 250px sticky full
   height, collapsing to a 70px icon rail on desktop, and a fixed off-canvas
   drawer under 880px (AppShell owns the scrim and both states). In drawer
   mode the rail collapse does not apply, so labels always show there. */

type NavEntry = { href: string; label: string; icon: LucideIcon };

const WORKSPACE_NAV: NavEntry[] = [
  { href: "/", label: "Command Center", icon: Home },
  /* The cockpit is the case manager's working surface: every active lead with
     its next step and the clock that governs it. Placed immediately after
     Command Center (second position) at the build lead's request. */
  { href: "/cockpit", label: "Cockpit", icon: Gauge },
  { href: "/cases", label: "Cases & Pipeline", icon: Layers },
  { href: "/crm", label: "CRM", icon: Contact },
  { href: "/appointments", label: "Appointments", icon: CalendarCheck },
  /* Team board is NOT in the approved v3 mockup; it is the legacy kanban
     port, styled with the existing design system and flagged for Khalid's
     review per the parking-list rule. */
  { href: "/board", label: "Board", icon: SquareKanban },
  { href: "/funnels", label: "Funnels & Behaviour", icon: Filter },
  /* Marketing carries the Social view as its second tab (?tab=social): the
     legacy /social page (GA4 plus platform metrics) folded in per the
     parking-list rule and flagged for Khalid's review. There is no separate
     Social nav item; the standalone /social route was removed. */
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/financials", label: "Financials", icon: Wallet },
];

const MANAGE_NAV: NavEntry[] = [
  { href: "/kpis", label: "KPIs & Deliverables", icon: Target },
  { href: "/agents", label: "Agents & System Health", icon: Cpu },
];

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

export function Sidebar({ collapsed, mobileOpen, onToggleCollapsed, onCloseMobile }: SidebarProps) {
  /* The icon rail is desktop-only; the mobile drawer always shows labels. */
  const rail = collapsed && !mobileOpen;

  /* User administration is admin-only: the nav item is gated on the real
     signed-in role (the server refuses the routes regardless, but the link
     should not appear for anyone else). */
  const { me } = useViewer();
  /* me is null on the server and on the first client render (useViewer holds it
     back until hydration), so these gates are false on the first paint and the
     gated links appear only after hydration, matching the server. */
  const isAdmin = me?.role === "admin";
  /* The provider board shows patient cases, so its nav item only appears for a
     viewer who may see patient names (the route 403s everyone else regardless). */
  const seesNames = Boolean(me?.capabilities?.sees_patient_names);
  /* AI costs is leadership-only (the three who track spend). The route 403s
     everyone else regardless; this just hides the link. Keys must match the
     COST_VIEWERS set in app/api/ai-costs/route.ts. */
  const canSeeCosts = ["khalid", "noman", "alsaeed"].includes(me?.person ?? "");

  function navLabel(text: string) {
    if (rail) return null;
    return (
      <div className="px-2 pb-[6px] pt-[10px] text-[10.5px] font-bold uppercase tracking-[.1em] text-ink-3">
        {text}
      </div>
    );
  }

  return (
    <aside
      className={`sticky top-0 z-50 flex h-screen shrink-0 flex-col border-r border-line-soft bg-surface transition-[width,transform] duration-200 ${
        rail ? "w-[70px]" : "w-[250px]"
      } max-[880px]:fixed max-[880px]:left-0 max-[880px]:top-0 max-[880px]:w-[250px] max-[880px]:shadow-pop ${
        mobileOpen ? "max-[880px]:translate-x-0" : "max-[880px]:-translate-x-[103%]"
      }`}
    >
      <div className={`flex items-center gap-[10px] pb-[14px] pt-[18px] ${rail ? "justify-center" : "px-4"}`}>
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-accent text-on-accent">
          <BeatIcon size={24} />
        </span>
        {rail ? null : (
          <span className="flex flex-col leading-[1.15]">
            <b className="serif text-[17px] font-normal text-title">
              <span className="ar">سليم</span> Saleem
            </b>
            <span className="text-[10.5px] font-semibold uppercase tracking-[.08em] text-ink-3">
              Command Center
            </span>
          </span>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-[10px] py-[6px]">
        {navLabel("Workspace")}
        {WORKSPACE_NAV.map((entry) => (
          <NavItem key={entry.href} {...entry} collapsed={rail} onNavigate={onCloseMobile} />
        ))}
        {seesNames ? (
          <NavItem
            href="/provider-board"
            label="Provider board"
            icon={Building2}
            collapsed={rail}
            onNavigate={onCloseMobile}
          />
        ) : null}
        {navLabel("Manage")}
        {MANAGE_NAV.map((entry) => (
          <NavItem key={entry.href} {...entry} collapsed={rail} onNavigate={onCloseMobile} />
        ))}
        {canSeeCosts ? (
          <NavItem
            href="/ai-costs"
            label="AI costs"
            icon={Coins}
            collapsed={rail}
            onNavigate={onCloseMobile}
          />
        ) : null}
        {isAdmin ? (
          <>
            {navLabel("Admin")}
            <NavItem
              href="/admin"
              label="Users"
              icon={Users}
              collapsed={rail}
              onNavigate={onCloseMobile}
            />
          </>
        ) : null}
      </nav>

      <div className="border-t border-line-soft p-[10px]">
        <PersonMenu collapsed={rail} />
        <LogoutButton collapsed={rail} />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`flex w-full cursor-pointer items-center gap-[11px] rounded-[10px] px-[10px] py-2 text-[12.5px] font-medium text-ink-3 hover:bg-accessible-soft hover:text-title max-[880px]:hidden ${
            rail ? "justify-center px-0" : ""
          }`}
        >
          <ChevronLeft
            strokeWidth={1.8}
            className={`h-4 w-4 ${rail ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {rail ? <span className="sr-only">Expand</span> : <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";

/* One sidebar navigation entry. Mirrors .nav button from the approved
   mockup. Active state: accessible-soft background, 3px accent inset bar,
   title color. Links preserve the current ?as= param so view-as survives
   navigation. Uses useSearchParams, so the nearest ancestor must provide a
   Suspense boundary (AppShell wraps the Sidebar in one). */

type NavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  /* Icon-rail mode: hide the label and center the icon. */
  collapsed?: boolean;
  /* Called on click so the mobile drawer can close. */
  onNavigate?: () => void;
};

export function NavItem({ href, label, icon: Icon, collapsed = false, onNavigate }: NavItemProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as");
  const active = pathname === href;
  const target = viewAs ? `${href}?as=${encodeURIComponent(viewAs)}` : href;

  return (
    <Link
      href={target}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex w-full items-center gap-[11px] rounded-[10px] text-[13.5px] ${
        collapsed ? "justify-center px-0 py-[11px]" : "px-[10px] py-[9px]"
      } ${
        active
          ? "bg-accessible-soft font-semibold text-title shadow-[inset_3px_0_0_var(--accent)]"
          : "font-medium text-ink-2 hover:bg-accessible-soft hover:text-title"
      }`}
    >
      <Icon strokeWidth={1.8} className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </Link>
  );
}

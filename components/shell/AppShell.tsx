"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

import { PulseStrip } from "@/components/shell/PulseStrip";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/* App frame per 02 section 5.1: sidebar plus a main column whose sticky top
   zone holds the topbar and the heartbeat strip. Owns the desktop rail
   collapse and the mobile drawer (scrim plus Escape). Content is capped at
   1460px; the 12-column grid helpers live in components/shell/Grid.tsx so
   server components can import them too. */

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  /* Escape closes the mobile drawer per 02 section 9. Menus and the urgent
     drawer handle their own Escape where their state lives. */
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen w-full">
      <div
        aria-hidden="true"
        onClick={closeMobile}
        className={`fixed inset-0 z-[45] bg-trust-ink/45 transition-opacity duration-200 ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* NavItem and PersonMenu read search params, so the sidebar needs a
          Suspense boundary. The fallback keeps the column width stable. */}
      <Suspense
        fallback={
          <aside className="sticky top-0 z-50 h-screen w-[250px] shrink-0 border-r border-line-soft bg-surface max-[880px]:hidden" />
        }
      >
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          onCloseMobile={closeMobile}
        />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 bg-bg">
          <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
          <Suspense fallback={null}>
            <PulseStrip />
          </Suspense>
        </div>
        <main className="mx-auto w-full max-w-[1460px] px-6 pb-14 pt-2 max-[880px]:px-4">
          {children}
        </main>
      </div>
    </div>
  );
}

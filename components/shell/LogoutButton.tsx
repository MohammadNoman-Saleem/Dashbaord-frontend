"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/* Sidebar footer sign-out. Posts to the backend logout (which clears the
   saleem_session cookie), drops the cached viewer and data so the next person
   starts clean, and returns to the login page. Styled to match the Collapse
   row. Shown on mobile too, unlike Collapse. */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

type LogoutButtonProps = {
  /* Icon-rail mode: only the icon shows. */
  collapsed?: boolean;
};

export function LogoutButton({ collapsed = false }: LogoutButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });
    } catch {
      // Network hiccup: still clear locally and head to login. The cookie is
      // httpOnly so it can only be cleared server-side, but the login page and
      // middleware will send the user back through sign-in either way.
    } finally {
      queryClient.clear();
      router.replace("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      aria-label="Sign out"
      className={`flex w-full cursor-pointer items-center gap-[11px] rounded-[10px] px-[10px] py-2 text-[12.5px] font-medium text-ink-3 hover:bg-accessible-soft hover:text-title ${
        collapsed ? "justify-center px-0" : ""
      }`}
    >
      <LogOut strokeWidth={1.8} className="h-4 w-4 shrink-0" aria-hidden="true" />
      {collapsed ? <span className="sr-only">Sign out</span> : <span>Sign out</span>}
    </button>
  );
}

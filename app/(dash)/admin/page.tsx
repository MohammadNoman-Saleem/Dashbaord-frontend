"use client";

// User administration (spec 02 section 8.7): admin-only. Lists every account
// with role, department, last sign-in, and whether a reset is pending, and
// offers "Reset password" and "Add user". Both write through the admin API,
// which evaluates the REAL signed-in viewer (?as= never grants this) and
// refuses the MCP service key outright; this page also gates itself on the
// real role and sends non-admins back to the Command Center.
//
// Temporary passwords are generated server-side and returned ONCE. The page
// shows the secret once for the admin to copy and hand over out of band; it
// is never stored, logged, or re-fetchable.

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AdminUsersCard } from "@/components/admin/AdminUsersCard";
import { Grid, spans } from "@/components/shell/Grid";
import type { AdminUserRow } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer } from "@/lib/viewer";

function AdminContent() {
  const router = useRouter();
  const { me, isLoading } = useViewer();
  const isAdmin = me?.role === "admin";

  /* Non-admins never see the nav item, but a typed-in URL still lands here;
     send them home. The API refuses the data regardless. */
  useEffect(() => {
    if (!isLoading && me && !isAdmin) {
      router.replace("/");
    }
  }, [isLoading, me, isAdmin, router]);

  const usersQuery = useQuery({
    queryKey: qk.adminUsers(),
    queryFn: () => fetchEnvelope<AdminUserRow[]>("admin_users", "/admin/users"),
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">Users</h2>
        <p className="text-[13.5px] text-ink-2">
          Accounts, roles, and password resets. Admins only.
        </p>
      </div>
      <Grid>
        <div className={spans.c12}>
          <AdminUsersCard query={usersQuery} />
        </div>
      </Grid>
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminContent />
    </Suspense>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import { Providers } from "@/lib/api/queryClient";

/* Layout for the auth routes. Deliberately minimal: no AppShell, no viewer,
   just the query client and the toast stack, with the content centered on
   the page background. Fonts and the theme bootstrap come from the root
   layout, so light and dark both work here. */

export const metadata: Metadata = {
  title: "Sign in · Saleem",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <ToastProvider>
        <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
          {children}
        </main>
      </ToastProvider>
    </Providers>
  );
}

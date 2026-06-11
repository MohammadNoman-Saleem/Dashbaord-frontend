import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { Providers } from "@/lib/api/queryClient";
import { ViewerProvider } from "@/lib/viewer";

/* Layout for every dashboard route. The /gallery route stays outside this
   group on purpose, so it renders without the shell. Provider order:
   QueryClient first (ViewerProvider fetches /api/me through it), then the
   viewer, then toasts, then the shell.

   The Suspense boundary sits above ViewerProvider because it reads the
   ?as= search param, and prerendering requires a boundary above any
   useSearchParams call. The bg-bg fallback keeps the first paint calm. */

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <ViewerProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </ViewerProvider>
      </Suspense>
    </Providers>
  );
}

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/* Client-side providers for the root layout. One QueryClient per browser
   session, created lazily inside state so a re-render never rebuilds it.
   Defaults: data is fresh for 60 seconds, unused queries are garbage
   collected after 30 minutes. */

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

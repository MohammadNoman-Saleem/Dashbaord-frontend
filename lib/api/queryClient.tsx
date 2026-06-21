"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api/fetcher";

/* Client-side providers for the root layout. One QueryClient per browser
   session, created lazily inside state so a re-render never rebuilds it.
   Defaults: data is fresh for 60 seconds, unused queries are garbage
   collected after 30 minutes.

   Global 401 handling: a session can expire mid use, and that surfaces as a
   401 on whichever query or mutation fires next, not only on /api/me. The
   QueryCache and MutationCache onError hooks generalize the single me query
   redirect (lib/viewer.tsx) so any 401 sends the user to /login instead of
   leaving them stranded on a half loaded screen. This runs outside React
   render, so it uses a location redirect rather than the router, and guards
   against a redirect loop when the user is already on /login. */

const LOGIN_PATH = "/login";

function redirectToLoginOn401(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  // Outside the browser (SSR) there is nothing to redirect.
  if (typeof window === "undefined") return;
  // Already on the login page: do nothing, so a 401 there cannot loop.
  if (window.location.pathname === LOGIN_PATH) return;
  window.location.replace(LOGIN_PATH);
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => redirectToLoginOn401(error),
    }),
    mutationCache: new MutationCache({
      onError: (error) => redirectToLoginOn401(error),
    }),
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

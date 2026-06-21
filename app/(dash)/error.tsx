"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";

/* Error boundary for the dashboard route group. Catches uncaught render
   errors in any dashboard page and shows a calm, honest fallback with a
   retry action. Severity lives in the words, not in color. */

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-line bg-surface px-6 py-7 text-center shadow-card">
        <h2 className="text-[18px] text-title">This view did not load</h2>
        <p className="mt-2 text-[13.5px] text-ink-2">
          Something went wrong while loading this page. The rest of the
          dashboard is unaffected. Try again, and if it keeps failing, let the
          team know.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-ink-3">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex justify-center">
          <Button onClick={() => unstable_retry()}>Try again</Button>
        </div>
      </div>
    </div>
  );
}

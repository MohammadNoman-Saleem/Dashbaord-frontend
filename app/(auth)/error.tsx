"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";

/* Error boundary for the auth route group. Catches uncaught render errors on
   the sign in page and shows a plain fallback with a retry action. */

export default function AuthError({
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
    <div className="w-full max-w-[400px] rounded-card border border-line bg-surface px-6 py-7 text-center shadow-card">
      <h2 className="text-[18px] text-title">Sign in did not load</h2>
      <p className="mt-2 text-[13.5px] text-ink-2">
        Something went wrong while loading the sign in page. Try again, and if
        it keeps failing, let the team know.
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-ink-3">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-5 flex justify-center">
        <Button onClick={() => unstable_retry()}>Try again</Button>
      </div>
    </div>
  );
}

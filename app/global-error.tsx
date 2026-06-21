"use client";

import { useEffect } from "react";

import "./globals.css";

/* Root error boundary. This catches errors thrown by the root layout itself,
   so it must render its own html and body and cannot rely on the normal
   layout, fonts, or providers being present. It is intentionally the plainest
   fallback in the app: a short honest message and a retry action. */

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <h2 style={{ fontSize: "18px", margin: 0 }}>
            The dashboard could not load
          </h2>
          <p style={{ marginTop: "8px", fontSize: "14px", lineHeight: 1.5 }}>
            Something went wrong at the top level of the app. This is a serious
            failure that stops the whole page from rendering. Try again, and if
            it keeps failing, let the team know.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "12px", fontSize: "12px", opacity: 0.7 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "20px",
              cursor: "pointer",
              borderRadius: "10px",
              border: "1px solid currentColor",
              padding: "8px 16px",
              fontSize: "13px",
              background: "transparent",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

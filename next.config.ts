import type { NextConfig } from "next";

/* Security headers for every route. The point of the Content-Security-Policy
   here is the connect-src lock: the browser may only open connections to this
   app (the backend now lives in this app's own /api routes, so 'self' covers
   it), plus an optional separate API origin if NEXT_PUBLIC_API_BASE is set.
   The other directives are kept permissive enough that Next 16 and the app
   keep working (inline and eval are allowed for scripts because the Next
   runtime and the theme bootstrap script need them). */

/* Derive an extra API origin only if NEXT_PUBLIC_API_BASE points at a separate
   host. Empty/unset means same-origin, so connect-src 'self' is enough. We
   take just the origin so a value with a path still yields a clean source. */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE ?? "";
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

function contentSecurityPolicy(): string {
  const extra = apiOrigin();
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${extra ? ` ${extra}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

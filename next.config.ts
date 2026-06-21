import type { NextConfig } from "next";

/* Security headers for every route. The point of the Content-Security-Policy
   here is the connect-src lock: the browser may only open connections to this
   app and to the saleem-api origin, nothing else. The other directives are
   kept permissive enough that Next 16 and the app keep working (inline and
   eval are allowed for scripts because the Next runtime and the theme
   bootstrap script need them; tightening those would break rendering). */

/* Derive the API origin from NEXT_PUBLIC_API_BASE, the same env the fetcher
   reads, and fall back to the local default. We take just the origin so a
   value that includes a path still produces a clean connect-src source. */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

function contentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin()}`,
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

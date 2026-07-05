import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/* Edge auth gate for the dashboard. Runs on the Edge runtime, so it uses jose
   (edge-safe) NOT jsonwebtoken or @nestjs/jwt, and it NEVER touches the
   database or any lib/server/* module (those are Node-only). This is the first
   line of defense; real protection stays per endpoint where requireViewer
   re-verifies the token, applies the MCP path, hydrates the viewer from the DB,
   and resolves ?as=.

   What this does:
     - Stamps an x-request-id on every request (reusing a sane inbound one or
       minting a uuid) and echoes it on the response, so a failure is traceable.
       The id is a random uuid, never patient data.
     - For a protected route, reads the httpOnly saleem_session cookie and
       verifies its HS256 signature against JWT_SECRET via jose. Absent or
       invalid: bounce to /login, preserving the requested path. Valid: let it
       through and the server has the final say.

   Next.js 16 note: the old "middleware" file convention is renamed to "proxy".
   This file uses the current proxy convention. The matcher already excludes the
   public surfaces, so any path reaching this function is a protected route. */

const SESSION_COOKIE = "saleem_session";
const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

// JWT_SECRET is a server-only secret (never NEXT_PUBLIC_). It is read here from
// the edge process env; the deploy must provision it for the edge runtime too.
// Encoded once per module load.
function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // No silent dev fallback: an unset secret means every verify fails closed,
    // so unauthenticated requests are bounced to /login rather than admitted.
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

function resolveRequestId(request: NextRequest): string {
  const inbound = request.headers.get(REQUEST_ID_HEADER);
  if (inbound && SAFE_REQUEST_ID.test(inbound)) return inbound;
  return crypto.randomUUID();
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    // Expired, tampered, or signed with a different secret: treat as absent.
    return false;
  }
}

function redirectToLogin(request: NextRequest, requestId: string) {
  const loginUrl = new URL("/login", request.nextUrl);
  const res = NextResponse.redirect(loginUrl);
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

/* CORS for the /api routes so the Chrome extension's service worker can call
   them cross-origin. The extension authenticates with `Authorization: Bearer
   <jwt>`, NOT a cookie, so there is no Access-Control-Allow-Credentials and no
   cookie ever rides a cross-origin request. Same-origin app requests carry no
   Origin header and pass straight through. The per-route requireViewer is still
   the real auth check; this only adds the response headers a browser needs to
   let the extension read the reply. */
const CORS_METHODS = "GET, POST, DELETE, OPTIONS";
const CORS_HEADERS = "authorization, content-type, x-request-id, x-mcp-key";

function corsAllowlist(): string[] {
  const raw = process.env.CORS_ORIGINS ?? "http://localhost:3000";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  if (corsAllowlist().includes(origin)) return true;
  // ponytail: private single-user tool, so any unpacked extension origin is
  // trusted here. Pin the extension id in CORS_ORIGINS before shared/prod use.
  return origin.startsWith("chrome-extension://");
}

function handleApiCors(request: NextRequest): NextResponse {
  const origin = request.headers.get("origin");
  // No Origin (same-origin app calls) or a disallowed one: leave it alone.
  if (!origin || !isAllowedOrigin(origin)) return NextResponse.next();

  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Max-Age": "86400",
  };

  // Preflight is answered here and never reaches the route.
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

export async function proxy(request: NextRequest) {
  // /api is not part of the page-auth gate (each Node route runs requireViewer);
  // here it only gets CORS so the extension can call it. Never redirect /api.
  if (request.nextUrl.pathname.startsWith("/api")) {
    return handleApiCors(request);
  }

  const requestId = resolveRequestId(request);

  const ok = await hasValidSession(request).catch(() => false);
  if (!ok) {
    return redirectToLogin(request, requestId);
  }

  // Session valid: let the request through with the request id threaded so the
  // route handler and any 5xx log can echo it. The server still re-verifies.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export const config = {
  // Run on every path EXCEPT the public surfaces. The auth routes
  // (/api/auth/*) and /login must stay reachable while signed out; the rest of
  // /api is protected by requireViewer per route, so the edge gate skips /api
  // entirely (it cannot read JWT_SECRET-derived viewer state anyway) and lets
  // each Node route do the real check. Static assets and the gallery render
  // without the shell.
  matcher: [
    "/((?!api|login|_next/static|_next/image|gallery|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    // Also run on /api, but only for CORS (handleApiCors); the page-auth gate
    // above skips /api. Kept as a separate entry so the negative lookahead that
    // excludes /api from the page gate stays untouched.
    "/api/:path*",
  ],
};

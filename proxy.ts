import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/* Route guard for the dashboard. This is a PRESENCE CHECK only, defense in
   depth, NOT authentication. The saleem_session cookie is httpOnly, so neither
   this proxy nor any browser code can read or validate its contents; all it can
   tell is whether the cookie exists. Real protection stays per endpoint on
   saleem-api, which validates the session on every request.

   What this buys us: an unauthenticated visitor who lands on a dashboard URL is
   sent to /login before the shell renders, so no authenticated shell paints and
   no PII bearing queries fire. A request that carries the cookie is allowed
   through and the server has the final say.

   Next.js 16 note: the old "middleware" file convention is deprecated and
   renamed to "proxy". This file uses the current proxy convention so the build
   does not emit a deprecation warning. Behavior is identical to middleware. */

const SESSION_COOKIE = "saleem_session";

export function proxy(request: NextRequest) {
  // The matcher already excludes /login, api, and static assets, so any path
  // that reaches this function is a dashboard route. If the session cookie is
  // absent, bounce to /login and preserve the requested path so a future
  // enhancement could send the visitor back where they came from.
  if (!request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Cookie present: let the request through. The server still validates it.
  return NextResponse.next();
}

export const config = {
  // Run on every path EXCEPT:
  //   login            the sign in page, which must stay reachable while signed out
  //   api              never proxied; the browser talks to saleem-api directly
  //   _next/static     build assets
  //   _next/image      the image optimizer
  //   favicon / icons  metadata files
  //   gallery          the component gallery, which renders without the shell
  // The trailing file extension exclusion keeps any other static asset out.
  matcher: [
    "/((?!login|api|_next/static|_next/image|gallery|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

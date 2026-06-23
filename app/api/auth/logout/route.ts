// POST /api/auth/logout
// Public sign-out. Ports the NestJS backend AuthController.logout
// (src/auth/auth.controller.ts). PUBLIC: the proxy matcher already excludes
// /api/auth, so this route does NOT resolve a viewer; clearing a cookie needs
// no identity. It clears the saleem_session cookie and returns
// { signed_out: true }.
//
// The clear reuses the EXACT attributes login set (httpOnly, secure in
// production, sameSite 'lax', path '/'), because some browsers only remove a
// cookie when the clear matches the original attributes. The cookie is cleared
// via the Next cookies() store, whose mutations are applied to the response
// handler() emits.
//
// SERVER ONLY: runtime 'nodejs' (getEnv() reads NODE_ENV for the secure flag).
import { cookies } from 'next/headers';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { SESSION_COOKIE } from '@/lib/server/auth/requireViewer';
import { sessionCookieAttrs } from '@/lib/server/services/auth';

export const runtime = 'nodejs';

export const POST = handler(async () => {
  const store = await cookies();
  // Clear with the same attributes the cookie was set with, value emptied and
  // maxAge 0 so the browser drops it immediately.
  store.set(SESSION_COOKIE, '', {
    ...sessionCookieAttrs(),
    maxAge: 0,
  });

  return withMeta({ signed_out: true });
});

// POST /api/auth/login
// Public sign-in. Ports the NestJS backend AuthController.login
// (src/auth/auth.controller.ts). PUBLIC: the proxy matcher already excludes
// /api/auth, so this route does NOT resolve a viewer. It validates the body,
// checks credentials, issues the session token, sets the saleem_session
// HttpOnly cookie, records the login, and returns { key, name, must_reset }.
//
// The class-validator LoginDto (@IsString username/password) is re-expressed
// as a zod schema at the route boundary. Invalid credentials return the SAME
// generic message in every case (no user enumeration), with the timing burn
// preserved in the service. Per the migration decision there is NO brute-force
// throttle here (deferred); the backend @Throttle decorator is intentionally
// dropped.
//
// Cookie attributes (httpOnly, secure in production, sameSite 'lax', path '/',
// maxAge 7d) match the backend's setSessionCookie. The cookie is set via the
// Next cookies() store, whose mutations are applied to the response handler()
// emits.
//
// SERVER ONLY (pg/argon2/jose via the service): runtime 'nodejs'.
import { cookies } from 'next/headers';
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { issueToken } from '@/lib/server/auth/auth';
import { SESSION_COOKIE } from '@/lib/server/auth/requireViewer';
import { recordLogin } from '@/lib/server/users';
import {
  validateCredentials,
  sessionCookieAttrs,
  SEVEN_DAYS_SECONDS,
} from '@/lib/server/services/auth';

export const runtime = 'nodejs';

// LoginDto: @IsString username, @IsString password. Re-expressed as zod.
const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const POST = handler(async (req) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');
  const { username, password } = parsed.data;

  const user = await validateCredentials(username, password);
  const token = await issueToken({
    sub: user.key,
    name: user.name,
    role: user.role,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    ...sessionCookieAttrs(),
    maxAge: SEVEN_DAYS_SECONDS,
  });

  await recordLogin(user.key);

  return withMeta({
    key: user.key,
    name: user.name,
    must_reset: user.must_reset,
  });
});

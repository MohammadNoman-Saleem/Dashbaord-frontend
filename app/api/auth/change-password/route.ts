// POST /api/auth/change-password
// Ports the NestJS backend AuthController.changePassword
// (src/auth/auth.controller.ts). The backend identifies the actor from the
// validated session (req.viewer, set by the global JwtAuthGuard) and then
// RE-VERIFIES the current password even inside a valid session, so a stolen
// session alone cannot rotate the password. Here the actor is resolved via
// ctx.requireViewer() (the route still lives under /api/auth, which the proxy
// matcher excludes, but it needs the session to know WHOSE password changes).
//
// Sequence, matching the backend plus the migration decision to refresh the
// session:
//   1. Resolve the viewer; reject service (MCP) sessions: they have no
//      password to change.
//   2. Validate the body (ChangePasswordDto: @IsString current_password,
//      @IsString @MinLength(10) new_password) via zod at the boundary.
//   3. Re-verify the current password against the stored hash (verbatim
//      validateCredentials by the viewer's own key).
//   4. Hash the new password and setPassword(), which also clears must_reset.
//   5. Issue a FRESH session token and reset the saleem_session cookie so the
//      old token does not outlive the rotation, then return { changed: true }.
//
// SERVER ONLY (pg/argon2/jose via the service and foundation): runtime
// 'nodejs'.
import { cookies } from 'next/headers';
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, UnauthorizedError } from '@/lib/server/errors';
import { issueToken } from '@/lib/server/auth/auth';
import { SESSION_COOKIE } from '@/lib/server/auth/requireViewer';
import { findByKey, setPassword } from '@/lib/server/users';
import {
  validateCredentials,
  hashPassword,
  sessionCookieAttrs,
  SEVEN_DAYS_SECONDS,
} from '@/lib/server/services/auth';

export const runtime = 'nodejs';

// ChangePasswordDto: @IsString current_password, @IsString @MinLength(10)
// new_password. Re-expressed as zod.
const ChangePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(10),
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  if (viewer.is_service) {
    throw new UnauthorizedError('Service sessions cannot change passwords.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = ChangePasswordSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');
  const { current_password, new_password } = parsed.data;

  // Re-verify the current password even inside a valid session.
  await validateCredentials(viewer.key, current_password);
  const hash = await hashPassword(new_password);
  await setPassword(viewer.key, hash);

  // Issue a fresh session so the rotated credential is reflected immediately
  // and the prior token does not outlive the change. The name/role come from
  // the freshly read row (setPassword cleared must_reset).
  const user = await findByKey(viewer.key);
  if (!user) {
    throw new UnauthorizedError('Your session expired. Sign in again.');
  }
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

  return withMeta({ changed: true });
});

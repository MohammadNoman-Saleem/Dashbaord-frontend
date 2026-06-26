// Auth domain service. Ports the business logic of the NestJS backend
// src/auth/auth.service.ts (AuthService.validateCredentials) into a plain
// async function. The token sign/verify and password hash/verify primitives
// already live in the foundation (lib/server/auth/auth.ts); this service holds
// only the credential-validation logic the auth routes share.
//
// validateCredentials is preserved VERBATIM from the backend: it burns a
// comparable hash when the user is missing so a missing user is timing-
// indistinguishable from a wrong password, verifies with the false-on-error
// path, and throws the SAME generic UnauthorizedError message in both the
// missing-user and wrong-password cases. The cookie attributes that login and
// logout must share are centralized here so logout clears with the exact
// attributes login set (some browsers only clear a matching cookie).
//
// SERVER ONLY (pg/argon2 via the foundation). Routes declare runtime 'nodejs'.
import { hashPassword, verifyPassword } from '@/lib/server/auth/auth';
import { findByKey, type UserRow } from '@/lib/server/users';
import { UnauthorizedError } from '@/lib/server/errors';

// Generic, non-enumerating credential error. Identical wording for a missing
// user and a wrong password so neither is distinguishable. Verbatim from the
// backend AuthService.validateCredentials.
const INVALID_CREDENTIALS = 'Wrong username or password.';

/**
 * Validate a username/password pair. Returns the user row on success; throws
 * UnauthorizedError with the generic message otherwise. Mirrors
 * AuthService.validateCredentials verbatim, including the timing burn for a
 * missing user.
 */
export async function validateCredentials(
  key: string,
  password: string,
): Promise<UserRow> {
  const user = await findByKey(key);
  if (!user) {
    // Burn comparable time so missing users are indistinguishable from wrong
    // passwords.
    await hashPassword(password);
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }
  const ok = await verifyPassword(user.password_hash, password);
  if (!ok) throw new UnauthorizedError(INVALID_CREDENTIALS);
  return user;
}

/** Re-export hashPassword so the change-password route imports one module. */
export { hashPassword };

// Session cookie lifetime: 7 days, matching the token expiry and the backend's
// SEVEN_DAYS_MS.
export const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/** The cookie attributes shared by setting and clearing the session cookie.
 *  Some browsers only clear a cookie when the clear matches the original
 *  attributes, so logout reuses these (httpOnly, secure, sameSite, path) for
 *  the session cookie to be reliably removed. Mirrors the backend
 *  AuthController.sessionCookieAttrs. `secure` is hardcoded true: the dashboard
 *  is always served over HTTPS on Vercel, so a misprovisioned env can never
 *  drop Secure on the auth session cookie. */
export function sessionCookieAttrs() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
  };
}

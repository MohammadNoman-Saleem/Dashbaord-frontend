// POST /api/auth/token
// Header-auth sibling of /api/auth/login for non-browser clients (the Chrome
// extension). Same credential check, but instead of setting the httpOnly
// saleem_session cookie it returns the signed session JWT in the body so the
// caller can store it and present it as `Authorization: Bearer <token>`. The
// cookie path cannot be used from a chrome-extension:// origin (SameSite=Lax).
//
// PUBLIC like /api/auth/login: no viewer is resolved here. Invalid credentials
// return the same generic message (no user enumeration), with the timing burn
// preserved inside validateCredentials. No brute-force throttle (matching login).
//
// SERVER ONLY (argon2/jose via the service): runtime 'nodejs'.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { issueToken } from '@/lib/server/auth/auth';
import {
  validateCredentials,
  SEVEN_DAYS_SECONDS,
} from '@/lib/server/services/auth';

export const runtime = 'nodejs';

const CredsSchema = z.object({
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
  const parsed = CredsSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');
  const { username, password } = parsed.data;

  const user = await validateCredentials(username, password);
  const token = await issueToken({
    sub: user.key,
    name: user.name,
    role: user.role,
  });
  // The token carries a 7-day expiry (auth.ts EXPIRY); surface it so the client
  // can refresh before it lapses.
  const expiresAt = new Date(
    Date.now() + SEVEN_DAYS_SECONDS * 1000,
  ).toISOString();

  return withMeta({
    token,
    expires_at: expiresAt,
    key: user.key,
    name: user.name,
    must_reset: user.must_reset,
  });
});

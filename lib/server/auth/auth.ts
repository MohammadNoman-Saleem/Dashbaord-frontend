// Auth primitives: session-token sign/verify (jose, HS256, JWT_SECRET, 7d) and
// password hash/verify (argon2id, Node runtime). Ported from the NestJS backend
// src/auth/auth.service.ts.
//
// The @Injectable AuthService (which wrapped @nestjs/jwt JwtService and the
// argon2 package) becomes plain async functions. @nestjs/jwt is replaced by
// jose (the same library the edge middleware uses, so sign/verify agree across
// edge and node). The argon2 package is replaced by @node-rs/argon2, whose
// hash(password) / verify(hash, password) match the original calls.
//
// SERVER ONLY. argon2 is Node-only (native addon); this module must never be
// imported from a client component or the edge middleware. The JWT secret is
// read from the validated env and is never NEXT_PUBLIC_-prefixed.
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../env';
import type { SessionClaims } from '../contracts';

// HS256 over the shared JWT_SECRET, 7-day expiry. Same algorithm, secret and
// lifetime the backend's JwtModule used so existing cookies remain valid.
const ALG = 'HS256';
const EXPIRY = '7d';

function secretKey(): Uint8Array {
  // getEnv() validates JWT_SECRET is present and >= 32 chars.
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

/** Sign a session token. Mirrors AuthService.issueToken. */
export async function issueToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secretKey());
}

/** Verify a session token and return its claims. Throws when the token is
 *  missing, malformed, tampered, or expired. Mirrors AuthService.verifyToken.
 *  Callers (requireViewer, the auth routes) translate the throw into an
 *  UnauthorizedError with the right plain-language message. */
export async function verifyToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secretKey(), {
    algorithms: [ALG],
  });
  return payload as unknown as SessionClaims;
}

/** Hash a password with argon2id (the library default). Mirrors
 *  AuthService.hashPassword. */
export async function hashPassword(password: string): Promise<string> {
  return argonHash(password);
}

/** Verify a password against its argon2 hash. Returns false on any verify
 *  error rather than throwing, matching the backend's
 *  .verify(...).catch(() => false). */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return argonVerify(passwordHash, password).catch(() => false);
}

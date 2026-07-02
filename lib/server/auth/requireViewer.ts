// Per-route viewer resolution. Ports the NestJS global JwtAuthGuard
// (src/auth/jwt-auth.guard.ts) into a helper each Node-runtime route calls.
//
// In the self-contained app there is no global guard: the edge middleware does
// presence/JWT-verify only (no DB on the edge), and this helper re-verifies on
// the Node runtime, applies the x-mcp-key service path, hydrates the viewer and
// its capabilities FRESH from the database (so a capability change applies on
// the next request), and resolves ?as= to viewed_person only when can_view_as.
//
// Order of acceptance (matching the guard):
//   1. x-mcp-key matching MCP_SERVICE_KEY (timing-safe): the service viewer
//      (never sees patient names, no view-as).
//   2. saleem_session cookie: verified JWT, viewer hydrated from the database,
//      ?as= resolved only when can_view_as.
// No valid auth throws UnauthorizedError, which handler() turns into a 401
// envelope with the plain-language message.
//
// SERVER ONLY (pg/argon2 via auth.ts and users.ts, node:crypto). The runtime
// must be 'nodejs'; never import from a client component or the edge middleware.
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '../env';
import { verifyToken } from './auth';
import { findByKey } from '../users';
import { UnauthorizedError } from '../errors';
import { MCP_VIEWER, type RequestViewer } from './viewer';

export const SESSION_COOKIE = 'saleem_session';
const MCP_KEY_HEADER = 'x-mcp-key';

// Constant-time compare that does not leak length via early return shape. A
// length mismatch still returns false, but only after a fixed comparison so the
// timing is not a usable oracle. Mirrors the guard's safeEqual.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Read one cookie value from a raw Cookie header without pulling in a parser.
// Returns null when the header or the named cookie is absent.
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

// Resolve the requested ?as= person from the request URL, or null.
function requestedAs(req: Request): string | null {
  try {
    const value = new URL(req.url).searchParams.get('as');
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

// The session JWT from an Authorization: Bearer header. This is the Chrome
// extension's auth path: the saleem_session cookie is SameSite=Lax and is not
// sent on a cross-origin chrome-extension:// fetch, so the extension stores the
// token (from POST /api/auth/token) and presents it here. Returns null when the
// header is absent or not a Bearer token.
function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

// Verify a session token (from the cookie OR the Bearer header) and hydrate the
// viewer FRESH from the database, resolving ?as= only when can_view_as. Returns
// null on any failure (invalid/expired token, unknown user). Shared by
// getViewer and requireViewer so the cookie and bearer paths are identical.
async function viewerFromToken(
  token: string,
  req: Request,
): Promise<RequestViewer | null> {
  let claims;
  try {
    claims = await verifyToken(token);
  } catch {
    return null;
  }

  // Capabilities ALWAYS come fresh from the DB, never from the token, so a
  // revoked capability takes effect on the next request.
  const user = await findByKey(claims.sub);
  if (!user) return null;

  const as = requestedAs(req);
  const viewedPerson = user.can_view_as && as ? as.toLowerCase() : user.key;

  return {
    key: user.key,
    name: user.name,
    role: user.role,
    department: user.department,
    sees_patient_names: user.sees_patient_names,
    can_view_as: user.can_view_as,
    can_edit_payout_rules: user.can_edit_payout_rules,
    viewed_person: viewedPerson,
    is_service: false,
  };
}

/** Resolve the viewer or return null when there is no valid auth. The MCP path
 *  and DB hydration are identical to requireViewer; only the no-auth outcome
 *  differs (null instead of a throw), for the rare route that treats an
 *  anonymous caller specially. Most routes call requireViewer. */
export async function getViewer(
  req: Request,
): Promise<RequestViewer | null> {
  const env = getEnv();

  const mcpKey = req.headers.get(MCP_KEY_HEADER);
  if (mcpKey && safeEqual(mcpKey, env.MCP_SERVICE_KEY)) {
    return MCP_VIEWER;
  }

  // Bearer header (extension) takes precedence over the cookie (browser app);
  // either carries the same signed session JWT.
  const token = bearerToken(req) ?? readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  return viewerFromToken(token, req);
}

/** Resolve the viewer or throw UnauthorizedError with the right plain-language
 *  message. Routes call this. The message distinguishes "never signed in" from
 *  "session expired" exactly as the guard did. */
export async function requireViewer(req: Request): Promise<RequestViewer> {
  const env = getEnv();

  const mcpKey = req.headers.get(MCP_KEY_HEADER);
  if (mcpKey && safeEqual(mcpKey, env.MCP_SERVICE_KEY)) {
    return MCP_VIEWER;
  }

  const token = bearerToken(req) ?? readCookie(req, SESSION_COOKIE);
  if (!token) throw new UnauthorizedError('Sign in to continue.');

  const viewer = await viewerFromToken(token, req);
  if (!viewer) {
    throw new UnauthorizedError('Your session expired. Sign in again.');
  }
  return viewer;
}

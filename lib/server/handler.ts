// The higher-order route wrapper. Replaces Nest's global EnvelopeInterceptor
// + EnvelopeExceptionFilter + requestIdMiddleware with one function each route
// composes. Ported from:
//   - src/common/envelope.interceptor.ts (brand-check / synthesize meta / sweep)
//   - src/common/envelope-exception.filter.ts (HttpError -> error envelope,
//     5xx scrub logging)
//   - src/common/request-id.middleware.ts (x-request-id thread + echo)
//
// What it does, per request:
//   1. Resolve/echo x-request-id (reuse a sane inbound id, else mint a uuid).
//   2. Resolve the viewer ONCE (non-throwing getViewer) so the privacy sweep
//      and the inner fn share one resolution. Protected routes call
//      ctx.requireViewer() for the throwing path with the right message.
//   3. Await the inner fn. Brand-check the result: a withMeta(...) return is
//      unwrapped; a raw return gets synthesized freshMeta.
//   4. Run the global patient-PII sweep with the RESOLVED viewer. When the
//      viewer lacks sees_patient_names (or there is no viewer), any PII key the
//      per-field gate missed is deep-deleted and the COUNT is logged (never a
//      value).
//   5. Catch a thrown HttpError into { data:null, meta:{ reliable:false,
//      error:{ message_plain } } } with the matching status; any other throw is
//      a 500 with the default message, its detail scrubbed and logged with the
//      request id, never sent to the client.
//   6. Return NextResponse.json(envelope, { status }) with x-request-id set.
//
// The privacy sweep here AND the per-field gate in each route are both required
// (NHRA): either alone is insufficient. See lib/server/privacy.ts.
//
// SERVER ONLY. Routes that use this declare export const runtime = 'nodejs'
// (it pulls in pg/argon2 via the viewer resolution).
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  type Envelope,
  type MetaDto,
  freshMeta,
  isBrandedEnvelope,
} from './envelope';
import {
  DEFAULT_ERROR_MESSAGE,
  HttpError,
  isHttpError,
  scrub,
} from './errors';
import { sweepPatientPii, viewerMustNotSeePii } from './privacy';
import { getViewer } from './auth/requireViewer';
import { UnauthorizedError } from './errors';
import type { RequestViewer } from './auth/viewer';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept only a sane inbound id (uuid/token shape, bounded length) so a client
// cannot inject log-breaking or oversized content via the header. Verbatim from
// the backend request-id middleware.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function resolveRequestId(req: Request): string {
  const inbound = req.headers.get(REQUEST_ID_HEADER);
  return inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
}

/** Context handed to every route fn. The viewer is resolved once (non-throwing);
 *  call requireViewer() on a protected route to get the throwing path with the
 *  correct plain-language message. */
export interface HandlerContext {
  /** The resolved viewer, or null when there is no valid auth. */
  viewer: RequestViewer | null;
  /** Correlation id for this request (echoed on the response). */
  requestId: string;
  /** Throw UnauthorizedError when there is no valid auth; else the viewer. */
  requireViewer: () => RequestViewer;
}

/** A route handler returns either a raw value (synthesized fresh meta) or a
 *  withMeta(...) branded envelope (its meta is honored). Throwing an HttpError
 *  yields the matching error envelope. */
export type RouteHandler = (
  req: Request,
  ctx: HandlerContext,
) => Promise<unknown> | unknown;

function buildErrorEnvelope(messagePlain: string): Envelope<null> {
  const meta: MetaDto = freshMeta();
  meta.reliable = false;
  meta.error = { message_plain: messagePlain };
  return { data: null, meta };
}

/**
 * Wrap a route fn. Use it as:
 *   export const GET = handler(async (req, ctx) => withMeta(data));
 * or for a raw read:
 *   export const GET = handler(async () => somePlainObject);
 */
export function handler(fn: RouteHandler) {
  return async function wrapped(req: Request): Promise<NextResponse> {
    const requestId = resolveRequestId(req);

    // Resolve the viewer once. getViewer never throws; it returns null when
    // there is no valid auth. Protected routes call ctx.requireViewer().
    let viewer: RequestViewer | null = null;
    try {
      viewer = await getViewer(req);
    } catch {
      // Viewer resolution must not itself break the envelope. Treat an
      // unexpected resolution failure as no viewer; the sweep still runs and a
      // protected route's requireViewer() will reject.
      viewer = null;
    }

    const ctx: HandlerContext = {
      viewer,
      requestId,
      requireViewer: () => {
        if (!viewer) throw new UnauthorizedError('Sign in to continue.');
        return viewer;
      },
    };

    try {
      const result = await fn(req, ctx);

      // Brand-check: honor a withMeta(...) envelope, else synthesize fresh meta.
      const envelope: Envelope<unknown> = isBrandedEnvelope(result)
        ? { data: result.data, meta: result.meta }
        : { data: result ?? null, meta: freshMeta() };

      // Global privacy sweep (defense-in-depth backstop). Runs with the
      // RESOLVED viewer; a missing or non-name-seeing viewer triggers it.
      if (viewerMustNotSeePii(viewer)) {
        const hits = { count: 0 };
        sweepPatientPii(envelope.data, hits);
        if (hits.count > 0) {
          // A per-field gate missed; the sweep saved the payload but the path
          // should be fixed. Log carries the count and request id only, never
          // any patient value.
          console.warn(
            `[req ${requestId}] privacy sweep removed ${hits.count} patient PII field(s) from ${req.method} ${new URL(req.url).pathname}`,
          );
        }
      }

      return jsonWithRequestId(envelope, 200, requestId);
    } catch (err) {
      const status = isHttpError(err) ? err.status : 500;
      const messagePlain = isHttpError(err)
        ? (err as HttpError).messagePlain
        : DEFAULT_ERROR_MESSAGE;

      if (status >= 500) {
        const detail =
          err instanceof Error ? (err.stack ?? err.message) : String(err);
        // Thread the correlation id; scrub emails/phones; never the client
        // payload. Patient names are kept out of logs at the call sites.
        let path = req.url;
        try {
          path = new URL(req.url).pathname;
        } catch {
          // keep req.url as-is if it is not a full URL
        }
        console.error(
          `[req ${requestId}] ${req.method} ${path} -> ${status}: ${scrub(detail)}`,
        );
      }

      return jsonWithRequestId(buildErrorEnvelope(messagePlain), status, requestId);
    }
  };
}

function jsonWithRequestId(
  body: Envelope<unknown>,
  status: number,
  requestId: string,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId },
  });
}

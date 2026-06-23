// Public liveness endpoint at /api/healthz. No session required (the edge gate
// excludes /api and this route does no viewer check). External uptime checks
// hit it; it also proves the foundation wiring boots: env validates, the pool
// connects, and the envelope serializes.
//
// Node runtime because it touches the pg pool (Node-only). Ported from the
// NestJS backend src/health/health.controller.ts.
import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/server/env';
import { getPool } from '@/lib/server/db';
import { withMeta } from '@/lib/server/envelope';

export const runtime = 'nodejs';
// Always run fresh; never serve a cached liveness result.
export const dynamic = 'force-dynamic';

const bootedAt = Date.now();

export async function GET() {
  const env = getEnv();

  let db = 'ok';
  try {
    await getPool().query('select 1');
  } catch {
    db = 'unreachable';
  }

  const body = withMeta({
    ok: true,
    status: db === 'ok' ? 'ok' : 'degraded',
    db,
    git_sha: env.GIT_SHA,
    uptime_s: Math.round((Date.now() - bootedAt) / 1000),
    jobs_enabled: env.JOBS_ENABLED,
  });

  return NextResponse.json(body);
}

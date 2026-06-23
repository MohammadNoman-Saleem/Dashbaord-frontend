// Shared pg Pool against the existing Supabase Postgres. Ported from the NestJS
// backend src/db/db.module.ts.
//
// The pool uses the service-role connection string; RLS does not apply to it.
// Every NEW table this repo creates ships with RLS enabled and no anon policy,
// because the legacy app's browser bundle carries the anon key.
//
// SERVER ONLY (pg is Node-only; never import from a client component). The Pool
// is pinned on globalThis so each warm serverless instance reuses one pool
// across requests and a dev hot reload does not leak pools. The self-contained
// app points DATABASE_URL at the transaction pooler (6543), so max stays small
// (each warm instance holds its own pool). No pool.end()/shutdown hook: the
// platform reclaims the instance and the pooler reclaims idle connections.
import { Pool } from 'pg';
import { getEnv } from './env';
// Importing init runs the cold-start ANTHROPIC_API_KEY strip once before any
// route that touches the DB (which is every authenticated route).
import './init';

const POOL_KEY = '__saleem_pg_pool__';

type GlobalWithPool = typeof globalThis & { [POOL_KEY]?: Pool };

export function getPool(): Pool {
  const g = globalThis as GlobalWithPool;
  if (!g[POOL_KEY]) {
    const env = getEnv();
    g[POOL_KEY] = new Pool({
      connectionString: env.DATABASE_URL,
      // Small per-instance ceiling: each warm serverless instance holds its own
      // pool against the shared transaction pooler.
      max: 5,
      // Supabase poolers require TLS but present a chain Node rejects by default.
      ssl: { rejectUnauthorized: false },
    });
  }
  return g[POOL_KEY];
}

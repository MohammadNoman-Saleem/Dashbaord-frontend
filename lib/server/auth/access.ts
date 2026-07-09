// Server-side assertion for the Financials view gate: throws ForbiddenError for
// anyone outside the Financials audience (defined by canSeeFinancials in
// lib/access.ts: the admin role, the CEO, and the finance analyst). Wraps the
// shared pure rule so the routes and the client stay in step. Used by every
// /api/financials/* and /api/payouts/* route (the commission tab lives at
// /financials?tab=commission).
//
// SERVER ONLY (throws the server error type). The pure rule it wraps is safe to
// import on the client from lib/access.ts.
import { ForbiddenError } from '../errors';
import { canSeeFinancials } from '@/lib/access';
import type { RequestViewer } from './viewer';

export function assertFinancialsAccess(viewer: RequestViewer): void {
  if (!canSeeFinancials(viewer.role, viewer.key)) {
    throw new ForbiddenError('You do not have access to Financials.');
  }
}

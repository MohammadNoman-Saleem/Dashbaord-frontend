// POST /api/write-gate/commit
//
// Apply a prepared change after the human confirmed it. The service does the
// real work and holds every guarantee: it refuses outright when
// WRITE_GATE_ENABLED is false (the hard cutover switch), enforces that only the
// viewer who prepared the intent may commit it, enforces the 10-minute intent
// TTL, re-reads the record and refuses with a conflict (409) if its
// Modified_Time moved since prepare, requires the confirmation count the change
// needs (1, or 2 for a move to Lost), writes via the write-scoped Zoho client,
// records the audit row (field KEYS only), and marks the intent committed.
// Committing the same logical change twice REPLAYS the first result with no
// second Zoho write (idempotency-key + partial-unique-index serializer; no
// pg_advisory_lock, serverless-pooler safe). Ported from the NestJS backend
// src/write-gate/write-gate.controller.ts (@Post('commit')).
//
// CAPABILITY GATE (assertPerson, plan constraint 6): the MCP service viewer
// (is_service) is rejected so no MCP caller can fire a write. The viewer is the
// REAL signed-in user; the service's actor check matches it against the
// intent's actor_user_id.
//
// The body is zod-validated at the route boundary (the NestJS CommitBodyDto:
// @IsString change_id, @IsInt @Min(0) confirmations).
//
// PRIVACY (NHRA): this route logs nothing; the service audits field KEYS and
// non-PII context only, never field values, a patient name, phone, or budget.
//
// SERVER ONLY: runtime 'nodejs' (the service pulls in pg and the Zoho write
// client through the foundation singletons).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { commit, type CommitInput } from '@/lib/server/services/write-gate';

export const runtime = 'nodejs';

// CommitBodyDto re-expressed as zod: change_id is a string; confirmations is a
// non-negative integer.
const CommitSchema = z.object({
  change_id: z.string(),
  confirmations: z.number().int().min(0),
});

/** Rejects the MCP service viewer: cockpit writes are confirmed by a person in
 *  the UI only (plan constraint 6). Inlined from the backend controller's
 *  assertPerson. */
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot make cockpit writes; they are confirmed by a person in the cockpit.',
    );
  }
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = CommitSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');

  const input: CommitInput = {
    change_id: parsed.data.change_id,
    confirmations: parsed.data.confirmations,
  };

  // The service re-checks WRITE_GATE_ENABLED, the actor, the TTL, the
  // confirmation count, the concurrency anchor, and idempotency.
  const result = await commit(viewer, input);
  return withMeta(result);
});

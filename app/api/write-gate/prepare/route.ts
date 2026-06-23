// POST /api/write-gate/prepare
//
// Validate a proposed Zoho CRM change, capture the record's current
// Modified_Time, compute the plain-language change list, persist a pending
// intent, and return a short-lived change_id. Writes NOTHING to Zoho. May run
// while writes are off (WRITE_GATE_ENABLED false), for testing: only commit is
// gated on the flag. Ported from the NestJS backend
// src/write-gate/write-gate.controller.ts (@Post('prepare')).
//
// CAPABILITY GATE (assertPerson, plan constraint 6): the gate is a human
// confirmed write in the UI only. The MCP service viewer (is_service) is
// rejected with a ForbiddenError so no MCP caller can drive a cockpit write.
// The viewer is the REAL signed-in user (never the ?as= person); the service
// enforces that only that same viewer may later commit the intent it prepared.
//
// The body is zod-validated at the route boundary (the NestJS PrepareBodyDto:
// @IsIn resourceType, @Matches Zoho-id resourceId, @IsObject change). The
// change is validated only as an object-with-a-kind here; its semantic
// validation (kind allowed, date shape, deal exists, stage transition legal)
// lives in the service, faithfully.
//
// PRIVACY (NHRA): this route logs nothing. The service audits field KEYS and
// non-PII context only; the change_list_text it stores for the confirm modal
// may carry dates/budget but never a patient name. The handler's global PII
// sweep is the backstop on the response.
//
// SERVER ONLY: runtime 'nodejs' (the service pulls in pg and the Zoho client
// through the foundation singletons).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { prepare, type PrepareInput } from '@/lib/server/services/write-gate';
import type { ProposedChange } from '@/lib/server/services/write-gate-changes';

export const runtime = 'nodejs';

// Verbatim from the backend controller: a Zoho record id is a 5-25 digit
// string. resourceId must match.
const ZOHO_ID = /^\d{5,25}$/;

// PrepareBodyDto re-expressed as zod. resourceType is the deal/lead enum;
// resourceId is a Zoho id; change is required to be an object carrying a string
// kind (the full ProposedChange shape is validated semantically in the
// service, matching the backend's @IsObject + in-service validation).
const PrepareSchema = z.object({
  resourceType: z.enum(['deal', 'lead']),
  resourceId: z
    .string()
    .regex(ZOHO_ID, 'resourceId must be a Zoho record id.'),
  change: z
    .object({ kind: z.string() })
    .passthrough(),
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
  const parsed = PrepareSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');

  const input: PrepareInput = {
    resourceType: parsed.data.resourceType,
    resourceId: parsed.data.resourceId,
    // The kind is validated here; the change as a whole is validated
    // semantically in the service against the ProposedChange vocabulary.
    change: parsed.data.change as unknown as ProposedChange,
  };

  const result = await prepare(viewer, input);
  return withMeta(result);
});

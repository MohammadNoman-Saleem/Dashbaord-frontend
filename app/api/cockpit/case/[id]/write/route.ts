// POST /api/cockpit/case/[id]/write
//
// Apply a cockpit CRM change to the case [id] (a deal/lead Zoho record) in ONE
// call: validate the change, write it straight to Zoho through the write-scoped
// client, and audit. This is the one-step replacement for the former two-step
// write gate (POST /write-gate/prepare then POST /write-gate/commit with a
// write_intents ledger). The controls under components/cockpit/ now post their
// change here in a single request, the same way notes and the board already
// write.
//
// GUARDS (kept from the old prepare/commit routes):
//   - runtime nodejs; ctx.requireViewer() (a signed-in person, or the service
//     key, both resolved fresh from the DB).
//   - assertPerson: the MCP service viewer (is_service) is rejected, so no MCP
//     caller can drive a cockpit write; writes are confirmed by a person in the
//     cockpit.
//   - WRITE_GATE_ENABLED: the whole write refuses while the flag is off (the
//     hard cutover switch), with the same plain-language message the old commit
//     route and the notes route use.
//   - the body is zod-validated at the boundary against the WriteGateChange
//     shape the controls send.
//
// CONVERT GUARD: convert_lead is the only non-idempotent create. The service
// re-reads the lead before converting and refuses with a 409 if it is already
// converted, so a double submission cannot create two deals. No ledger.
//
// PRIVACY (NHRA): this route logs nothing; the service audits field KEYS and
// non-PII context only, never field values, a patient name, phone, or budget.
// The handler's global PII sweep is the backstop on the response.
//
// SERVER ONLY: runtime 'nodejs' (the service pulls in pg and the Zoho write
// client through the foundation singletons).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { getEnv } from '@/lib/server/env';
import {
  applyChange,
  type ApplyChangeResult,
} from '@/lib/server/services/cockpit-write';
import type { ProposedChange } from '@/lib/server/services/write-gate-changes';

export const runtime = 'nodejs';

// A Zoho record id is a 5-25 digit string, the same shape the old prepare route
// enforced on resourceId.
const ZOHO_ID = /^\d{5,25}$/;

// The WriteGateChange shape the controls send, as a zod discriminated union on
// kind. The route validates the SHAPE here; the service does the semantic
// validation (date shape, allowed field, stage transition legal, lead status in
// the picklist) against the change vocabulary, exactly as before. The local
// schema keeps new types out of contract.ts / keys.ts (off-limits).
const ChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set_follow_up'), date: z.string() }),
  z.object({
    kind: z.literal('move_stage'),
    to_stage: z.string(),
    reason_for_loss: z.string().nullish(),
  }),
  z.object({
    kind: z.literal('stamp'),
    event: z.enum([
      'first_contact',
      'quotation_sent',
      'partner_quote_requested',
      'partner_more_time',
    ]),
  }),
  z.object({ kind: z.literal('send_first_contact') }),
  z.object({
    kind: z.literal('edit_field'),
    field: z.enum(['patient_budget', 'treatment_start', 'treatment_end']),
    value: z.string(),
  }),
  z.object({
    kind: z.literal('convert_lead'),
    pipeline: z.enum(['Treatment', 'Telemedicine']),
    stage: z.string(),
  }),
  z.object({ kind: z.literal('set_lead_status'), status: z.string() }),
  z.object({ kind: z.literal('set_lead_follow_up'), date: z.string() }),
  z.object({ kind: z.literal('park_lead'), reason: z.string() }),
]);

const WriteSchema = z.object({ change: ChangeSchema });

/** Rejects the MCP service viewer: cockpit writes are confirmed by a person in
 *  the UI only. Same guard as the old write-gate routes and the notes route. */
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot make cockpit writes; they are confirmed by a person in the cockpit.',
    );
  }
}

/** Read the case [id] segment from /api/cockpit/case/<id>/write (second to
 *  last). Mirrors the notes route's path-segment convention. */
function caseIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../case/<id>/write -> <id> is the segment before the trailing 'write'.
  return decodeURIComponent(segments[segments.length - 2] ?? '');
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Cockpit writes are confirmed by a person in the UI; the MCP service key
  // cannot fire a write.
  assertPerson(viewer);

  // The hard cutover switch. With the gate off the route refuses outright and
  // never reaches Zoho, the same pattern (and message shape) as before.
  if (!getEnv().WRITE_GATE_ENABLED) {
    throw new ForbiddenError(
      'Writes are turned off right now. Nothing was changed.',
    );
  }

  const resourceId = caseIdFromUrl(req.url);
  if (!ZOHO_ID.test(resourceId)) {
    throw new BadRequestError('Missing or malformed case id.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = WriteSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');

  const result: ApplyChangeResult = await applyChange(
    viewer,
    resourceId,
    parsed.data.change as ProposedChange,
  );
  return withMeta(result);
});

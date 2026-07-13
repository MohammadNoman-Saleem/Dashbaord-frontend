// /api/provider-board: GET the hospital-by-hospital board, POST a patient onto a
// hospital column. The board is a Supabase view over live Zoho reads (see
// lib/server/services/provider-board.ts).
//
// Access: reading and adding are open to every signed-in viewer. Patient names
// are gated per-field in the service (non-name-seers see anonymized references)
// and the global sweep is the backstop. Adding is by a Zoho reference (an
// internal id or a Zoho_ID); the name/phone patient search stays name-seer only.
// Writes are person-only (the MCP service viewer is rejected) and audited with
// ids and kind only, never a patient name.
//
// Node runtime: the service reaches Postgres through getPool() and the cached
// Zoho reads.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getProviderBoardService } from '@/lib/server/services/provider-board';
import type { RequestViewer } from '@/lib/server/auth/viewer';

export const runtime = 'nodejs';

// Rejects the MCP service viewer: the board is edited by a signed-in person.
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot edit the provider board; a person edits it in the cockpit.',
    );
  }
}

const addSchema = z.object({
  hospital_id: z.string().min(1),
  record_kind: z.enum(['lead', 'deal']).optional(),
  zoho_id: z.string().min(1),
});

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  // Reading the board is open to every signed-in viewer; patient names are gated
  // per-field in the service and the global sweep strips them as a backstop.
  return withMeta(await getProviderBoardService().getBoard(viewer));
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = addSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Pick a hospital and a patient to add.');
  }

  const result = await getProviderBoardService().addReferral(
    viewer,
    parsed.data,
  );
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'provider_board.add',
    entity_type: 'provider_referrals',
    entity_id: result.id,
    after: {
      hospital_id: parsed.data.hospital_id,
      record_kind: result.record_kind,
      zoho_id: result.zoho_id,
    },
  });
  return withMeta(result);
});

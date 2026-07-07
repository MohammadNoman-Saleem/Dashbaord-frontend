// POST /api/events/whatsapp
//
// Ingest a batch of the active WhatsApp chat's trailing messages from the
// extension. The service matches the chat phone to a Zoho lead/deal, triages,
// dedupes on the WhatsApp message id, and auto-resolves messages she already
// replied to. Writes to our own Postgres only, so this is NOT WRITE_GATE gated.
//
// PRIVACY (NHRA): the phone arrives in the body (never the query string) so it
// stays out of request logs, like /api/cockpit/search. Message content can carry
// patient detail, so the route is name-seer gated and rejects the service key
// (a person's browser session is the only capture source). The response carries
// counts only, no content echo; the service audits counts only.
//
// SERVER ONLY: runtime 'nodejs'.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { ingestWhatsapp } from '@/lib/server/services/channel-events';

export const runtime = 'nodejs';

const IngestSchema = z.object({
  chat: z.object({ phone: z.string().min(7).max(20) }),
  messages: z
    .array(
      z.object({
        external_id: z.string().min(8).max(256),
        from_me: z.boolean(),
        ts: z.number().int().positive(),
        body: z.string().max(4000).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/** Rejects the MCP service viewer: capture comes from a person's browser. */
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError('The service key cannot ingest chat events.');
  }
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  // Message content is patient data: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to message capture.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = IngestSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');

  const result = await ingestWhatsapp(
    viewer,
    parsed.data.chat.phone,
    parsed.data.messages,
  );
  return withMeta(result);
});

// /api/whatsapp/templates: GET the editable WhatsApp template library, POST a
// new template. The library is a Supabase table the team manages in-app (see
// lib/server/services/whatsapp-template-library.ts). Templates carry no patient
// data; placeholders are rendered client-side at send time.
//
// Access: GET is open to any signed-in viewer (requireViewer). Writes are
// person-only (the MCP service viewer is rejected). The body is validated at the
// boundary and the write is audited with the new id only; the template body is
// NEVER logged.
//
// NOTE: this is the NEW plural /whatsapp/templates path. The legacy hardcoded
// first-contact greeting lives at /api/whatsapp/template/first_contact and is
// untouched.
//
// Node runtime: the service reaches Postgres through getPool().
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getWhatsappTemplateLibrary } from '@/lib/server/services/whatsapp-template-library';
import type { RequestViewer } from '@/lib/server/auth/viewer';

export const runtime = 'nodejs';

// Rejects the MCP service viewer: the library is edited by a signed-in person.
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The service key cannot edit the template library; a person edits it in the cockpit.',
    );
  }
}

const templateSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
});

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  const templates = await getWhatsappTemplateLibrary().list();
  return withMeta({ templates });
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
  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Enter a title and a message body.');
  }

  const result = await getWhatsappTemplateLibrary().create(
    parsed.data.title,
    parsed.data.body,
    viewer.key,
  );
  // Keys only: the template body is never logged.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'whatsapp_template.add',
    entity_type: 'whatsapp_templates',
    entity_id: result.id,
    after: null,
  });
  return withMeta(result);
});

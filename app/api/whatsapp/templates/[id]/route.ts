// PATCH  /api/whatsapp/templates/:id -> edit a template's title and body
// DELETE /api/whatsapp/templates/:id -> soft-remove a template
// Both write over the Supabase whatsapp_templates table (see
// lib/server/services/whatsapp-template-library.ts).
//
// Access: person-only (the MCP service viewer is rejected). The :id segment is
// validated as a UUID at the boundary; the PATCH body is validated like the POST
// route. Each write is audited with the id only; the template body is NEVER
// logged. Templates carry no patient data.
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
      'The service key cannot edit the template library.',
    );
  }
}

// whatsapp_templates ids are gen_random_uuid() v4, like the provider board.
const idSchema = z.string().uuid();

const templateSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
});

/** Pull and validate the [id] segment from /api/whatsapp/templates/<id>. */
function templateId(req: Request): string {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const raw = decodeURIComponent(segments[segments.length - 1] ?? '');
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('That template id is not valid.');
  }
  return parsed.data;
}

export const PATCH = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  const id = templateId(req);

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

  const result = await getWhatsappTemplateLibrary().update(
    id,
    parsed.data.title,
    parsed.data.body,
  );
  // Keys only: the template body is never logged.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'whatsapp_template.edit',
    entity_type: 'whatsapp_templates',
    entity_id: result.id,
    after: null,
  });
  return withMeta(result);
});

export const DELETE = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  const id = templateId(req);

  const result = await getWhatsappTemplateLibrary().remove(id);
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'whatsapp_template.remove',
    entity_type: 'whatsapp_templates',
    entity_id: result.id,
    after: null,
  });
  return withMeta(result);
});

// GET /api/whatsapp/template/first_contact -> the fixed first-contact template
// copy backing the cockpit send-and-log preview. Ported from the NestJS
// WhatsappController.firstContactTemplate (@Get('template/first_contact')).
//
// Read-only policy and copy: returns the fixed, non-clinical first-contact
// greeting so the case manager can see exactly what will be sent. No write, no
// patient data, no assertPerson; any authenticated viewer may read it (the
// service/MCP viewer included). The handler's global sweep still runs but has
// nothing patient-shaped to remove.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { FIRST_CONTACT_TEMPLATE } from '@/lib/server/services/whatsapp-templates';

// Node runtime: requireViewer() resolves the viewer via pg/argon2.
export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  return withMeta({
    id: FIRST_CONTACT_TEMPLATE.id,
    text: FIRST_CONTACT_TEMPLATE.text,
  });
});

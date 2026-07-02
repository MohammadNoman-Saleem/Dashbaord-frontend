// POST /api/it-support - raises an IT helpdesk ticket as a Zoho Projects task
// in the IT project, routed to the category tasklist with the priority owners
// and an SLA due date.
//
// A Zoho WRITE: gated behind WRITE_GATE_ENABLED (refuses outright when off),
// refuses the MCP service viewer (is_service -> ForbiddenError), evaluates the
// REAL signed-in person, and audits. The audit row carries the ticket title,
// category, priority, and assignees (operational fields), never patient values.
//
// The body is { title, description?, category, priority }, zod-validated at the
// boundary. Returns ItSupportTicketData.
//
// Node runtime: the service writes Zoho Projects and reads the users table.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getEnv } from '@/lib/server/env';
import { getAudit } from '@/lib/server/audit';
import type { RequestViewer } from '@/lib/server/auth/viewer';
import { itSupport } from '@/lib/server/services/it-support';
import {
  IT_HELPDESK_CATEGORIES,
  IT_HELPDESK_PRIORITIES,
} from '@/lib/server/services/board-config';

export const runtime = 'nodejs';

const CreateTicketSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(IT_HELPDESK_CATEGORIES as [string, ...string[]]),
  priority: z.enum(IT_HELPDESK_PRIORITIES as [string, ...string[]]),
});

// Zoho writes act for a person; the service key reads but never raises tickets.
function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError('The service key cannot raise IT tickets.');
  }
}

// The hard cutover switch: IT ticket writes refuse outright while it is off.
function assertWritesEnabled(): void {
  if (!getEnv().WRITE_GATE_ENABLED) {
    throw new ForbiddenError(
      'IT ticketing is turned off right now. The ticket was not created.',
    );
  }
}

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);
  assertWritesEnabled();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Send a JSON body.');
  }
  const parsed = CreateTicketSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid ticket.');
  }
  const body = parsed.data;

  const data = await itSupport.createTicket({
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    category: body.category,
    priority: body.priority,
    submittedBy: viewer.key,
  });

  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'it_support.create',
    entity_type: 'zoho_tasks',
    entity_id: data.ticket_id ?? '(unknown)',
    after: {
      title: body.title.trim(),
      category: body.category,
      priority: body.priority,
      assigned_to: data.assigned_to,
    },
  });

  return withMeta(data);
});

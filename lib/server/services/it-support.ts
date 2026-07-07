// IT helpdesk ticket creation. Raises a Zoho Projects task in the IT project,
// routed to the tasklist for the category and the owners for the priority, with
// a due date from the SLA. The submitter and the true priority ride in the
// description (Zoho records the OAuth client as the creator and has no Critical
// priority). Attachments are not supported over the app's OAuth; they are a
// later follow-up via file storage.
//
// SERVER ONLY. Node runtime (Zoho Projects write plus the users table).
import { getZohoProjectsWrite } from '../integrations/zoho/projects';
import { zpuidsByNames } from '../users';
import {
  IT_HELPDESK_ASSIGNMENTS,
  IT_HELPDESK_DEFAULT_TASKLIST,
  IT_HELPDESK_PRIORITY_MAP,
  IT_HELPDESK_SLA,
  IT_HELPDESK_TASKLISTS,
  IT_PROJECT,
} from './board-config';
import type { ItSupportTicketData } from '@/lib/api/contract';

export interface CreateItTicketInput {
  title: string;
  description: string;
  category: string;
  priority: string;
  submittedBy: string;
}

const HOUR_MS = 60 * 60 * 1000;

async function createTicket(
  input: CreateItTicketInput,
): Promise<ItSupportTicketData> {
  const sla = IT_HELPDESK_SLA[input.priority] ?? IT_HELPDESK_SLA.medium;
  const tasklist =
    IT_HELPDESK_TASKLISTS[input.category] ?? IT_HELPDESK_DEFAULT_TASKLIST;
  const owners = IT_HELPDESK_ASSIGNMENTS[input.priority] ?? [];
  const { resolved, unresolved } = await zpuidsByNames(owners);
  const assigned_to = owners.filter((name) => !unresolved.includes(name));
  const dueDate = new Date(Date.now() + sla.resolution_hours * HOUR_MS);

  const result = await getZohoProjectsWrite().createHelpdeskTicket({
    title: input.title,
    description: input.description,
    projectId: IT_PROJECT.id,
    tasklistId: tasklist.id,
    zohoPriority: IT_HELPDESK_PRIORITY_MAP[input.priority] ?? 'Medium',
    priorityLabel: sla.label,
    submittedBy: input.submittedBy,
    dueDate,
    assigneeZpuids: resolved,
  });

  return {
    ticket_id: result.taskId,
    assigned_to,
    due_at: dueDate.toISOString(),
    unresolved_owners: unresolved,
  };
}

export const itSupport = { createTicket };

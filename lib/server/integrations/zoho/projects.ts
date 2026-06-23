// Zoho Projects read and write paths, ported from the NestJS backend
// src/integrations/zoho/projects-read.service.ts and projects-write.service.ts.
// The @Injectable services (one with @Inject(ENV)) become globalThis-pinned
// singletons (g.__zohoProjectsRead, g.__zohoProjectsWrite) reading env via
// getEnv() and sharing the one ZohoAuthService from getZohoAuth().
//
// Read path quirks preserved exactly:
//   1. Zoho Projects answers 204 or an empty body when a project has no tasks;
//      res.json() would throw on it.
//   2. The API needs the numeric portal id, not the portal name. The portal id
//      is stable, so it is pinned here and the name lookup runs only when
//      ZOHO_PORTAL_NAME is set.
//   3. tasks/projects/tasklists paginate with index/range (range max 100); the
//      legacy range_from/range_to params 6832 here.
//
// Write path (SANCTIONED DEVIATION, pending Khalid and Al Saeed sign-off) rules:
//   1. Task dates go to Zoho as MM-dd-yyyy through formatZohoDate. ISO 8601 or
//      dd-MM-yyyy 6832s.
//   2. Status changes POST to /tasks/{id}/?custom_status=<status_id> empty body.
//   3. Task creation POSTs form-urlencoded to /projects/{id}/tasks/ with
//      tasklist_id in the body; the /tasklists/{id}/tasks/ URL is v2-only.
//   4. person_responsible takes comma-separated zpuids.
//   5. File attachments are impossible over self-client OAuth, so ticket
//      attachments are skipped.
// Every write caller must audit the write and act for a real signed-in person.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getEnv, type Env } from '../../env';
import { getZohoAuth, type ZohoAuthService } from './auth';

const PROJECTS_ROOT = 'https://projectsapi.zoho.com/restapi';

// The tellsaleemdotcom portal (legacy dashboard, verified live).
const DEFAULT_PORTAL_ID = '908222337';

export interface ZohoProjectTask {
  id?: number;
  id_string?: string;
  name?: string;
  completed?: boolean;
  end_date?: string;
  start_date?: string;
  created_time?: string;
  created_time_long?: number;
  last_updated_time?: string;
  last_updated_time_long?: number;
  description?: string;
  link?: { self?: { url?: string }; web?: { url?: string } };
  priority?: string;
  status?: { id?: number; id_string?: string; name?: string; type?: string };
  tasklist?: { id?: number; id_string?: string; name?: string };
  details?: {
    owners?: Array<{
      name?: string;
      full_name?: string;
      zpuid?: string | number;
      id?: string | number;
    }>;
  };
}

export interface ZohoTaskComment {
  id?: number;
  id_string?: string;
  content?: string;
  added_by?: string;
  added_person?: string;
  created_time?: string;
  created_time_long?: number;
}

interface CommentsPage {
  comments?: ZohoTaskComment[];
}

export interface ZohoPortalUser {
  name?: string;
  zpuid?: string | number;
  id?: string | number;
  id_string?: string;
}

interface TasksPage {
  tasks?: ZohoProjectTask[];
}

interface UsersPage {
  users?: ZohoPortalUser[];
}

interface PortalsPage {
  portals?: Array<{ id?: number; id_string?: string; name?: string }>;
}

export interface ZohoProject {
  id?: number;
  id_string?: string;
  name?: string;
  status?: string;
}

export interface ZohoTasklist {
  id?: number;
  id_string?: string;
  name?: string;
}

interface ProjectsPage {
  projects?: ZohoProject[];
}

interface TasklistsPage {
  tasklists?: ZohoTasklist[];
}

export class ZohoProjectsReadService {
  private portalId: string | null = null;

  constructor(
    private readonly auth: ZohoAuthService,
    private readonly env: Env,
  ) {}

  /** Up to `limit` tasks of one project. Paginates with index/range (range
   *  max 100); legacy range_from/range_to params are rejected with 6832. */
  async tasks(projectId: string, limit = 100): Promise<ZohoProjectTask[]> {
    const portalId = await this.resolvePortalId();
    const data = await this.get<TasksPage>(
      `portal/${portalId}/projects/${projectId}/tasks/`,
      {
        index: '1',
        range: String(Math.min(100, limit)),
      },
    );
    return data.tasks ?? [];
  }

  /** Every task of one project, paginated index/range (range max 100). maxTasks
   *  caps runaway projects. */
  async allTasks(
    projectId: string,
    maxTasks = 1000,
  ): Promise<ZohoProjectTask[]> {
    const portalId = await this.resolvePortalId();
    const pageSize = 100;
    const all: ZohoProjectTask[] = [];
    for (let index = 1; index <= maxTasks; index += pageSize) {
      const data = await this.get<TasksPage>(
        `portal/${portalId}/projects/${projectId}/tasks/`,
        { index: String(index), range: String(pageSize) },
      );
      const tasks = data.tasks ?? [];
      all.push(...tasks);
      if (tasks.length < pageSize) break;
    }
    return all;
  }

  /** One task's detail, or null when Zoho has nothing under that id. */
  async task(
    projectId: string,
    taskId: string,
  ): Promise<ZohoProjectTask | null> {
    const portalId = await this.resolvePortalId();
    const data = await this.get<TasksPage>(
      `portal/${portalId}/projects/${projectId}/tasks/${taskId}/`,
    );
    return data.tasks?.[0] ?? null;
  }

  /** The last ~`limit` comments on a task. Best-effort: returns [] when the
   *  comments scope is missing or Zoho has none. */
  async comments(
    projectId: string,
    taskId: string,
    limit = 10,
  ): Promise<ZohoTaskComment[]> {
    const portalId = await this.resolvePortalId();
    try {
      const data = await this.get<CommentsPage>(
        `portal/${portalId}/projects/${projectId}/tasks/${taskId}/comments/`,
      );
      const all = data.comments ?? [];
      return all.slice(-limit);
    } catch {
      return [];
    }
  }

  /** Every active+archived project in the portal, paginated index/range. */
  async projects(maxProjects = 500): Promise<ZohoProject[]> {
    const portalId = await this.resolvePortalId();
    const pageSize = 100;
    const all: ZohoProject[] = [];
    for (let index = 1; index <= maxProjects; index += pageSize) {
      const data = await this.get<ProjectsPage>(
        `portal/${portalId}/projects/`,
        {
          index: String(index),
          range: String(pageSize),
        },
      );
      const projects = data.projects ?? [];
      all.push(...projects);
      if (projects.length < pageSize) break;
    }
    return all;
  }

  /** Every tasklist of one project. flag=allflag returns completed lists too. */
  async tasklists(projectId: string, maxLists = 300): Promise<ZohoTasklist[]> {
    const portalId = await this.resolvePortalId();
    const pageSize = 100;
    const all: ZohoTasklist[] = [];
    for (let index = 1; index <= maxLists; index += pageSize) {
      const data = await this.get<TasklistsPage>(
        `portal/${portalId}/projects/${projectId}/tasklists/`,
        { index: String(index), range: String(pageSize), flag: 'allflag' },
      );
      const lists = data.tasklists ?? [];
      all.push(...lists);
      if (lists.length < pageSize) break;
    }
    return all;
  }

  /** Portal members, for resolving helpdesk assignee names to zpuids. */
  async portalUsers(): Promise<ZohoPortalUser[]> {
    const portalId = await this.resolvePortalId();
    const data = await this.get<UsersPage>(`portal/${portalId}/users/`);
    return data.users ?? [];
  }

  /** The resolved numeric portal id, shared with the write service so both
   *  paths address the same portal. */
  async portal(): Promise<string> {
    return this.resolvePortalId();
  }

  private async resolvePortalId(): Promise<string> {
    if (this.portalId) return this.portalId;
    if (!this.env.ZOHO_PORTAL_NAME) {
      this.portalId = DEFAULT_PORTAL_ID;
      return this.portalId;
    }
    const data = await this.get<PortalsPage>('portals/');
    const portals = data.portals ?? [];
    const wanted = this.env.ZOHO_PORTAL_NAME.toLowerCase();
    const match =
      portals.find((p) => p.name?.toLowerCase() === wanted) ?? portals[0];
    if (!match) {
      throw new Error('No portals found in the Zoho Projects account.');
    }
    this.portalId = String(match.id_string ?? match.id);
    return this.portalId;
  }

  private async get<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const token = await this.auth.accessToken();
    const url = new URL(`${PROJECTS_ROOT}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), {
      headers: { authorization: `Zoho-oauthtoken ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Zoho Projects error ${res.status} on ${path}: ${body}`);
    }

    // Empty body on zero results; JSON.parse would throw.
    if (res.status === 204) return {} as T;
    const text = await res.text();
    if (!text.trim()) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }
}

/** The single Zoho Projects date formatter: MM-dd-yyyy, nothing else.
 *  Anything else 6832s (see header write rule 1). */
export function formatZohoDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${mm}-${dd}-${date.getFullYear()}`;
}

export interface HelpdeskTicketInput {
  title: string;
  description: string;
  /** Project the ticket lands in (the IT project, from board config). */
  projectId: string;
  /** Tasklist id the ticket lands in (resolved by the caller from config). */
  tasklistId: string;
  /** Zoho priority value, already mapped (None/Low/Medium/High). */
  zohoPriority: string;
  /** Helpdesk priority key, encoded into the description (Zoho has no
   *  Critical). */
  priorityLabel: string;
  submittedBy: string;
  dueDate: Date;
  /** Resolved assignee zpuids; empty array creates an unassigned ticket. */
  assigneeZpuids: string[];
}

export interface HelpdeskTicketResult {
  projectId: string;
  taskId: string | null;
  raw: ZohoProjectTask | null;
}

interface TaskWriteResponse {
  tasks?: ZohoProjectTask[];
}

/** The board "Add task" inputs. owner/priority/due are optional; a due date
 *  arrives as YYYY-MM-DD from the form and is converted to Zoho's MM-dd-yyyy. */
export interface BoardCreateTaskInput {
  name: string;
  projectId: string;
  /** Optional: omit to land in the project's default tasklist. */
  tasklistId?: string | null;
  description?: string;
  /** Validated zpuid of the chosen owner, or null/undefined for unassigned. */
  ownerZpuid?: string | null;
  /** None/Low/Medium/High; None and empty are dropped, never sent. */
  priority?: string | null;
  /** YYYY-MM-DD from the form; converted to MM-dd-yyyy here. */
  dueDate?: string | null;
}

export class ZohoProjectsWriteService {
  constructor(
    private readonly auth: ZohoAuthService,
    private readonly reads: ZohoProjectsReadService,
  ) {}

  /** Moves a task to another status by status id (write rule 2). */
  async updateTaskStatus(
    projectId: string,
    taskId: string,
    statusId: string,
  ): Promise<void> {
    await this.post(
      `projects/${projectId}/tasks/${taskId}/?custom_status=${encodeURIComponent(statusId)}`,
      {},
    );
  }

  /** Reassigns a task to a new owner by zpuid. POST
   *  /tasks/{id}/?person_responsible=<zpuid> with an empty body. The caller
   *  validates the zpuid against the known users before calling. */
  async updateTaskOwner(
    projectId: string,
    taskId: string,
    zpuid: string,
  ): Promise<void> {
    await this.post(
      `projects/${projectId}/tasks/${taskId}/?person_responsible=${encodeURIComponent(zpuid)}`,
      {},
    );
  }

  /** Sets a task's priority (None/Low/Medium/High). POST
   *  /tasks/{id}/?priority=<value> with an empty body. */
  async updateTaskPriority(
    projectId: string,
    taskId: string,
    priority: string,
  ): Promise<void> {
    await this.post(
      `projects/${projectId}/tasks/${taskId}/?priority=${encodeURIComponent(priority)}`,
      {},
    );
  }

  /** Adds a comment to a task. POST /tasks/{id}/comments/ with a
   *  form-urlencoded content field. */
  async addComment(
    projectId: string,
    taskId: string,
    content: string,
  ): Promise<void> {
    await this.post(`projects/${projectId}/tasks/${taskId}/comments/`, {
      content,
    });
  }

  /** Creates a board task with the optional owner/priority/due the "Add task"
   *  form carries (write rules 3 and 4). */
  async createBoardTask(
    input: BoardCreateTaskInput,
  ): Promise<HelpdeskTicketResult> {
    const body: Record<string, string> = { name: input.name };
    if (input.description) body.description = input.description;
    if (input.tasklistId) body.tasklist_id = input.tasklistId;
    if (input.priority && input.priority !== 'None') {
      body.priority = input.priority;
    }
    if (input.dueDate) {
      // The form sends YYYY-MM-DD; build a local Date and reformat. Append a
      // midday time so a timezone shift cannot roll the date to the day before
      // when formatZohoDate reads its local components.
      body.end_date = formatZohoDate(new Date(`${input.dueDate}T12:00:00`));
    }
    if (input.ownerZpuid) body.person_responsible = input.ownerZpuid;

    const response = await this.post<TaskWriteResponse>(
      `projects/${input.projectId}/tasks/`,
      body,
    );
    const created = response.tasks?.[0] ?? null;
    const taskId = created
      ? String(created.id_string ?? created.id ?? '') || null
      : null;
    return { projectId: input.projectId, taskId, raw: created };
  }

  /** Creates a plain task in a project's tasklist (write rules 3 and 4). Used
   *  for Ops-type "Raise" items. The submitter rides in the description because
   *  Zoho records the OAuth client as the creator. */
  async createTask(input: {
    title: string;
    description: string;
    projectId: string;
    tasklistId: string;
    submittedBy: string;
  }): Promise<HelpdeskTicketResult> {
    const description = [
      `Submitted by: ${input.submittedBy || 'Unknown'}`,
      'Raised as: Ops item (mirrors a blocker for Aziz)',
      '',
      input.description || '',
    ].join('\n');

    const body: Record<string, string> = {
      name: input.title,
      description,
      tasklist_id: input.tasklistId,
    };

    const response = await this.post<TaskWriteResponse>(
      `projects/${input.projectId}/tasks/`,
      body,
    );
    const created = response.tasks?.[0] ?? null;
    const taskId = created
      ? String(created.id_string ?? created.id ?? '') || null
      : null;
    return { projectId: input.projectId, taskId, raw: created };
  }

  /** Creates an IT helpdesk ticket as a task (write rules 3 and 4). Attachments
   *  are NOT supported (write rule 5). */
  async createHelpdeskTicket(
    input: HelpdeskTicketInput,
  ): Promise<HelpdeskTicketResult> {
    const projectId = input.projectId;

    // Submitter and true priority ride in the description: Zoho records the
    // OAuth client as the creator and has no Critical priority.
    const description = [
      `Submitted by: ${input.submittedBy || 'Unknown'}`,
      `Priority: ${input.priorityLabel.toUpperCase()}`,
      '',
      input.description || '',
    ].join('\n');

    const body: Record<string, string> = {
      name: input.title,
      description,
      tasklist_id: input.tasklistId,
      priority: input.zohoPriority,
      end_date: formatZohoDate(input.dueDate),
    };
    if (input.assigneeZpuids.length > 0) {
      body.person_responsible = input.assigneeZpuids.join(',');
    }

    const response = await this.post<TaskWriteResponse>(
      `projects/${projectId}/tasks/`,
      body,
    );
    const created = response.tasks?.[0] ?? null;
    const taskId = created
      ? String(created.id_string ?? created.id ?? '') || null
      : null;
    return { projectId, taskId, raw: created };
  }

  /** Form-urlencoded POST, the only verb this service speaks. Error bodies
   *  surface field KEYS only, never values, so a 6832 can be narrowed to a
   *  field without leaking ticket text into logs. */
  private async post<T = Record<string, unknown>>(
    path: string,
    body: Record<string, string>,
  ): Promise<T> {
    const [token, portalId] = await Promise.all([
      this.auth.accessToken(),
      this.reads.portal(),
    ]);

    const res = await fetch(`${PROJECTS_ROOT}/portal/${portalId}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Zoho-oauthtoken ${token}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const bodyKeys = Object.keys(body).join(',');
      throw new Error(
        `Zoho Projects POST ${res.status} on ${path}: ${text} [body fields: ${bodyKeys}]`,
      );
    }

    // Zoho can answer 200 with an empty body on some writes.
    const text = await res.text();
    if (!text.trim()) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }
}

// globalThis-pinned singletons. The read service holds the resolved portal id
// across requests in one warm instance; the write service reuses that read
// singleton so both paths address the same portal and share the warm token.
const READ_KEY = '__zohoProjectsRead';
const WRITE_KEY = '__zohoProjectsWrite';

type GlobalWithZohoProjects = typeof globalThis & {
  [READ_KEY]?: ZohoProjectsReadService;
  [WRITE_KEY]?: ZohoProjectsWriteService;
};

export function getZohoProjectsRead(): ZohoProjectsReadService {
  const g = globalThis as GlobalWithZohoProjects;
  if (!g[READ_KEY]) {
    g[READ_KEY] = new ZohoProjectsReadService(getZohoAuth(), getEnv());
  }
  return g[READ_KEY];
}

export function getZohoProjectsWrite(): ZohoProjectsWriteService {
  const g = globalThis as GlobalWithZohoProjects;
  if (!g[WRITE_KEY]) {
    g[WRITE_KEY] = new ZohoProjectsWriteService(
      getZohoAuth(),
      getZohoProjectsRead(),
    );
  }
  return g[WRITE_KEY];
}

// Department kanban over Zoho Projects, plus the read-only task slices the
// board's selectors and detail panel need. Ported from the NestJS backend
// src/board/board.service.ts (BoardService) and src/tasks/tasks.service.ts
// (TasksService).
//
// The @Injectable services with constructor DI (CacheService,
// ZohoProjectsReadService, ZohoProjectsWriteService, UsersService) become
// globalThis-pinned singletons (g.__board, g.__tasks) reading the foundation
// accessors getCache(), getZohoProjectsRead(), getZohoProjectsWrite(), and the
// users data-access functions. The Zoho WRITE methods (updateTaskStatus/Owner/
// Priority, addComment, createTask) are DIRECT writes: each 404s before any
// Zoho write when the task is not on the given project, returns the before/
// after the route layer audits, and invalidates the project board cache. The
// route layer gates them behind WRITE_GATE_ENABLED and rejects the MCP service
// viewer.
//
// Logic and DTOs are kept VERBATIM from the backend: the board grouping into
// three tabs (Cross-Dept, IT, Other), the per-project board cache, the column
// ordering, and the detail panel shape. The board groups projects under three
// tabs; within a tab the viewer picks one project's tasklist; the board draws
// that tasklist's tasks as status columns. Raw project tasks are cached per
// project under zoho_projects:board:<id> (15 min source TTL).
//
// SERVER ONLY. Node runtime. Never import from a client component.
import { getCache, type CacheService } from '../cache';
import {
  getZohoProjectsRead,
  getZohoProjectsWrite,
  type ZohoProjectsReadService,
  type ZohoProjectsWriteService,
  type ZohoProjectTask,
  type ZohoTaskComment,
} from '../integrations/zoho/projects';
import {
  assignableUsers as assignableUsersQuery,
  findByZpuid,
} from '../users';
import { BadRequestError, NotFoundError } from '../errors';
import type { SourceMeta } from '../envelope';
import {
  ACTIVE_STATUSES,
  BOARD_TABS,
  CROSS_PROJECT,
  FIXED_PROJECT_IDS,
  IT_PROJECT,
  LESS_ACTIVE_STATUSES,
  TAB_KEYS,
  type TabKey,
} from './board-config';

export interface BoardCardData {
  id: string;
  title: string;
  owner: string;
  /** Stable Zoho user id of the owner, or null when unassigned. The assignee
   *  filter matches on this, never the display name, because Zoho Projects
   *  shows a fuller name than the users table stores. */
  owner_zpuid: string | null;
  /** "Jun 12" or null when the task has no due date. Null over invention. */
  due_display: string | null;
  /** Zoho priority (None/Low/Medium/High) or null when unset. */
  priority: string | null;
  /** Tasklist name, or null when Zoho omits it on the task. */
  tasklist: string | null;
  status: string;
}

export interface BoardColumnData {
  status: string;
  /** Zoho status type (open/inprogress/closed) when known from the data. */
  status_type: string | null;
  count: number;
  cards: BoardCardData[];
}

export interface BoardPayload {
  tab: string;
  tab_label: string;
  project_id: string;
  project_name: string;
  tasklist_id: string | null;
  tasklist_name: string | null;
  columns: BoardColumnData[];
}

export interface BoardTasklistRef {
  id: string;
  name: string;
}

export interface BoardProjectRef {
  id: string;
  name: string;
  status: string | null;
  tasklists: BoardTasklistRef[];
}

export interface BoardTabRef {
  key: string;
  label: string;
  projects: BoardProjectRef[];
}

export interface BoardCatalog {
  tabs: BoardTabRef[];
}

interface HarvestedStatus {
  id: string;
  name: string;
  type: string | null;
}

export interface BoardTaskComment {
  author: string;
  content: string;
  time_display: string | null;
}

export interface AssignableUser {
  key: string;
  name: string;
  zpuid: string;
}

export interface BoardTaskDetail {
  id: string;
  name: string;
  description: string;
  status: string | null;
  status_type: string | null;
  priority: 'None' | 'Low' | 'Medium' | 'High' | null;
  owner: string | null;
  owner_zpuid: string | null;
  due_display: string | null;
  created_display: string | null;
  modified_display: string | null;
  url: string | null;
  comments: BoardTaskComment[];
  assignable_users: AssignableUser[];
}

const ALLOWED_PRIORITIES = ['None', 'Low', 'Medium', 'High'] as const;
type AllowedPriority = (typeof ALLOWED_PRIORITIES)[number];

function normalizePriority(
  value: string | null | undefined,
): AllowedPriority | null {
  if (!value) return null;
  const match = ALLOWED_PRIORITIES.find(
    (p) => p.toLowerCase() === value.toLowerCase().trim(),
  );
  return match ?? null;
}

export function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value);
}

/** Zoho Projects dates arrive as MM-dd-yyyy; normalize to yyyy-mm-dd. */
function isoFromZohoDate(value: string | undefined): string | null {
  if (!value) return null;
  const mdy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function dueDisplay(value: string | undefined): string | null {
  const iso = isoFromZohoDate(value);
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** "Jun 12, 2026" from a Zoho epoch-ms long or a Zoho time string, or null.
 *  Used for created/modified, where the hour does not matter on a card. */
function timestampDisplay(
  long: number | undefined,
  text: string | undefined,
): string | null {
  let ms: number | null = null;
  if (typeof long === 'number' && long > 0) {
    ms = long;
  } else if (text) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) ms = parsed;
  }
  if (ms === null) return null;
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function commentTimeDisplay(c: ZohoTaskComment): string | null {
  return timestampDisplay(c.created_time_long, c.created_time);
}

function ownerZpuidOf(task: ZohoProjectTask): string | null {
  const z = task.details?.owners?.[0]?.zpuid;
  return z === undefined || z === null ? null : String(z) || null;
}

// Every owner's zpuid on a task, as strings. A task can carry several owners;
// the my-tasks filter matches when the person is any of them, not only the
// first. Null and blank ids are dropped.
function ownerZpuidsOf(task: ZohoProjectTask): string[] {
  const owners = task.details?.owners ?? [];
  const ids: string[] = [];
  for (const owner of owners) {
    const z = owner?.zpuid;
    if (z === undefined || z === null) continue;
    const s = String(z);
    if (s) ids.push(s);
  }
  return ids;
}

function ownerOf(task: ZohoProjectTask): string {
  const owner = task.details?.owners?.[0];
  return owner?.full_name ?? owner?.name ?? 'Unassigned';
}

function taskTasklistId(task: ZohoProjectTask): string {
  const tl = task.tasklist;
  if (!tl) return '';
  return String(tl.id_string ?? tl.id ?? '');
}

export function toCard(task: ZohoProjectTask): BoardCardData {
  return {
    id: String(task.id_string ?? task.id ?? ''),
    title: task.name ?? 'Untitled task',
    owner: ownerOf(task),
    owner_zpuid: ownerZpuidOf(task),
    due_display: dueDisplay(task.end_date),
    priority: task.priority ?? null,
    tasklist: task.tasklist?.name ?? null,
    status: task.status?.name ?? 'Open',
  };
}

/** Column order ported from the legacy buildColumns(): the active set in
 *  spec order, then any status discovered in the data that the spec does
 *  not know (sorted, so nothing drops off the board silently), then the
 *  less-active set. */
export function columnOrder(statusesInData: string[]): string[] {
  const known = new Set(
    [...ACTIVE_STATUSES, ...LESS_ACTIVE_STATUSES].map((s) =>
      s.toLowerCase().trim(),
    ),
  );
  const unknown = [
    ...new Set(
      statusesInData.filter((s) => !known.has(s.toLowerCase().trim())),
    ),
  ].sort();
  return [...ACTIVE_STATUSES, ...unknown, ...LESS_ACTIVE_STATUSES];
}

export class BoardService {
  constructor(
    private readonly cache: CacheService,
    private readonly reads: ZohoProjectsReadService,
    private readonly writes: ZohoProjectsWriteService,
  ) {}

  private cacheKey(projectId: string): string {
    return `zoho_projects:board:${projectId}`;
  }

  private projectsCacheKey(): string {
    return 'zoho_projects:catalog';
  }

  private async projectTasks(
    projectId: string,
  ): Promise<{ tasks: ZohoProjectTask[]; meta: SourceMeta }> {
    const read = await this.cache.read<ZohoProjectTask[]>(
      this.cacheKey(projectId),
      'zoho_projects',
      () => this.reads.allTasks(projectId),
    );
    return { tasks: read.data, meta: read.meta };
  }

  /** Resolves a tab key to the projects it covers. 'cross' and 'it' are one
   *  fixed project each; 'other' is every project that is neither. */
  async projectsForTab(
    tab: TabKey,
  ): Promise<{ projects: BoardProjectRef[]; meta: SourceMeta }> {
    const read = await this.cache.read<BoardProjectRef[]>(
      this.projectsCacheKey(),
      'zoho_projects',
      () => this.fetchCatalog(),
    );
    const all = read.data;
    let projects: BoardProjectRef[];
    if (tab === 'cross') {
      projects = all.filter((p) => p.id === CROSS_PROJECT.id);
    } else if (tab === 'it') {
      projects = all.filter((p) => p.id === IT_PROJECT.id);
    } else {
      projects = all.filter((p) => !FIXED_PROJECT_IDS.has(p.id));
    }
    return { projects, meta: read.meta };
  }

  /** Every project in the portal with its tasklists, fetched live. The Other
   *  tab needs the full set; Cross-Dept and IT slice from the same list. */
  private async fetchCatalog(): Promise<BoardProjectRef[]> {
    const projects = await this.reads.projects();
    const out: BoardProjectRef[] = [];
    for (const p of projects) {
      const id = String(p.id_string ?? p.id ?? '');
      if (!id) continue;
      let tasklists: BoardTasklistRef[] = [];
      try {
        const lists = await this.reads.tasklists(id);
        tasklists = lists
          .map((t) => ({
            id: String(t.id_string ?? t.id ?? ''),
            name: t.name ?? 'Untitled list',
          }))
          .filter((t) => t.id);
      } catch {
        // A single project's tasklist read failing must not blank the whole
        // catalog; that project simply shows no lists until the next read.
        tasklists = [];
      }
      out.push({
        id,
        name: p.name ?? 'Untitled project',
        status: p.status ?? null,
        tasklists,
      });
    }
    return out;
  }

  /** The full tab/project/tasklist catalog for the board's two selectors. */
  async catalog(): Promise<{ data: BoardCatalog; parts: SourceMeta[] }> {
    const read = await this.cache.read<BoardProjectRef[]>(
      this.projectsCacheKey(),
      'zoho_projects',
      () => this.fetchCatalog(),
    );
    const all = read.data;
    const tabs: BoardTabRef[] = BOARD_TABS.map((tab) => {
      let projects: BoardProjectRef[];
      if (tab.key === 'cross') {
        projects = all.filter((p) => p.id === CROSS_PROJECT.id);
      } else if (tab.key === 'it') {
        projects = all.filter((p) => p.id === IT_PROJECT.id);
      } else {
        projects = all.filter((p) => !FIXED_PROJECT_IDS.has(p.id));
      }
      return { key: tab.key, label: tab.label, projects };
    });
    return { data: { tabs }, parts: [read.meta] };
  }

  /** Confirms a project belongs to a tab and a tasklist belongs to that
   *  project, then resolves their display names. Returns null when either is
   *  not under the tab, so the route can 404 cleanly instead of drawing
   *  a board from a mismatched pair. */
  async resolveSelection(
    tab: TabKey,
    projectId: string,
    tasklistId: string | null,
  ): Promise<{
    project: BoardProjectRef;
    tasklist: BoardTasklistRef | null;
  } | null> {
    const { projects } = await this.projectsForTab(tab);
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;
    if (!tasklistId) return { project, tasklist: null };
    const tasklist = project.tasklists.find((t) => t.id === tasklistId);
    if (!tasklist) return null;
    return { project, tasklist };
  }

  async board(
    tab: TabKey,
    project: BoardProjectRef,
    tasklist: BoardTasklistRef | null,
  ): Promise<{ data: BoardPayload; parts: SourceMeta[] }> {
    const { tasks, meta } = await this.projectTasks(project.id);

    const scoped = tasks
      .filter((t) => (tasklist ? taskTasklistId(t) === tasklist.id : true))
      // Newest activity first inside each column, the legacy board order.
      .sort(
        (a, b) =>
          (b.last_updated_time_long ?? 0) - (a.last_updated_time_long ?? 0),
      );

    const typeByStatus = new Map<string, string | null>();
    for (const t of scoped) {
      const name = t.status?.name;
      if (name && !typeByStatus.has(name)) {
        typeByStatus.set(name, t.status?.type ?? null);
      }
    }

    const order = columnOrder(scoped.map((t) => t.status?.name ?? 'Open'));
    const columns: BoardColumnData[] = order.map((status) => {
      const lower = status.toLowerCase().trim();
      const cards = scoped
        .filter(
          (t) => (t.status?.name ?? 'Open').toLowerCase().trim() === lower,
        )
        .map(toCard);
      return {
        status,
        status_type: typeByStatus.get(status) ?? null,
        count: cards.length,
        cards,
      };
    });

    const tabLabel = BOARD_TABS.find((t) => t.key === tab)?.label ?? tab;
    return {
      data: {
        tab,
        tab_label: tabLabel,
        project_id: project.id,
        project_name: project.name,
        tasklist_id: tasklist?.id ?? null,
        tasklist_name: tasklist?.name ?? null,
        columns,
      },
      parts: [meta],
    };
  }

  /** Fetches one task straight from Zoho and 404s when it is not on the
   *  requested project, so a forged project id can never reach an unrelated
   *  task. */
  private async requireTask(
    projectId: string,
    taskId: string,
  ): Promise<ZohoProjectTask> {
    const task = await this.reads.task(projectId, taskId).catch(() => null);
    if (!task) {
      throw new NotFoundError(
        'That task is not on this project. Open it from its own project board.',
      );
    }
    return task;
  }

  private zohoTaskUrl(projectId: string, taskId: string): string {
    return `https://projects.zoho.com/portal/tellsaleemdotcom#taskdetail/${projectId}/${taskId}`;
  }

  /** The detail-panel payload: task fields, the last ~10 comments, and the
   *  assignable-users list for the owner picker. The task must be on the
   *  project or this 404s. */
  async taskDetail(
    projectId: string,
    taskId: string,
  ): Promise<{ data: BoardTaskDetail; parts: SourceMeta[] }> {
    const task = await this.requireTask(projectId, taskId);
    const [comments, assignable] = await Promise.all([
      this.reads.comments(projectId, taskId, 10),
      this.assignableUsers(),
    ]);

    const detail: BoardTaskDetail = {
      id: String(task.id_string ?? task.id ?? taskId),
      name: task.name ?? 'Untitled task',
      description: task.description ?? '',
      status: task.status?.name ?? null,
      status_type: task.status?.type ?? null,
      priority: normalizePriority(task.priority),
      owner: ownerOf(task) === 'Unassigned' ? null : ownerOf(task),
      owner_zpuid: ownerZpuidOf(task),
      due_display: dueDisplay(task.end_date),
      created_display: timestampDisplay(
        task.created_time_long,
        task.created_time,
      ),
      modified_display: timestampDisplay(
        task.last_updated_time_long,
        task.last_updated_time,
      ),
      url: this.zohoTaskUrl(projectId, taskId),
      comments: comments.map((c) => ({
        author: c.added_by ?? c.added_person ?? 'Unknown',
        content: c.content ?? '',
        time_display: commentTimeDisplay(c),
      })),
      assignable_users: assignable,
    };

    // Freshly read from Zoho on each call; the detail panel is not cached so
    // it always reflects the latest comment and the latest owner/priority.
    const meta: SourceMeta = {
      fetched_at: new Date(),
      cached: false,
      stale: false,
      reliable: true,
    };
    return { data: detail, parts: [meta] };
  }

  /** The assignable-users list on its own, for the board's owner filter and
   *  the create form's owner picker. */
  async assignableUsers(): Promise<AssignableUser[]> {
    return assignableUsersQuery();
  }

  // --- Zoho WRITES (direct, gated, audited at the route) -------------------
  // Ported verbatim from the backend BoardService write methods. Each method
  // 404s before any Zoho write when the task is not on the given project, so a
  // forged project id can never reach an unrelated task. The route layer gates
  // these behind WRITE_GATE_ENABLED, rejects the MCP service viewer, and writes
  // the audit row from the before/after these return.

  /** Distinct statuses in use on a project, harvested from its tasks. The
   *  legacy trick: /projects/{id}/statuses/ 6403s on this token, but every
   *  task embeds its full status object, so the distinct set falls out of the
   *  same fetch that draws the board. */
  private async harvestStatuses(projectId: string): Promise<HarvestedStatus[]> {
    const { tasks } = await this.projectTasks(projectId);
    const byId = new Map<string, HarvestedStatus>();
    for (const t of tasks) {
      const s = t.status;
      if (!s) continue;
      const id = String(s.id_string ?? s.id ?? '');
      if (!id || byId.has(id)) continue;
      byId.set(id, { id, name: s.name ?? '', type: s.type ?? null });
    }
    return [...byId.values()];
  }

  /** Moves a task to another status and returns the fresh card straight from
   *  Zoho, plus the before/after pair for the caller's audit row. The task must
   *  already be on this project, so a mismatched id 404s before any write. */
  async updateTaskStatus(
    projectId: string,
    taskId: string,
    statusName: string,
  ): Promise<{
    card: BoardCardData;
    before: { status: string | null };
    after: { status: string; status_id: string };
  }> {
    const statuses = await this.harvestStatuses(projectId);
    const wanted = statusName.toLowerCase().trim();
    const target = statuses.find((s) => s.name.toLowerCase().trim() === wanted);
    if (!target) {
      throw new BadRequestError(
        `Status "${statusName}" is not in use on this project. Available: ${statuses
          .map((s) => s.name)
          .join(', ')}.`,
      );
    }

    const { tasks } = await this.projectTasks(projectId);
    const beforeTask =
      tasks.find((t) => String(t.id_string ?? t.id ?? '') === taskId) ?? null;
    if (!beforeTask) {
      // Never write to Zoho for a task that does not belong to the requested
      // project; a mismatched id must 404 cleanly with the audit row only
      // written for provable pre-write state.
      throw new NotFoundError(
        'That task is not on this board. Pick it from its own project board.',
      );
    }

    await this.writes.updateTaskStatus(projectId, taskId, target.id);
    await this.cache.invalidate(this.cacheKey(projectId));

    // Fresh card from Zoho, not from the optimistic guess. Falls back to the
    // pre-write task with the new status if the detail read hiccups.
    const freshTask = await this.reads
      .task(projectId, taskId)
      .catch(() => null);
    const card = freshTask
      ? toCard(freshTask)
      : { ...toCard(beforeTask), status: target.name };

    return {
      card,
      before: { status: beforeTask?.status?.name ?? null },
      after: { status: target.name, status_id: target.id },
    };
  }

  /** Reassigns a task's owner. Validates the zpuid against the known users so
   *  an arbitrary id can never be written to Zoho, 404s if the task is not on
   *  the project, then returns before/after for the audit row. */
  async updateTaskOwner(
    projectId: string,
    taskId: string,
    zpuid: string,
  ): Promise<{
    before: { owner_zpuid: string | null; owner: string | null };
    after: { owner_zpuid: string; owner: string };
  }> {
    const user = await findByZpuid(zpuid);
    if (!user) {
      throw new BadRequestError('That owner is not a known assignable user.');
    }
    const before = await this.requireTask(projectId, taskId);

    await this.writes.updateTaskOwner(projectId, taskId, zpuid);
    await this.cache.invalidate(this.cacheKey(projectId));

    return {
      before: {
        owner_zpuid: ownerZpuidOf(before),
        owner: ownerOf(before) === 'Unassigned' ? null : ownerOf(before),
      },
      after: { owner_zpuid: zpuid, owner: user.name },
    };
  }

  /** Sets a task's priority. Validates the value, 404s if the task is not on
   *  the project, then returns before/after for the audit row. */
  async updateTaskPriority(
    projectId: string,
    taskId: string,
    priority: string,
  ): Promise<{
    before: { priority: string | null };
    after: { priority: AllowedPriority };
  }> {
    const wanted = normalizePriority(priority);
    if (!wanted) {
      throw new BadRequestError(
        `Priority "${priority}" is not one of ${ALLOWED_PRIORITIES.join(', ')}.`,
      );
    }
    const before = await this.requireTask(projectId, taskId);

    await this.writes.updateTaskPriority(projectId, taskId, wanted);
    await this.cache.invalidate(this.cacheKey(projectId));

    return {
      before: { priority: normalizePriority(before.priority) },
      after: { priority: wanted },
    };
  }

  /** Adds a comment to a task. 404s if the task is not on the project. */
  async addComment(
    projectId: string,
    taskId: string,
    content: string,
  ): Promise<void> {
    await this.requireTask(projectId, taskId);
    await this.writes.addComment(projectId, taskId, content);
  }

  /** Creates a board task with the optional owner/priority/due the "Add task"
   *  form carries. The owner zpuid, when present, is validated against the
   *  known users before the write. Invalidates the project board so the new
   *  card shows on the next read. Returns the new Zoho task id. */
  async createTask(input: {
    projectId: string;
    tasklistId?: string | null;
    name: string;
    description?: string;
    ownerZpuid?: string | null;
    priority?: string | null;
    dueDate?: string | null;
  }): Promise<{ taskId: string | null; ownerName: string | null }> {
    let ownerName: string | null = null;
    if (input.ownerZpuid) {
      const user = await findByZpuid(input.ownerZpuid);
      if (!user) {
        throw new BadRequestError(
          'That owner is not a known assignable user.',
        );
      }
      ownerName = user.name;
    }

    const priority = input.priority
      ? (normalizePriority(input.priority) ??
        (() => {
          throw new BadRequestError(
            `Priority "${input.priority}" is not one of ${ALLOWED_PRIORITIES.join(', ')}.`,
          );
        })())
      : null;

    const result = await this.writes.createBoardTask({
      projectId: input.projectId,
      tasklistId: input.tasklistId ?? null,
      name: input.name,
      description: input.description,
      ownerZpuid: input.ownerZpuid ?? null,
      priority,
      dueDate: input.dueDate ?? null,
    });
    await this.cache.invalidate(this.cacheKey(input.projectId));
    return { taskId: result.taskId, ownerName };
  }
}

// globalThis-pinned singleton: shares the one cache and the Zoho Projects read
// singleton, so the warm caches are reused across requests. The write service
// is not constructed here (board writes are deferred).
const BOARD_KEY = '__board';

type GlobalWithBoard = typeof globalThis & {
  [BOARD_KEY]?: BoardService;
};

export function getBoard(): BoardService {
  const g = globalThis as GlobalWithBoard;
  if (!g[BOARD_KEY]) {
    g[BOARD_KEY] = new BoardService(
      getCache(),
      getZohoProjectsRead(),
      getZohoProjectsWrite(),
    );
  }
  return g[BOARD_KEY];
}

// --- Tasks slice (src/tasks/tasks.service.ts) ------------------------------
// The top open tasks across the two tracked projects, due soonest first.
// Reads only; task changes go through the assistant.

export interface TaskRowData {
  title: string;
  owner: string;
  status: string;
  due_display: string;
}

export interface TasksPayload {
  rows: TaskRowData[];
}

const TRACKED_PROJECTS = [
  { id: '2599674000000342004', name: 'Saleem IT and Product' },
  { id: '2599674000000344008', name: 'Saleem Cross-Department' },
];

const ROWS_SHOWN = 10;

/** Zoho Projects dates arrive as MM-dd-yyyy; normalize to yyyy-mm-dd. */
function tasksIsoFromZohoDate(value: string | undefined): string | null {
  if (!value) return null;
  const mdy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function tasksDueDisplay(iso: string | null): string {
  if (!iso) return '·';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Confirmed from the legacy live API: completed tasks have
 *  status.type === 'closed' or completed === true. */
function isOpen(task: ZohoProjectTask): boolean {
  return task.status?.type !== 'closed' && task.completed !== true;
}

function tasksOwnerOf(task: ZohoProjectTask): string {
  const owner = task.details?.owners?.[0];
  const fullName = owner?.full_name ?? owner?.name;
  return fullName ? fullName.split(/\s+/)[0] : 'Unassigned';
}

export interface MyTaskRowData {
  id: string;
  project_id: string;
  // The board tab the task's project sits under, for the row's deep link.
  tab: 'cross' | 'it' | 'other';
  title: string;
  due_display: string;
  due_state: 'overdue' | 'today' | 'upcoming' | 'none';
  overdue_days: number;
  priority: string | null;
  status: string;
}

export interface MyTasksGroupData {
  rows: MyTaskRowData[];
  overdue_count: number;
  due_today_count: number;
  total: number;
}

// Two groups for the panel's two tabs: "mine" is every open task assigned to
// the person outside the Cross-Department project (their own work, wherever it
// lives in Zoho); "cross" is their open tasks in the Cross-Department project.
export interface MyTasksPayload {
  mine: MyTasksGroupData;
  cross: MyTasksGroupData;
}

// The open task with the fields the my-tasks slice needs before it is shaped
// into a row. Internal to the flattened, cached list.
interface MyTaskRaw {
  id: string;
  project_id: string;
  tab: 'cross' | 'it' | 'other';
  title: string;
  status: string;
  priority: string | null;
  due_iso: string | null;
  owner_zpuids: string[];
}

const MY_TASKS_ROWS_SHOWN = 7;

// A project id to its board tab: the two fixed projects map to their own tab,
// every other project falls under Other. Drives each my-tasks row's deep link.
function boardTabForProject(projectId: string): 'cross' | 'it' | 'other' {
  if (projectId === CROSS_PROJECT.id) return 'cross';
  if (projectId === IT_PROJECT.id) return 'it';
  return 'other';
}

/** Today as the Bahrain civil calendar day (yyyy-mm-dd). A task's due day is
 *  compared against this, so "overdue" and "today" read in Bahrain time, never
 *  the server's. */
function bahrainTodayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bahrain' });
}

/** Whole days from one yyyy-mm-dd calendar day to another, measured at UTC
 *  midnight so neither the server timezone nor DST shifts the count. */
function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

function myTaskDueState(
  dueIso: string | null,
  today: string,
): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!dueIso) return 'none';
  if (dueIso < today) return 'overdue';
  if (dueIso === today) return 'today';
  return 'upcoming';
}

/** Shape one raw open task into a display row against today's Bahrain day. */
function toMyTaskRow(raw: MyTaskRaw, today: string): MyTaskRowData {
  const dueState = myTaskDueState(raw.due_iso, today);
  return {
    id: raw.id,
    project_id: raw.project_id,
    tab: raw.tab,
    title: raw.title,
    due_display: raw.due_iso ? tasksDueDisplay(raw.due_iso) : 'No due date',
    due_state: dueState,
    overdue_days:
      dueState === 'overdue' && raw.due_iso
        ? daysBetweenIso(raw.due_iso, today)
        : 0,
    priority: raw.priority,
    status: raw.status,
  };
}

/** Build a tab group from a person's raw tasks: overdue and due-today counts
 *  over the whole set, then the rows sorted overdue first, soonest due next,
 *  undated last, capped for the panel. */
function buildMyTasksGroup(raws: MyTaskRaw[], today: string): MyTasksGroupData {
  let overdueCount = 0;
  let dueTodayCount = 0;
  for (const t of raws) {
    const state = myTaskDueState(t.due_iso, today);
    if (state === 'overdue') overdueCount += 1;
    else if (state === 'today') dueTodayCount += 1;
  }
  const rows = [...raws]
    .sort((a, b) => (a.due_iso ?? '9999').localeCompare(b.due_iso ?? '9999'))
    .slice(0, MY_TASKS_ROWS_SHOWN)
    .map((t) => toMyTaskRow(t, today));
  return {
    rows,
    overdue_count: overdueCount,
    due_today_count: dueTodayCount,
    total: raws.length,
  };
}

export class TasksService {
  constructor(
    private readonly cache: CacheService,
    private readonly projects: ZohoProjectsReadService,
  ) {}

  async board(): Promise<{ data: TasksPayload; parts: SourceMeta[] }> {
    const read = await this.cache.read(
      'zoho_projects:tasks',
      'zoho_projects',
      () => this.fetchRows(),
    );
    return { data: { rows: read.data }, parts: [read.meta] };
  }

  private async fetchRows(): Promise<TaskRowData[]> {
    // One page of 100 per project covers both boards comfortably today;
    // only the top 10 open tasks are shown anyway.
    const perProject = await Promise.all(
      TRACKED_PROJECTS.map((project) => this.projects.tasks(project.id)),
    );

    return (
      perProject
        .flat()
        .filter(isOpen)
        .map((task) => ({
          title: task.name ?? 'Untitled task',
          owner: tasksOwnerOf(task),
          status: task.status?.name ?? 'Open',
          due: tasksIsoFromZohoDate(task.end_date),
        }))
        // Due soonest first; undated tasks sink to the end.
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
        .slice(0, ROWS_SHOWN)
        .map(({ title, owner, status, due }) => ({
          title,
          owner,
          status,
          due_display: tasksDueDisplay(due),
        }))
    );
  }

  /** The signed-in person's own open tasks, split into two groups for the
   *  panel's tabs: "mine" is everything assigned to them outside the
   *  Cross-Department project (their own work, wherever it lives in Zoho), and
   *  "cross" is their Cross-Department tasks. Each group is sorted overdue first
   *  then soonest due. The flattened open set across all projects is cached once
   *  for all assignees and filtered per person here, so a per-person cache does
   *  not multiply. An empty zpuid (a person with no Zoho user) returns empty
   *  groups, not an error. */
  async mine(
    zpuid: string,
  ): Promise<{ data: MyTasksPayload; parts: SourceMeta[] }> {
    const emptyGroup: MyTasksGroupData = {
      rows: [],
      overdue_count: 0,
      due_today_count: 0,
      total: 0,
    };
    if (!zpuid) {
      return { data: { mine: emptyGroup, cross: emptyGroup }, parts: [] };
    }

    // The cache key carries a shape version. Bumped to v2 when the cached raw
    // task gained owner_zpuids (all owners) in place of owner_zpuid (first
    // owner only); a new key forces a fresh fetch rather than reading the old
    // shape out of the persistent L2 cache and crashing on the missing field.
    const read = await this.cache.read(
      'zoho_projects:my-tasks:v2',
      'zoho_projects',
      () => this.fetchAllOpenForMine(),
    );
    const today = bahrainTodayIso();
    // Defensive against any legacy-shaped cache entry: a missing owner list
    // reads as no owners rather than throwing.
    const assigned = read.data.filter((t) =>
      (t.owner_zpuids ?? []).includes(zpuid),
    );

    return {
      data: {
        mine: buildMyTasksGroup(
          assigned.filter((t) => t.tab !== 'cross'),
          today,
        ),
        cross: buildMyTasksGroup(
          assigned.filter((t) => t.tab === 'cross'),
          today,
        ),
      },
      parts: [read.meta],
    };
  }

  /** Every open task in the portal carrying the fields the my-tasks panel and
   *  its deep link need (task id, project id, board tab, assignee zpuid, raw
   *  due), across all projects so a person's own-department work is covered
   *  wherever it lives. Cached as one list for all assignees; a single project's
   *  read failing drops only that project rather than blanking the panel. */
  private async fetchAllOpenForMine(): Promise<MyTaskRaw[]> {
    const projects = await this.projects.projects();
    const perProject = await Promise.all(
      projects.map(async (p) => {
        const id = String(p.id_string ?? p.id ?? '');
        if (!id) return [] as MyTaskRaw[];
        const tab = boardTabForProject(id);
        const tasks = await this.projects.tasks(id).catch(() => []);
        return tasks.filter(isOpen).map(
          (t): MyTaskRaw => ({
            id: String(t.id_string ?? t.id ?? ''),
            project_id: id,
            tab,
            title: t.name ?? 'Untitled task',
            status: t.status?.name ?? 'Open',
            priority: t.priority ?? null,
            due_iso: tasksIsoFromZohoDate(t.end_date),
            owner_zpuids: ownerZpuidsOf(t),
          }),
        );
      }),
    );
    return perProject.flat();
  }
}

const TASKS_KEY = '__tasks';

type GlobalWithTasks = typeof globalThis & {
  [TASKS_KEY]?: TasksService;
};

export function getTasks(): TasksService {
  const g = globalThis as GlobalWithTasks;
  if (!g[TASKS_KEY]) {
    g[TASKS_KEY] = new TasksService(getCache(), getZohoProjectsRead());
  }
  return g[TASKS_KEY];
}

// Re-export the unused-but-declared priority list so the type stays available
// to the routes if needed (kept VERBATIM with the backend's set).
export { ALLOWED_PRIORITIES };

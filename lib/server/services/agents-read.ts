// The agents board READ logic the pulse feed depends on: the latest run per
// agent from the legacy agent_runs table, plus source health rows. Read only.
//
// Ported from the NestJS backend src/agents/agents.service.ts. The @Injectable
// AgentsService with @Inject(PG_POOL) becomes a globalThis-pinned singleton
// (g.__agentsRead) reading the shared pg pool via getPool(). DTOs and the
// status/display derivation logic are kept VERBATIM.
//
// INTENTIONALLY OMITTED (deferred, per the migration spec): every write and
// execution path of the 15-agent framework (running an agent, the cron
// handover). Only board() / latestRuns() / sourceHealth() reads are ported,
// because that is all pulse needs. Running agents stays a legacy dashboard
// action until the cron handover.
//
// SERVER ONLY. Node runtime. Never import from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';

export interface AgentRowData {
  key: string;
  label: string;
  describes: string;
  last_run_display: string;
  next_run_display: string;
  status: 'success' | 'running' | 'stalled' | 'error';
  error_plain: string | null;
}

export interface SourceRowData {
  key: string;
  label: string;
  status: 'steady' | 'attention';
  detail_plain: string;
}

export interface AgentsPayload {
  agents: AgentRowData[];
  sources: SourceRowData[];
}

interface AgentRunRow {
  agent_name: string;
  run_at: Date;
  status: string;
  error_message: string | null;
  next_scheduled: Date | null;
}

interface SourceHealthRow {
  source_key: string;
  label: string;
  status: string;
  detail_plain: string | null;
}

/** One plain line per known legacy agent; unknown agents fall back to ''. */
const REGISTRY: Record<string, string> = {
  'pipeline-health': 'Watches deal stages against their time promises',
  'funnel-diagnostic': 'Checks the booking funnels for unusual drop-offs',
  'department-bottleneck': 'Finds where work is piling up across departments',
  'follow-up-generator': 'Drafts follow-up reminders for quiet deals',
  'lead-source-attribution': 'Tallies which channels the leads come from',
  'task-tracker': 'Summarizes team task completion in Zoho Projects',
  'ad-spend-tracker': 'Tracks ad spend and cost per lead',
  'kpi-sync': 'Fills the automatic KPI values each morning',
  'seo-monitor': 'Watches search visibility and site health',
  'investor-update-data': 'Gathers the numbers for investor updates',
  'anomaly-watcher': 'Flags sudden moves in leads, usage, and receivables',
  'weekly-brief-compiler': 'Compiles the Saturday brief from every agent',
  'daily-digest': 'Sends the daily summary email',
  'corporate-list-builder': 'Builds the corporate outreach list',
  'provider-list-builder': 'Builds the provider outreach list',
  'corporate-email-batch': 'Prepares the corporate outreach email batch',
  'provider-email-batch': 'Prepares the provider outreach email batch',
  'salary-slip-batch': 'Prepares the monthly salary slips',
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function sentenceCase(key: string): string {
  const words = key.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function relativePast(date: Date, now: number): string {
  const diff = now - date.getTime();
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function relativeNext(date: Date | null, now: number): string {
  if (!date) return 'on demand';
  const diff = date.getTime() - now;
  if (diff <= 0) return 'due now';
  if (diff < HOUR_MS) return `in ${Math.max(1, Math.round(diff / MINUTE_MS))}m`;
  if (diff < DAY_MS) return `in ${Math.round(diff / HOUR_MS)}h`;
  return `in ${Math.round(diff / DAY_MS)}d`;
}

export function deriveAgentStatus(
  status: string,
  errorMessage: string | null,
): AgentRowData['status'] {
  if (status === 'error' || errorMessage) return 'error';
  if (status === 'running') return 'running';
  if (status === 'stalled') return 'stalled';
  // Legacy 'partial' rows carry usable data, so they read as success.
  return 'success';
}

export class AgentsReadService {
  constructor(private readonly pool: Pool) {}

  async board(): Promise<AgentsPayload> {
    const [agents, sources] = await Promise.all([
      this.latestRuns(),
      this.sourceHealth(),
    ]);
    return { agents, sources };
  }

  /** Latest agent_runs rows, one per agent. Shared with the pulse feed. */
  async latestRuns(): Promise<AgentRowData[]> {
    const { rows } = await this.pool.query<AgentRunRow>(
      `select distinct on (agent_name)
              agent_name, run_at, status, error_message, next_scheduled
       from agent_runs
       order by agent_name, run_at desc`,
    );
    const now = Date.now();
    return rows.map((row) => ({
      key: row.agent_name,
      label: sentenceCase(row.agent_name),
      describes: REGISTRY[row.agent_name] ?? '',
      last_run_display: relativePast(new Date(row.run_at), now),
      next_run_display: relativeNext(
        row.next_scheduled ? new Date(row.next_scheduled) : null,
        now,
      ),
      status: deriveAgentStatus(row.status, row.error_message),
      error_plain: row.error_message,
    }));
  }

  private async sourceHealth(): Promise<SourceRowData[]> {
    const { rows } = await this.pool.query<SourceHealthRow>(
      `select source_key, label, status, detail_plain
       from source_health
       order by source_key`,
    );
    return rows.map((row) => ({
      key: row.source_key,
      label: row.label,
      status: row.status === 'attention' ? 'attention' : 'steady',
      detail_plain: row.detail_plain ?? '',
    }));
  }
}

// globalThis-pinned singleton: shares the one pg pool across every route that
// reads the agents board (currently pulse), warm-reused per instance.
const AGENTS_READ_KEY = '__agentsRead';

type GlobalWithAgentsRead = typeof globalThis & {
  [AGENTS_READ_KEY]?: AgentsReadService;
};

export function getAgentsRead(): AgentsReadService {
  const g = globalThis as GlobalWithAgentsRead;
  if (!g[AGENTS_READ_KEY]) {
    g[AGENTS_READ_KEY] = new AgentsReadService(getPool());
  }
  return g[AGENTS_READ_KEY];
}

"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, Clock, Cpu, FileText, Megaphone, Stethoscope, Wallet } from "lucide-react";

import { Grid, spans } from "@/components/shell/Grid";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ListRow, type ListRowVariant } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import type { AgentRow, AgentsData, BriefData, TasksData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useFocusFlash } from "@/lib/deepLink";
import { fmtAgo, fmtTime } from "@/lib/format/datetime";
import { TITLES } from "@/config/titles";

/* Agents and System Health (spec 02 section 8.7): the agents card, the
   plain source-health card, the weekly brief in full, and the read-only
   sprint slice. There is deliberately NO Run now button in this wave: the
   new API cannot execute the legacy agents yet, so the card says where runs
   still happen instead of faking a control. The agents card carries
   data-focus-id="agent-corporate-list" for the stalled-agent pulse blip. */

const STATUS_CHIP: Record<AgentRow["status"], { variant: ChipVariant; label: string }> = {
  success: { variant: "good", label: "OK" },
  running: { variant: "info", label: "Running" },
  stalled: { variant: "warn", label: "Stalled" },
  error: { variant: "warn", label: "Error" },
};

function agentIcon(status: AgentRow["status"]) {
  if (status === "success") return Check;
  if (status === "running") return Clock;
  return CircleAlert;
}

function agentVariant(status: AgentRow["status"]): ListRowVariant {
  if (status === "success") return "good";
  if (status === "running") return "info";
  return "warn";
}

/* The brief's department sections get a familiar icon each; anything the
   assembler adds later falls back to a document. */
const SECTION_ICONS: Record<string, typeof FileText> = {
  operations: Stethoscope,
  marketing: Megaphone,
  finance: Wallet,
  product: Cpu,
};

function sectionIcon(title: string) {
  return SECTION_ICONS[title.toLowerCase()] ?? FileText;
}

/* "Compiled Saturday 7:48 PM." Bad payloads degrade to the raw string. */
function compiledLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `Compiled ${iso}.`;
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `Compiled ${weekday} ${fmtTime(iso)}.`;
}

type TaskRow = TasksData["rows"][number];

function taskStatusVariant(status: string): ChipVariant {
  const s = status.toLowerCase();
  if (s.includes("block")) return "warn";
  if (s.includes("done")) return "good";
  if (s.includes("queue")) return "mut";
  return "info";
}

const TASK_COLUMNS: DataTableColumn<TaskRow>[] = [
  {
    key: "title",
    label: "Task",
    render: (row) => <b className="font-semibold text-title">{row.title}</b>,
  },
  { key: "owner", label: "Owner" },
  { key: "due_display", label: "Due", numeric: true },
  {
    key: "status",
    label: "Status",
    numeric: true,
    render: (row) => <Chip variant={taskStatusVariant(row.status)}>{row.status}</Chip>,
  },
];

const LIST_SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    {Array.from({ length: 6 }, (_, i) => (
      <Skeleton key={i} height={38} />
    ))}
  </div>
);

const TABLE_SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    {Array.from({ length: 5 }, (_, i) => (
      <Skeleton key={i} height={16} />
    ))}
  </div>
);

function AgentsContent() {
  useFocusFlash();
  const title = TITLES.agents;

  const agentsQuery = useQuery({
    queryKey: qk.agents(),
    queryFn: () => fetchEnvelope<AgentsData>("agents", "/agents"),
  });
  const briefQuery = useQuery({
    queryKey: qk.brief(),
    queryFn: () => fetchEnvelope<BriefData>("brief", "/brief/latest"),
  });
  const tasksQuery = useQuery({
    queryKey: qk.tasks(),
    queryFn: () => fetchEnvelope<TasksData>("tasks", "/tasks"),
  });

  const agents = agentsQuery.data?.data?.agents;
  const unhealthy = agents?.filter((a) => a.status === "stalled" || a.status === "error").length;
  const compiledAt = briefQuery.data?.data?.compiled_at;

  return (
    <>
      <div className="mb-4 mt-[10px]">
        <h2 className="mb-1 text-[26px] max-[880px]:text-[22px]">{title.title}</h2>
        <p className="text-[13.5px] text-ink-2">{title.sub}</p>
      </div>
      <Grid>
        <div className={spans.c7} data-focus-id="agent-corporate-list">
          <Card>
            <CardHeader
              title="Agents"
              subtitle="Helpers that compile briefs and run checks on a schedule."
              right={
                agents ? (
                  unhealthy && unhealthy > 0 ? (
                    <Chip variant="warn">{unhealthy} stalled</Chip>
                  ) : (
                    <Chip variant="good">All healthy</Chip>
                  )
                ) : null
              }
            />
            <div className="px-[18px] pb-2 pt-2">
              <QueryPanel
                query={agentsQuery}
                skeleton={LIST_SKELETON}
                isEmpty={(d) => d.agents.length === 0}
                emptyCopy="Agents appear here once their schedules are registered."
              >
                {(d) => (
                  <div>
                    {d.agents.map((agent) => {
                      const chip = STATUS_CHIP[agent.status];
                      return (
                        <ListRow
                          key={agent.key}
                          icon={agentIcon(agent.status)}
                          variant={agentVariant(agent.status)}
                          title={agent.label}
                          subtitle={
                            <>
                              <span className="block">
                                {agent.describes} · ran {agent.last_run_display} · next{" "}
                                {agent.next_run_display}
                              </span>
                              {agent.error_plain ? (
                                <span className="mt-[2px] block text-trust-ink [[data-theme=dark]_&]:text-optimism">
                                  {agent.error_plain}
                                </span>
                              ) : null}
                            </>
                          }
                          right={<Chip variant={chip.variant}>{chip.label}</Chip>}
                        />
                      );
                    })}
                  </div>
                )}
              </QueryPanel>
            </div>
            <CardFooter note="Run now moves here at cutover. Agents still run on the current dashboard." />
          </Card>
        </div>

        <div className={spans.c5} data-focus-id="agent-sources">
          <Card>
            <CardHeader title="Where the numbers come from" subtitle="Plain status per source." />
            <div className="px-[18px] pb-4 pt-2">
              <QueryPanel
                query={agentsQuery}
                skeleton={LIST_SKELETON}
                isEmpty={(d) => d.sources.length === 0}
                emptyCopy="Source health checks switch on with the scheduled jobs."
              >
                {(d) => (
                  <div>
                    {d.sources.map((source) => (
                      <div
                        key={source.key}
                        className="flex items-start gap-[11px] border-b border-line-soft px-0.5 py-2.5 last:border-b-0"
                      >
                        <StatusDot
                          variant={source.status === "steady" ? "good" : "warn"}
                          className="mt-[6px]"
                        />
                        <div className="min-w-0">
                          <b className="block text-[13px] font-semibold text-title">{source.label}</b>
                          <span className="block text-xs text-ink-2">{source.detail_plain}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </QueryPanel>
            </div>
          </Card>
        </div>

        <div className={spans.c7} data-focus-id="weekly-brief">
          <Card>
            <CardHeader
              title="Weekly brief, in full"
              subtitle={compiledAt ? compiledLine(compiledAt) : "Compiled every Saturday evening."}
              right={
                compiledAt ? (
                  <Chip variant={briefQuery.data?.meta.stale ? "warn" : "good"}>
                    {fmtAgo(compiledAt)}
                  </Chip>
                ) : null
              }
            />
            <div className="px-[18px] pb-2 pt-2">
              <QueryPanel
                query={briefQuery}
                skeleton={LIST_SKELETON}
                isEmpty={(d) => d.sections.length === 0}
                emptyCopy="No brief compiled yet. The first one lands Saturday evening."
              >
                {(d) => (
                  <div>
                    {d.sections.map((section) => (
                      <ListRow
                        key={section.title}
                        icon={sectionIcon(section.title)}
                        title={section.title}
                        subtitle={section.content}
                      />
                    ))}
                  </div>
                )}
              </QueryPanel>
            </div>
            <CardFooter note="The Sunday meeting runs off this brief." />
          </Card>
        </div>

        <div className={spans.c5} data-focus-id="sprint-tasks">
          <Card>
            <CardHeader title="IT & product tasks" subtitle="From the sprint board. Read only." />
            <div className="px-[18px] pb-2 pt-2">
              <QueryPanel
                query={tasksQuery}
                skeleton={TABLE_SKELETON}
                isEmpty={(d) => d.rows.length === 0}
                emptyCopy="The sprint board is clear."
              >
                {(d) => (
                  <DataTable
                    columns={TASK_COLUMNS}
                    rows={d.rows}
                    rowKey={(row) => `${row.title}-${row.due_display}`}
                  />
                )}
              </QueryPanel>
            </div>
            <CardFooter note="Changes go through the assistant." />
          </Card>
        </div>
      </Grid>
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsContent />
    </Suspense>
  );
}

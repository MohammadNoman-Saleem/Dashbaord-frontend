"use client";

// p-my-tasks: the signed-in person's own open Zoho Projects tasks. Data: GET
// /api/tasks/mine, resolved from the session server-side. Read here; clicking a
// row opens the task on the board (deep link) where it can be actioned. The
// card takes an accent spine and an urgency line when something is overdue or
// due today, and stays calm otherwise. Severity is carried by words, never by
// color escalation, and there is no red.

import { AlertCircle, Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MyTaskRow, MyTasksData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { boardTaskHref, buildDeepLink } from "@/lib/deepLink";

/* Tile fills mirror ListRow: the warn tile (optimism-soft) is the one attention
   state, worn by overdue and due-today rows; everything else stays neutral. */
const OVERDUE_TILE =
  "bg-optimism-soft text-trust-ink [[data-theme=dark]_&]:text-optimism";
const CALM_TILE = "bg-accessible-soft text-title";

function dueWords(row: MyTaskRow): string {
  if (row.due_state === "overdue") {
    if (row.overdue_days <= 0) return "Overdue";
    return `Overdue by ${row.overdue_days} day${row.overdue_days === 1 ? "" : "s"}`;
  }
  if (row.due_state === "today") return "Due today";
  if (row.due_state === "upcoming") return `Due ${row.due_display}`;
  return "No due date";
}

/* Priority reads as a small chip: High wears the one attention state, Medium is
   neutral, Low is muted. None or unset shows no chip. */
function priorityChip(priority: string | null) {
  if (!priority || priority === "None") return null;
  const variant: ChipVariant =
    priority === "High" ? "warn" : priority === "Medium" ? "info" : "mut";
  return <Chip variant={variant}>{priority}</Chip>;
}

/* "2 overdue, 1 due today" from the counts, dropping the zero parts. Falls back
   to a calm line when nothing is pressing. */
function urgencyLine(data: MyTasksData): string {
  const parts: string[] = [];
  if (data.overdue_count > 0) parts.push(`${data.overdue_count} overdue`);
  if (data.due_today_count > 0) parts.push(`${data.due_today_count} due today`);
  if (parts.length > 0) return parts.join(", ");
  return "Your open tasks, soonest first.";
}

function MyTasksSkeleton() {
  return (
    <div className="flex flex-col gap-[9px] pt-1">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} height={38} />
      ))}
    </div>
  );
}

export function MyTasksPanel({ person }: { person: string }) {
  const asParam = useSearchParams().get("as") ?? undefined;
  const query = useQuery({
    queryKey: qk.myTasks(person),
    queryFn: () => fetchEnvelope<MyTasksData>("my_tasks", "/tasks/mine"),
  });

  const data = query.data?.data;
  const urgent = data ? data.overdue_count > 0 || data.due_today_count > 0 : false;

  return (
    <Card
      id="p-my-tasks"
      data-focus-id="p-my-tasks"
      className={urgent ? "border-l-2 border-l-accent" : undefined}
    >
      <CardHeader
        title="My tasks"
        subtitle={data ? urgencyLine(data) : "Your open tasks, soonest first."}
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={<MyTasksSkeleton />}
          isEmpty={(d) => d.rows.length === 0}
          emptyCopy="You are all caught up."
        >
          {(d, _meta, flags) => (
            <div
              className={`divide-y divide-line-soft ${flags.unreliable ? "opacity-55" : ""}`}
            >
              {d.rows.map((row) => {
                const attention =
                  row.due_state === "overdue" || row.due_state === "today";
                const Icon =
                  row.due_state === "overdue"
                    ? AlertCircle
                    : row.due_state === "today"
                      ? Clock
                      : Calendar;
                return (
                  <Link
                    key={row.id}
                    href={boardTaskHref(row.tab, row.project_id, row.id, asParam)}
                    aria-label={`Open ${row.title} on the board`}
                    className="flex items-start gap-[11px] px-0.5 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] ${attention ? OVERDUE_TILE : CALM_TILE}`}
                    >
                      <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block text-[13px] font-semibold text-title">
                        {row.title}
                      </b>
                      <span className="block text-xs text-ink-2">{dueWords(row)}</span>
                    </div>
                    {priorityChip(row.priority) ? (
                      <span className="shrink-0 self-center">
                        {priorityChip(row.priority)}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </QueryPanel>
      </div>
      {data ? (
        <CardFooter
          note="Open a task to work on it in the board."
          right={<Link href={buildDeepLink({ view: "board" }, asParam)}>Open the board</Link>}
        />
      ) : null}
    </Card>
  );
}

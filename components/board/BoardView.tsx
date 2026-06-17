"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  BoardAssignableUser,
  BoardCard,
  BoardData,
} from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { FieldSelect } from "@/components/ui/Field";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { TaskDetailModal } from "@/components/board/TaskDetailModal";
import { AddTaskModal } from "@/components/board/AddTaskModal";

/* The kanban body of the Team board: a horizontal scroll of status columns
   served by /api/board, in the server's column order (legacy ProjectsBoard
   semantics; unknown statuses are appended server-side, never dropped).

   A card moves between columns by drag and drop, using native HTML5 drag
   events so there is no runtime dependency and nothing to verify against
   React 19. Dropping on a column writes the new status to Zoho through the
   unified PATCH, optimistic against the query cache with rollback, then
   invalidated so the next read carries Zoho's truth. The per-card status
   dropdown is gone; the keyboard and screen-reader path to change status now
   lives inside the card detail panel, which opens on click.

   Two client-side filters (assignee, priority) sit above the columns and
   narrow the loaded cards without refetching. An Add task button opens the
   create form, preselecting the current tasklist. */

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

/* Severity in words, warn is the only attention state; High wears it,
   everything else stays calm. No red exists in this design system. */
const PRIORITY_VARIANTS: Record<string, ChipVariant> = {
  High: "warn",
  Medium: "info",
  Low: "mut",
};

/* The priority filter offers every Zoho priority plus an all option. None is
   the unset value, which the card carries as null or the literal "None". */
const PRIORITY_FILTER_OPTIONS = ["High", "Medium", "Low", "None"] as const;

type BoardEnvelope = Envelope<BoardData>;

type BoardViewProps = {
  tab: string;
  projectId: string;
  tasklistId: string | null;
};

export function BoardView({ tab, projectId, tasklistId }: BoardViewProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const key = qk.board(tab, projectId, tasklistId ?? "");

  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchEnvelope<BoardData>("board", "/board", {
        tab,
        project: projectId,
        ...(tasklistId ? { tasklist: tasklistId } : {}),
      }),
    staleTime: 60_000,
  });

  /* The owner picker source, also reused to label the assignee filter. Loaded
     once and shared; the detail panel reads the same key. */
  const usersQuery = useQuery({
    queryKey: qk.boardAssignableUsers(),
    queryFn: () =>
      fetchEnvelope<BoardAssignableUser[]>(
        "board_assignable_users",
        "/board/assignable-users",
      ),
    staleTime: 10 * 60_000,
  });
  const users = usersQuery.data?.data ?? [];

  const moveMutation = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      mutateEnvelope<BoardCard>("board", "PATCH", `/board/task/${input.id}`, {
        status: input.status,
        project: projectId,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardEnvelope>(key);
      queryClient.setQueryData<BoardEnvelope>(key, (old) => {
        if (!old?.data) return old;
        let moved: BoardCard | null = null;
        const stripped = old.data.columns.map((column) => {
          const hit = column.cards.find((card) => card.id === input.id);
          if (!hit) return column;
          moved = { ...hit, status: input.status };
          const cards = column.cards.filter((card) => card.id !== input.id);
          return { ...column, cards, count: cards.length };
        });
        if (!moved) return old;
        const columns = stripped.map((column) =>
          column.status === input.status
            ? {
                ...column,
                cards: [moved as BoardCard, ...column.cards],
                count: column.count + 1,
              }
            : column,
        );
        return { ...old, data: { ...old.data, columns } };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: (_data, variables) => {
      toast(`Moved to ${variables.status}.`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["board"] });
    },
  });

  function handleDrop(status: string) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    /* Find the card's current status from the live cache so a drop on its own
       column is a no-op rather than a needless write. */
    const current = query.data?.data?.columns
      .flatMap((c) => c.cards)
      .find((card) => card.id === id);
    if (!current || current.status === status) return;
    moveMutation.mutate({ id, status });
  }

  /* Client-side filter over the loaded cards. Priority None matches a card
     whose priority is null or the literal "None". */
  const matches = useMemo(() => {
    return (card: BoardCard) => {
      if (assigneeFilter && card.owner_zpuid !== assigneeFilter) return false;
      if (priorityFilter) {
        const p = card.priority ?? "None";
        if (p !== priorityFilter) return false;
      }
      return true;
    };
  }, [assigneeFilter, priorityFilter]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-[8px]">
        <FieldSelect
          aria-label="Filter by assignee"
          value={assigneeFilter}
          onChange={(event) => setAssigneeFilter(event.target.value)}
          className="w-auto"
        >
          <option value="">All assignees</option>
          {users.map((user) => (
            <option key={user.key} value={user.zpuid}>
              {user.name}
            </option>
          ))}
        </FieldSelect>

        <FieldSelect
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
          className="w-auto"
        >
          <option value="">All priorities</option>
          {PRIORITY_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </FieldSelect>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => setAddOpen(true)}
        >
          <Plus strokeWidth={1.8} aria-hidden="true" />
          Add task
        </Button>
      </div>

      <QueryPanel query={query} skeleton={<BoardSkeleton />}>
        {(data) => (
          <div
            className="mt-[12px] flex items-start gap-[14px] overflow-x-auto pb-3"
            aria-label={`${data.project_name} board${data.tasklist_name ? `, ${data.tasklist_name.trim()}` : ""}`}
          >
            {data.columns.map((column) => {
              const visible = column.cards.filter(matches);
              return (
                <section
                  key={column.status}
                  aria-label={`${column.status}, ${visible.length} task${visible.length === 1 ? "" : "s"}`}
                  onDragOver={(event) => {
                    if (dragId) event.preventDefault();
                  }}
                  onDrop={() => handleDrop(column.status)}
                  className="flex w-[272px] shrink-0 flex-col rounded-card border border-line-soft bg-surface-2"
                >
                  <header className="flex items-center justify-between px-[14px] pb-[6px] pt-[11px]">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                      {column.status}
                    </span>
                    <span className="num rounded-full border border-line bg-surface px-[8px] py-px text-[11px] font-bold text-ink-2">
                      {visible.length}
                    </span>
                  </header>
                  <div className="flex flex-col gap-[9px] px-[10px] pb-[12px]">
                    {visible.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-ink-3">
                        Nothing here.
                      </p>
                    ) : (
                      visible.map((card) => (
                        <TaskCard
                          key={card.id}
                          card={card}
                          dragging={dragId === card.id}
                          onDragStart={() => setDragId(card.id)}
                          onDragEnd={() => setDragId(null)}
                          onOpen={() => setOpenTaskId(card.id)}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </QueryPanel>

      {openTaskId ? (
        <TaskDetailModal
          taskId={openTaskId}
          projectId={projectId}
          onClose={() => setOpenTaskId(null)}
        />
      ) : null}

      <AddTaskModal
        open={addOpen}
        projectId={projectId}
        tasklistId={tasklistId}
        users={users}
        onClose={() => setAddOpen(false)}
      />
    </>
  );
}

type TaskCardProps = {
  card: BoardCard;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
};

function TaskCard({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: TaskCardProps) {
  const priorityVariant =
    card.priority && card.priority !== "None"
      ? (PRIORITY_VARIANTS[card.priority] ?? "mut")
      : null;

  return (
    <Card
      className={`cursor-pointer p-[12px] focus:outline-2 focus:outline-accent focus:outline-offset-0 ${
        dragging ? "opacity-55" : ""
      }`}
    >
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onOpen}
        aria-label={`Open "${card.title}"`}
        className="block w-full cursor-pointer text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-[13px] font-medium leading-snug text-title">
            {card.title}
          </span>
          {priorityVariant ? (
            <Chip variant={priorityVariant} className="shrink-0">
              {card.priority}
            </Chip>
          ) : null}
        </div>
        <span className="mt-[6px] block text-xs text-ink-3">
          {card.owner}
          {card.due_display ? ` · due ${card.due_display}` : ""}
        </span>
      </button>
    </Card>
  );
}

/* Plain blocks shaped like three columns of cards. No spinners. */
function BoardSkeleton() {
  return (
    <div className="mt-[12px] flex gap-[14px] overflow-hidden pb-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex w-[272px] shrink-0 flex-col gap-[9px]">
          <Skeleton width={120} height={12} />
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </div>
      ))}
    </div>
  );
}

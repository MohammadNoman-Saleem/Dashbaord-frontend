"use client";

import { AlertCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BoardCard, BoardData } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Card } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/* The kanban body of the Team board: a horizontal scroll of status columns
   served by /api/board, in the server's column order (legacy ProjectsBoard
   semantics; unknown statuses are appended server-side, never dropped).

   A card moves between columns through the select on the card, not drag and
   drop: a select is operable by keyboard and screen reader for free, and the
   board is a low-frequency tool where precision beats theatre. The move is
   optimistic against the query cache with rollback, then invalidated so the
   next read carries Zoho's truth. */

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

/* Severity in words, warn is the only attention state; High wears it,
   everything else stays calm. No red exists in this design system. */
const PRIORITY_VARIANTS: Record<string, ChipVariant> = {
  High: "warn",
  Medium: "info",
  Low: "mut",
};

type BoardEnvelope = Envelope<BoardData>;

type BoardViewProps = {
  tab: string;
  projectId: string;
  tasklistId: string | null;
};

export function BoardView({ tab, projectId, tasklistId }: BoardViewProps) {
  const toast = useToast();
  const queryClient = useQueryClient();

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

  return (
    <QueryPanel query={query} skeleton={<BoardSkeleton />}>
      {(data) => (
        <div
          className="flex items-start gap-[14px] overflow-x-auto pb-3"
          aria-label={`${data.project_name} board${data.tasklist_name ? `, ${data.tasklist_name.trim()}` : ""}`}
        >
          {data.columns.map((column) => (
            <section
              key={column.status}
              aria-label={`${column.status}, ${column.count} task${column.count === 1 ? "" : "s"}`}
              className="flex w-[272px] shrink-0 flex-col rounded-card border border-line-soft bg-surface-2"
            >
              <header className="flex items-center justify-between px-[14px] pb-[6px] pt-[11px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  {column.status}
                </span>
                <span className="num rounded-full border border-line bg-surface px-[8px] py-px text-[11px] font-bold text-ink-2">
                  {column.count}
                </span>
              </header>
              <div className="flex flex-col gap-[9px] px-[10px] pb-[12px]">
                {column.cards.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-ink-3">Nothing here.</p>
                ) : (
                  column.cards.map((card) => (
                    <TaskCard
                      key={card.id}
                      card={card}
                      statuses={data.columns.map((c) => c.status)}
                      onMove={(status) =>
                        moveMutation.mutate({ id: card.id, status })
                      }
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </QueryPanel>
  );
}

type TaskCardProps = {
  card: BoardCard;
  statuses: string[];
  onMove: (status: string) => void;
};

function TaskCard({ card, statuses, onMove }: TaskCardProps) {
  const priorityVariant =
    card.priority && card.priority !== "None"
      ? (PRIORITY_VARIANTS[card.priority] ?? "mut")
      : null;

  return (
    <Card className="p-[12px]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[13px] font-medium leading-snug text-title">
          {card.title}
        </p>
        {priorityVariant ? (
          <Chip variant={priorityVariant} className="shrink-0">
            {card.priority}
          </Chip>
        ) : null}
      </div>
      <p className="mt-[6px] text-xs text-ink-3">
        {card.owner}
        {card.due_display ? ` · due ${card.due_display}` : ""}
      </p>
      <select
        aria-label={`Move "${card.title}" to another status`}
        value={card.status}
        onChange={(event) => {
          if (event.target.value !== card.status) onMove(event.target.value);
        }}
        className="mt-[9px] w-full cursor-pointer rounded-[9px] border border-line bg-surface-2 px-[9px] py-[5.5px] text-xs font-medium text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </Card>
  );
}

/* Plain blocks shaped like three columns of cards. No spinners. */
function BoardSkeleton() {
  return (
    <div className="flex gap-[14px] overflow-hidden pb-3">
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

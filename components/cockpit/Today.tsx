"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip, type ChipVariant } from "@/components/ui/Chip";
import { PatientRef } from "@/components/ui/PatientRef";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TodayData, TodayRow } from "@/lib/api/contract";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { Modal, ModalTitle, ModalText, ModalRow } from "@/components/ui/Modal";
import { pickSuggestion, pickFromChange, type SuggestedChange } from "@/lib/cockpit/suggestions";

/* The unified "Today" list: the cockpit home. One row per case, merging its SLA
   clock with its open messages and the top AI suggestion, most-urgent first.

   Flat rows on a strict 4-column grid (identity | status | action | menu) so
   every chip, button, and menu line up down the whole list (Linear style). The
   whole row is the tap target; selection is a filled highlight and opens the
   case in the detail pane. At most one action button per row: Confirm when the
   AI has a ready action, else Done when a message waits, else none. Mark done /
   Dismiss live behind the small "..." menu. */

type TodayProps = {
  person?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function dueVariant(tone: string): ChipVariant {
  if (tone === "good" || tone === "warn" || tone === "info" || tone === "mut") return tone;
  return "info";
}

function messageWord(n: number): string {
  return n + " message" + (n === 1 ? "" : "s");
}

/* A tier-2 suggestion waiting in the confirm modal. */
type PendingConfirm = {
  zohoId: string;
  change: SuggestedChange;
  eventId: string | null;
  label: string;
};

function TodayRowView({
  row,
  selected,
  onSelect,
  onConfirm,
  onModal,
  onResolve,
  busy,
}: {
  row: TodayRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onConfirm: (v: { zohoId: string; change: SuggestedChange; eventId: string | null }) => void;
  onModal: (v: PendingConfirm) => void;
  onResolve: (v: { ids: string[]; action: "done" | "dismiss" }) => void;
  busy: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const zohoId = row.lead_ref?.zoho_id ?? null;
  const snippet = row.events.find((e) => e.message_snippet)?.message_snippet ?? null;
  // Message summary/suggestion win; the proactive (state) ones are the fallback.
  const summary =
    row.events.map((e) => e.triage?.summary).find(Boolean) ?? row.ai_summary ?? null;
  const hasMsg = row.events.length > 0;
  const suggestion =
    pickSuggestion(row.events, row.stage_or_status) ??
    pickFromChange(
      row.ai_suggestion?.change,
      row.ai_suggestion?.stage_at,
      // On a silent row stage_or_status is the queue step label, never equal to
      // the CRM stage stage_at records, so comparing would flag every proactive
      // suggestion stale and hide its Confirm. Compare only when a message
      // group supplied the real CRM stage.
      hasMsg ? row.stage_or_status : null,
    );
  const fresh = suggestion && !suggestion.stale ? suggestion : null;
  const eventIds = row.events.map((e) => e.id);

  // The single context line: what is going on with the case. The suggested
  // action is never spelled here; it lives in the Confirm button only.
  const line2 =
    summary ??
    snippet ??
    row.next_action ??
    [row.stage_or_status, row.pipeline, hasMsg ? messageWord(row.events.length) : null]
      .filter(Boolean)
      .join(" · ");

  const open = () => {
    if (zohoId) onSelect(zohoId);
  };
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role={zohoId ? "button" : undefined}
      tabIndex={zohoId ? 0 : undefined}
      onClick={open}
      onKeyDown={
        zohoId
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }
          : undefined
      }
      className={`grid min-h-[52px] grid-cols-[minmax(0,1fr)_72px_24px] items-center gap-x-2.5 px-[18px] py-[10px] ${
        zohoId ? "cursor-pointer" : ""
      } ${selected ? "bg-accessible-soft" : "hover:bg-surface-2"}`}
    >
      {/* col 1: identity + status chip on the first line, the context line under
          them at full width so the summary is what the eye actually reads. */}
      <div className="min-w-0 leading-tight">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1 text-[13px] font-semibold text-title">
            {row.lead_ref ? (
              <PatientRef patient={{ ...row, ...row.lead_ref }} />
            ) : (
              <span className="text-ink-2">New number</span>
            )}
          </div>
          <span className="shrink-0">
            {row.due ? (
              <Chip variant={dueVariant(row.due.tone)}>{row.due.label}</Chip>
            ) : hasMsg ? (
              <Chip variant="info">{messageWord(row.events.length)}</Chip>
            ) : null}
          </span>
        </div>
        <div className="mt-[3px] truncate text-[11.5px] leading-[16px] text-ink-3">{line2}</div>
      </div>

      {/* col 2: the one action (fixed width, quiet so the list stays calm) */}
      <span className="w-full">
        {fresh && zohoId ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-accent-text"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              if (fresh.modal) {
                onModal({ zohoId, change: fresh.change, eventId: fresh.eventId, label: fresh.label });
              } else {
                onConfirm({ zohoId, change: fresh.change, eventId: fresh.eventId });
              }
            }}
          >
            Confirm
          </Button>
        ) : hasMsg ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              onResolve({ ids: eventIds, action: "done" });
            }}
          >
            Done
          </Button>
        ) : null}
      </span>

      {/* col 3: overflow menu (messages only) */}
      <span className="justify-self-center">
        {hasMsg ? (
          <div
            className="relative"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenuOpen(false);
            }}
          >
            <button
              type="button"
              aria-label="More actions"
              onClick={(e) => {
                stop(e);
                setMenuOpen((o) => !o);
              }}
              className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 hover:bg-surface-2 hover:text-title"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-[32px] z-10 w-[140px] rounded-[10px] border border-line bg-surface p-1 shadow-pop">
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    setMenuOpen(false);
                    onResolve({ ids: eventIds, action: "done" });
                  }}
                  className="block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-2"
                >
                  Mark done
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    setMenuOpen(false);
                    onResolve({ ids: eventIds, action: "dismiss" });
                  }}
                  className="block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] text-ink-2 hover:bg-surface-2"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </span>
    </div>
  );
}

/* Rows shown before "Show all": enough to fill a day's first pass while the
   landing stays one calm screen next to the case file. */
const PAGE = 12;

export function CockpitToday({ person, selectedId, onSelect }: TodayProps) {
  const client = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const query = useQuery({
    queryKey: qk.cockpitToday(person ?? "all"),
    queryFn: () =>
      fetchEnvelope<TodayData>("cockpit_today", "/cockpit/today", { person }),
    refetchInterval: 40_000,
  });

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ["cockpit"] });
    client.invalidateQueries({ queryKey: qk.inbox() });
  };

  const confirm = useMutation({
    mutationFn: async (v: { zohoId: string; change: SuggestedChange; eventId: string | null }) => {
      await mutateEnvelope("cockpit_case_write", "POST", `/cockpit/case/${v.zohoId}/write`, {
        change: v.change,
      });
      // A proactive (state) suggestion has no message event to clear.
      if (v.eventId) {
        await mutateEnvelope("events_resolve", "POST", "/events/resolve", {
          ids: [v.eventId],
          action: "done",
        });
      }
    },
    onSuccess: invalidate,
  });

  const resolve = useMutation({
    mutationFn: (v: { ids: string[]; action: "done" | "dismiss" }) =>
      mutateEnvelope("events_resolve", "POST", "/events/resolve", v),
    onSuccess: invalidate,
  });

  const refresh = useMutation({
    mutationFn: () =>
      mutateEnvelope<{ refreshed: number; skipped: number; remaining: number }>(
        "cockpit_summaries_refresh",
        "POST",
        "/cockpit/summaries/refresh",
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.cockpitToday(person ?? "all") }),
  });

  const busy = confirm.isPending || resolve.isPending;
  const refreshInfo = refresh.data?.data ?? null;

  return (
    <QueryPanel
      query={query}
      skeleton={
        <Card>
          <CardHeader title="Today" />
          <div className="flex flex-col gap-2 px-[18px] py-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={48} />
            ))}
          </div>
        </Card>
      }
    >
      {(d) => (
        <>
        <Card>
          <CardHeader
            title="Today"
            right={
              <span className="flex items-center gap-2">
                <Chip variant={d.counts.due_now > 0 ? "warn" : "info"}>
                  {`${d.counts.total} to do · ${d.counts.due_now} due now`}
                </Chip>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={refresh.isPending}
                  onClick={() => refresh.mutate()}
                >
                  {refresh.isPending ? "Refreshing..." : "Refresh summaries"}
                </Button>
              </span>
            }
          />
          {refreshInfo ? (
            <p className="px-[18px] pb-1 text-[11px] text-ink-3">
              {`Refreshed ${refreshInfo.refreshed} summar${refreshInfo.refreshed === 1 ? "y" : "ies"}`}
              {refreshInfo.remaining > 0 ? `, ${refreshInfo.remaining} left (refresh again)` : ""}
            </p>
          ) : null}
          <div className="pb-1 pt-1">
            {d.rows.length === 0 ? (
              <p className="px-[18px] py-6 text-center text-[13px] text-ink-2">
                All clear. Nothing is due and no messages are waiting.
              </p>
            ) : (
              <div className="divide-y divide-line-soft">
                {(showAll ? d.rows : d.rows.slice(0, PAGE)).map((row, i) => (
                  <TodayRowView
                    key={row.lead_ref?.zoho_id ?? `unmatched-${i}`}
                    row={row}
                    selected={!!row.lead_ref && row.lead_ref.zoho_id === selectedId}
                    onSelect={onSelect}
                    onConfirm={confirm.mutate}
                    onModal={setPending}
                    onResolve={resolve.mutate}
                    busy={busy}
                  />
                ))}
              </div>
            )}
            {!showAll && d.rows.length > PAGE ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full border-t border-line-soft py-2 text-[12px] font-medium text-accent-text hover:bg-surface-2"
              >
                Show all {d.rows.length}
              </button>
            ) : null}
          </div>
        </Card>
        <Modal
          open={pending != null}
          onClose={() => setPending(null)}
          aria-label="Confirm suggested change"
        >
          <ModalTitle>Confirm suggested change</ModalTitle>
          <ModalText>{pending?.label}</ModalText>
          <ModalRow>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !pending}
              onClick={() => {
                if (!pending) return;
                confirm.mutate(
                  { zohoId: pending.zohoId, change: pending.change, eventId: pending.eventId },
                  { onSuccess: () => setPending(null) },
                );
              }}
            >
              Confirm
            </Button>
          </ModalRow>
        </Modal>
        </>
      )}
    </QueryPanel>
  );
}

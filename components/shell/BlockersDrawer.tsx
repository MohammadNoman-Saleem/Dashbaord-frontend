"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AlertCircle, Check, MinusCircle, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BlockerItem, BlockersData } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer, type Viewer } from "@/lib/viewer";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/* Blockers drawer (06 group F). The pattern mirror is the urgent board:
   same 400px right slide-over, same interaction grammar (scrim and Escape
   close, focus trapped while open, optimistic writes against the shared
   query cache), different ownership semantics. Urgent means "needs
   attention now, anyone can act"; a blocker means "I am stuck, Aziz owns
   the unblock." Separate store, separate endpoint, separate badge; no item
   ever moves between the two boards automatically.

   Permissions: anyone raises. Unblock shows for operations (Aziz) and
   admins; the raiser sees Withdraw on their own open items instead. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LABEL_CLASSES =
  "block pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3";

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

/* Module-level counter for optimistic ids. The live endpoint assigns the
   real id once the write goes through saleem-api. */
let tmpIdCounter = 0;

type BlockersEnvelope = Envelope<BlockersData>;

export function canUnblock(me: Viewer | null): boolean {
  return me != null && (me.role === "admin" || me.department === "operations");
}

type BlockersDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function BlockersDrawer({ open, onClose }: BlockersDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [text, setText] = useState("");
  const [waitingOn, setWaitingOn] = useState("");

  /* Writes attribute to the real signed-in person, never the viewed person
     (03 section 3), so this reads me rather than effectivePerson. */
  const { me } = useViewer();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.blockers(),
    queryFn: () => fetchEnvelope<BlockersData>("blockers", "/blockers"),
    staleTime: 30_000,
  });

  /* Focus in on open, restore to the opener on close. */
  useEffect(() => {
    if (!open) return;
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();
    return () => {
      restoreRef.current?.focus();
      restoreRef.current = null;
    };
  }, [open]);

  function applyBlockers(update: (data: BlockersData) => BlockersData) {
    queryClient.setQueryData<BlockersEnvelope>(qk.blockers(), (old) => {
      if (!old?.data) return old;
      return { ...old, data: update(old.data) };
    });
  }

  const raiseMutation = useMutation({
    mutationFn: (input: { text: string; waiting_on?: string }) =>
      mutateEnvelope<BlockerItem>("blockers", "POST", "/blockers", input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.blockers() });
      const previous = queryClient.getQueryData<BlockersEnvelope>(qk.blockers());
      tmpIdCounter += 1;
      const item: BlockerItem = {
        id: `tmp-${tmpIdCounter}`,
        text: input.text,
        waiting_on: input.waiting_on ?? null,
        raised_by: me?.person ?? "",
        raised_by_name: me?.name ?? "You",
        raised_at: new Date().toISOString(),
        age_label: "just now",
        status: "open",
        repeat_of: null,
        root_cause_flag: false,
        resolution_note: null,
      };
      applyBlockers((data) => ({ ...data, open: [item, ...data.open] }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(qk.blockers(), context.previous);
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: () => {
      toast("Raised. Aziz picks blockers up the same day.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.blockers() });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { id: string; action: "unblock" | "withdraw" }) =>
      mutateEnvelope<BlockerItem>("blockers", "PATCH", `/blockers/${input.id}`, {
        action: input.action,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.blockers() });
      const previous = queryClient.getQueryData<BlockersEnvelope>(qk.blockers());
      applyBlockers((data) => {
        const item = data.open.find((row) => row.id === input.id);
        if (!item) return data;
        const resolved: BlockerItem = {
          ...item,
          status: input.action === "unblock" ? "unblocked" : "withdrawn",
          resolution_note:
            input.action === "unblock"
              ? `Unblocked by ${me?.name ?? "the team"}`
              : "Withdrawn by the raiser",
        };
        return {
          open: data.open.filter((row) => row.id !== input.id),
          resolved: [resolved, ...data.resolved],
        };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(qk.blockers(), context.previous);
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: (_data, variables) => {
      toast(
        variables.action === "unblock"
          ? "Marked unblocked. Root cause noted where it repeats."
          : "Withdrawn. It comes off the board.",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.blockers() });
    },
  });

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleRaise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const waiting = waitingOn.trim();
    raiseMutation.mutate({ text: trimmed, ...(waiting ? { waiting_on: waiting } : {}) });
    setText("");
    setWaitingOn("");
  }

  function rowAction(item: BlockerItem) {
    if (canUnblock(me)) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => resolveMutation.mutate({ id: item.id, action: "unblock" })}
        >
          Unblocked
        </Button>
      );
    }
    if (me && item.raised_by === me.person) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => resolveMutation.mutate({ id: item.id, action: "withdraw" })}
        >
          Withdraw
        </Button>
      );
    }
    return undefined;
  }

  function subLine(item: BlockerItem): string {
    const parts = [item.raised_by_name, item.age_label];
    if (item.waiting_on) parts.push(`waiting on ${item.waiting_on}`);
    return parts.join(" · ");
  }

  return (
    <>
      {open ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[70] bg-trust-ink/50"
          onMouseDown={onClose}
        />
      ) : null}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Blockers"
        tabIndex={-1}
        inert={!open}
        onKeyDown={handleKeyDown}
        className={`fixed right-0 top-0 z-[80] flex h-dvh w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface shadow-pop transition-transform duration-[250ms] ease-out motion-reduce:transition-none max-[480px]:w-full max-[480px]:max-w-none ${
          open ? "translate-x-0" : "translate-x-[102%]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line-soft px-[18px] py-4">
          <h3 className="text-[17px]">Blockers</h3>
          <IconButton aria-label="Close" onClick={onClose}>
            <X strokeWidth={1.8} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] py-[14px]">
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
            Stuck on something outside your control? Raise it here. It goes straight to Aziz,
            who owns the unblock and the root cause. Same idea as raising a requirement to IT.
          </p>
          <QueryPanel query={query} skeleton={<DrawerSkeleton />}>
            {(data) => (
              <>
                <span className={LABEL_CLASSES}>Open · {data.open.length}</span>
                {data.open.length === 0 ? (
                  <p className="px-0.5 py-2 text-[12.5px] text-ink-3">
                    Nothing blocked. Clear road.
                  </p>
                ) : (
                  <div>
                    {data.open.map((item) => (
                      <ListRow
                        key={item.id}
                        icon={MinusCircle}
                        variant={item.root_cause_flag ? "warn" : "info"}
                        title={item.text}
                        subtitle={
                          item.root_cause_flag ? (
                            <span className="flex flex-col items-start gap-1">
                              <span>{subLine(item)}</span>
                              <Chip variant="warn">Repeat, root cause review</Chip>
                            </span>
                          ) : (
                            subLine(item)
                          )
                        }
                        right={rowAction(item)}
                      />
                    ))}
                  </div>
                )}
                <span className={`${LABEL_CLASSES} pt-4`}>Unblocked this week</span>
                <div className="opacity-[.62]">
                  {data.resolved.map((item) => (
                    <ListRow
                      key={item.id}
                      icon={Check}
                      variant="good"
                      title={item.text}
                      subtitle={[item.raised_by_name, item.age_label, item.resolution_note]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
                </div>
                <p className="mt-[14px] text-[11.5px] leading-relaxed text-ink-3">
                  Whatever is still open on Saturday becomes the Blocked section of your weekly
                  update. A second occurrence triggers a root cause review.
                </p>
              </>
            )}
          </QueryPanel>
        </div>

        <form
          className="border-t border-line-soft px-[18px] py-[13px]"
          onSubmit={handleRaise}
        >
          <Field label="What is blocked" htmlFor="blocker-new-item">
            <FieldInput
              id="blocker-new-item"
              placeholder="What is blocking you, and who are you waiting on?"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <Field
            label="Waiting on (optional)"
            htmlFor="blocker-waiting-on"
            className="mb-[10px]"
          >
            <FieldInput
              id="blocker-waiting-on"
              placeholder="Who or what you are waiting on"
              autoComplete="off"
              value={waitingOn}
              onChange={(event) => setWaitingOn(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full justify-center">
            Raise to Aziz
          </Button>
        </form>
      </aside>
    </>
  );
}

/* Plain blocks matching the drawer body layout. No spinners. */
function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-1">
      <Skeleton width={72} height={10} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton width={130} height={10} className="mt-3" />
      <Skeleton height={44} />
    </div>
  );
}

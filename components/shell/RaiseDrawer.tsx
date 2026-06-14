"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AlertCircle, Check, ExternalLink, MinusCircle, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  BlockerItem,
  BlockersData,
  ItSupportTicketData,
  OpsRaiseResultData,
} from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer, type Viewer } from "@/lib/viewer";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { Pills } from "@/components/ui/Pills";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/* Raise drawer (06 group F, plus the build lead's ticket-and-blocker merge).
   One 400px right slide-over for raising work, with a type toggle:

     IT  -> a Zoho helpdesk ticket in the IT and Product project, via
            /api/it-support (the existing flow, moved here off the board
            page, unchanged). SLA-derived due date, priority-routed owners.
     Ops -> a dual write via /api/blockers/ops: one Zoho task in the
            Cross-Department Ops tasklist AND one blocker for Aziz. The
            server reports a partial outcome honestly; this drawer surfaces
            it rather than claiming a clean success.

   The open-items list under the form is the blockers board: anyone raises,
   Aziz (operations) or an admin unblocks, the raiser withdraws their own.
   Ops blockers carry a Zoho task link when the dual write landed. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LABEL_CLASSES =
  "block pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3";

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

const ZOHO_TASK_URL =
  "https://projects.zoho.com/portal/tellsaleemdotcom#taskdetail/";

const IT_PRIORITIES = [
  { key: "critical", label: "Critical, work is stopped" },
  { key: "high", label: "High, blocking soon" },
  { key: "medium", label: "Medium, needs a plan" },
  { key: "low", label: "Low, when there is time" },
];

/* Module-level counter for optimistic ids. The live endpoint assigns the
   real id once the write goes through saleem-api. */
let tmpIdCounter = 0;

type RaiseType = "it" | "ops";

type BlockersEnvelope = Envelope<BlockersData>;

export function canUnblock(me: Viewer | null): boolean {
  return me != null && (me.role === "admin" || me.department === "operations");
}

type RaiseDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function RaiseDrawer({ open, onClose }: RaiseDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const [raiseType, setRaiseType] = useState<RaiseType>("ops");

  /* Ops form. */
  const [text, setText] = useState("");
  const [waitingOn, setWaitingOn] = useState("");

  /* IT form. */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

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
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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

  /* Ops raise is the dual write. It is optimistic against the blockers cache
     like a plain blocker, then reconciled from the server, which is the
     authority on whether both legs landed. */
  const opsMutation = useMutation({
    mutationFn: (input: { text: string; waiting_on?: string }) =>
      mutateEnvelope<OpsRaiseResultData>(
        "blockers",
        "POST",
        "/blockers/ops",
        input,
      ),
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
        zoho_task_id: null,
      };
      applyBlockers((data) => ({ ...data, open: [item, ...data.open] }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(qk.blockers(), context.previous);
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: (envelope) => {
      const result = envelope?.data;
      /* Honest partial-outcome surface: the server tells us which legs
         landed. Never claim a clean success when one half failed. */
      if (result && !result.zoho_task_id && result.blocker) {
        toast(
          "Raised to Aziz. The Zoho Ops task did not file; tell Al Saeed.",
          AlertCircle,
        );
      } else if (result && result.zoho_task_id && !result.blocker) {
        toast(
          "Zoho Ops task filed, but the blocker did not save; tell Al Saeed.",
          AlertCircle,
        );
      } else if (result && !result.zoho_task_id && !result.blocker) {
        toast(WRITE_FAILURE_COPY, AlertCircle);
      } else {
        toast("Raised. Aziz owns the unblock; a Zoho Ops task is on the board.");
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.blockers() });
    },
  });

  const itMutation = useMutation({
    mutationFn: () =>
      mutateEnvelope<ItSupportTicketData>(
        "it_support",
        "POST",
        "/it-support",
        {
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          priority,
        },
      ),
    onSuccess: (envelope) => {
      const id = envelope?.data?.ticket_id;
      toast(
        id
          ? `Ticket ${id} raised. IT picks it up within the SLA.`
          : "Ticket raised. IT picks it up within the SLA.",
      );
      /* The new ticket is a card on the IT board. */
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      setTitle("");
      setDescription("");
      setPriority("medium");
    },
    onError: () => {
      toast(WRITE_FAILURE_COPY, AlertCircle);
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
      if (context?.previous)
        queryClient.setQueryData(qk.blockers(), context.previous);
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
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
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

  function handleOpsRaise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    const waiting = waitingOn.trim();
    opsMutation.mutate({
      text: trimmed,
      ...(waiting ? { waiting_on: waiting } : {}),
    });
    setText("");
    setWaitingOn("");
  }

  function handleItRaise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 3 || itMutation.isPending) return;
    itMutation.mutate();
  }

  function rowAction(item: BlockerItem) {
    // Ownership wins over role: a raiser always withdraws their own item,
    // even when they could also unblock (an informally resolved blocker is
    // a withdrawal, not an unblock with a synthesized resolution note).
    if (me && item.raised_by === me.person) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            resolveMutation.mutate({ id: item.id, action: "withdraw" })
          }
        >
          Withdraw
        </Button>
      );
    }
    if (canUnblock(me)) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            resolveMutation.mutate({ id: item.id, action: "unblock" })
          }
        >
          Mark unblocked
        </Button>
      );
    }
    return undefined;
  }

  function subLine(item: BlockerItem) {
    const parts = [item.raised_by_name, item.age_label];
    if (item.waiting_on) parts.push(`waiting on ${item.waiting_on}`);
    const base = parts.join(" · ");
    if (!item.zoho_task_id) return base;
    return (
      <span className="flex flex-col items-start gap-1">
        <span>{base}</span>
        <a
          href={`${ZOHO_TASK_URL}${item.zoho_task_id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:underline"
        >
          <ExternalLink strokeWidth={1.8} className="h-[12px] w-[12px]" />
          Ops task on Zoho
        </a>
      </span>
    );
  }

  const itCanSubmit = title.trim().length >= 3 && !itMutation.isPending;

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
        aria-label="Raise"
        tabIndex={-1}
        inert={!open}
        onKeyDown={handleKeyDown}
        className={`fixed right-0 top-0 z-[80] flex h-dvh w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface shadow-pop transition-transform duration-[250ms] ease-out motion-reduce:transition-none max-[480px]:w-full max-[480px]:max-w-none ${
          open ? "translate-x-0" : "translate-x-[102%]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line-soft px-[18px] py-4">
          <h3 className="text-[17px]">Raise</h3>
          <IconButton aria-label="Close" onClick={onClose}>
            <X strokeWidth={1.8} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] py-[14px]">
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
            Stuck on something, or need IT? Raise it here. Ops items go to Aziz,
            who owns the unblock and the root cause, and open a Zoho Ops task.
            IT items go onto the IT board with a due date from the priority.
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
                              {subLine(item)}
                              <Chip variant="warn">
                                Repeat, root cause review
                              </Chip>
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
                <span className={`${LABEL_CLASSES} pt-4`}>
                  Unblocked this week
                </span>
                <div className="opacity-[.62]">
                  {data.resolved.map((item) => (
                    <ListRow
                      key={item.id}
                      icon={Check}
                      variant="good"
                      title={item.text}
                      subtitle={[
                        item.raised_by_name,
                        item.age_label,
                        item.resolution_note,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
                </div>
                <p className="mt-[14px] text-[11.5px] leading-relaxed text-ink-3">
                  Whatever is still open on Saturday becomes the Blocked section
                  of your weekly update. A second occurrence triggers a root
                  cause review.
                </p>
              </>
            )}
          </QueryPanel>
        </div>

        <div className="border-t border-line-soft px-[18px] py-[13px]">
          <div className="pb-[10px]">
            <Pills
              aria-label="What are you raising"
              items={[
                { key: "ops", label: "Ops blocker" },
                { key: "it", label: "IT ticket" },
              ]}
              value={raiseType}
              onChange={(key) => setRaiseType(key as RaiseType)}
            />
          </div>

          {raiseType === "ops" ? (
            <form onSubmit={handleOpsRaise}>
              <Field label="What is blocked" htmlFor="raise-ops-text">
                <FieldInput
                  id="raise-ops-text"
                  placeholder="What is blocking you, and who are you waiting on?"
                  autoComplete="off"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </Field>
              <Field
                label="Waiting on (optional)"
                htmlFor="raise-ops-waiting"
                className="mb-[10px]"
              >
                <FieldInput
                  id="raise-ops-waiting"
                  placeholder="Who or what you are waiting on"
                  autoComplete="off"
                  value={waitingOn}
                  onChange={(event) => setWaitingOn(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={text.trim().length < 3 || opsMutation.isPending}
              >
                {opsMutation.isPending ? "Raising..." : "Raise to Aziz"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleItRaise}>
              <Field label="What do you need" htmlFor="raise-it-title">
                <FieldInput
                  id="raise-it-title"
                  placeholder="One line, e.g. CRM export button fails"
                  autoComplete="off"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field label="Details (optional)" htmlFor="raise-it-description">
                <textarea
                  id="raise-it-description"
                  rows={3}
                  placeholder="What happened, where, and anything you already tried"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full resize-y rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
                />
              </Field>
              <Field
                label="Priority"
                htmlFor="raise-it-priority"
                className="mb-[10px]"
              >
                <FieldSelect
                  id="raise-it-priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {IT_PRIORITIES.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </FieldSelect>
              </Field>
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={!itCanSubmit}
              >
                {itMutation.isPending ? "Raising..." : "Raise IT ticket"}
              </Button>
            </form>
          )}
        </div>
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

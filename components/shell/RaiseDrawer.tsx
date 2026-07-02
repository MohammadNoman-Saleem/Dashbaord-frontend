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

import type { BlockerItem, BlockersData, ItSupportTicketData } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer, type Viewer } from "@/lib/viewer";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { Tabs } from "@/components/ui/Tabs";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/* Raise drawer (06 group F). One 400px right slide-over for raising an
   operational blocker via POST /api/blockers: one Postgres blocker for Aziz,
   who owns the unblock and the root cause.

   The open-items list under the form is the blockers board: anyone raises,
   Aziz (operations) or an admin unblocks, the raiser withdraws their own.

   The Ops dual write (POST /api/blockers/ops, the Zoho Cross-Dept/Ops task
   leg) and the IT ticket flow (POST /api/it-support) are both deferred and
   have no route, so the drawer raises a plain blocker only. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LABEL_CLASSES =
  "block pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3";

// Base URL for a Zoho Projects task; the board display path links a resolved
// blocker's zoho_task_id to its task in the portal.
const ZOHO_TASK_URL =
  "https://projects.zoho.com/portal/tellsaleemdotcom#taskdetail/";

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

type RaiseTab = "ops" | "it";

// IT ticket categories (each routes to a Zoho tasklist) and priorities (each
// drives the SLA and the owner routing). The server validates against the same
// lists; the SLA hint here is display only, in words, matching the resolution
// windows in IT_HELPDESK_SLA.
const IT_CATEGORIES = ["Bugs", "Features", "Access", "Integrations", "General"];

const IT_PRIORITIES: Array<{ key: string; label: string; sla: string }> = [
  { key: "critical", label: "Critical", sla: "Resolution due within 4 hours" },
  { key: "high", label: "High", sla: "Resolution due within 1 day" },
  { key: "medium", label: "Medium", sla: "Resolution due within 3 days" },
  { key: "low", label: "Low", sla: "Resolution due within 1 week" },
];

const IT_INPUT_CLASSES =
  "w-full rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0";

/* Module-level counter for optimistic ids. The live endpoint assigns the
   real id once the write goes through saleem-api. */
let tmpIdCounter = 0;

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

  /* Which raise: an ops blocker for Aziz, or an IT ticket for the IT team. */
  const [tab, setTab] = useState<RaiseTab>("ops");

  /* Ops form. */
  const [text, setText] = useState("");
  const [waitingOn, setWaitingOn] = useState("");

  /* IT ticket form. */
  const [itTitle, setItTitle] = useState("");
  const [itDescription, setItDescription] = useState("");
  const [itCategory, setItCategory] = useState("General");
  const [itPriority, setItPriority] = useState("medium");

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

  /* Ops raise posts a plain blocker for Aziz. It is optimistic against the
     blockers cache, then reconciled from the server. (The Zoho Cross-Dept/Ops
     task leg, POST /blockers/ops, is deferred and has no route.) */
  const opsMutation = useMutation({
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
    onSuccess: () => {
      toast("Raised. Aziz owns the unblock and the root cause.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.blockers() });
    },
  });

  /* IT ticket raise posts to /api/it-support, which creates a Zoho Projects
     task routed to IT. There is no optimistic list: IT tickets live in Zoho,
     not on the blockers board. */
  const itMutation = useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      category: string;
      priority: string;
    }) => mutateEnvelope<ItSupportTicketData>("it_support", "POST", "/it-support", input),
    onError: () =>
      toast(
        "Couldn't raise the IT ticket. Try again, or tell IT if it repeats.",
        AlertCircle,
      ),
    onSuccess: (data) => {
      const assigned = data?.data?.assigned_to ?? [];
      const who = assigned.length ? assigned.join(", ") : "the IT team";
      toast(`IT ticket raised. Assigned to ${who}.`, Check);
      setItTitle("");
      setItDescription("");
      setItCategory("General");
      setItPriority("medium");
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
    const title = itTitle.trim();
    if (title.length < 3 || itMutation.isPending) return;
    const description = itDescription.trim();
    itMutation.mutate({
      title,
      ...(description ? { description } : {}),
      category: itCategory,
      priority: itPriority,
    });
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

        <div className="px-[18px] pt-3">
          <Tabs
            items={[
              { key: "ops", label: "Ops blocker" },
              { key: "it", label: "IT ticket" },
            ]}
            value={tab}
            onChange={(key) => setTab(key as RaiseTab)}
            aria-label="Raise type"
          />
        </div>

        {tab === "it" ? (
          <div className="flex-1 overflow-y-auto px-[18px] py-[14px]">
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
              Raise an IT or product issue. It goes to the IT team in Zoho with
              an owner and a due date set from the priority.
            </p>
            <form onSubmit={handleItRaise} className="flex flex-col gap-[10px]">
              <div>
                <label className={LABEL_CLASSES} htmlFor="it-title">
                  Title
                </label>
                <input
                  id="it-title"
                  className={IT_INPUT_CLASSES}
                  autoComplete="off"
                  placeholder="Short summary of the issue"
                  value={itTitle}
                  onChange={(event) => setItTitle(event.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASSES} htmlFor="it-desc">
                  Description (optional)
                </label>
                <textarea
                  id="it-desc"
                  rows={4}
                  className={IT_INPUT_CLASSES}
                  placeholder="What happened, any steps, and anything that helps IT"
                  value={itDescription}
                  onChange={(event) => setItDescription(event.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASSES} htmlFor="it-category">
                  Category
                </label>
                <select
                  id="it-category"
                  className={IT_INPUT_CLASSES}
                  value={itCategory}
                  onChange={(event) => setItCategory(event.target.value)}
                >
                  {IT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASSES} htmlFor="it-priority">
                  Priority
                </label>
                <select
                  id="it-priority"
                  className={IT_INPUT_CLASSES}
                  value={itPriority}
                  onChange={(event) => setItPriority(event.target.value)}
                >
                  {IT_PRIORITIES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11.5px] text-ink-3">
                  {IT_PRIORITIES.find((p) => p.key === itPriority)?.sla ?? ""}
                </p>
              </div>
              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={itTitle.trim().length < 3 || itMutation.isPending}
              >
                {itMutation.isPending ? "Raising..." : "Raise IT ticket"}
              </Button>
            </form>
          </div>
        ) : (
          <>
        <div className="flex-1 overflow-y-auto px-[18px] py-[14px]">
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
            Stuck on something? Raise it here. It goes to Aziz, who owns the
            unblock and the root cause.
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
        </div>
          </>
        )}
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

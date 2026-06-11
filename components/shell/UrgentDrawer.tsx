"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AlertCircle, Check, Flag, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { UrgentData, UrgentItem } from "@/lib/api/contract";
import type { Envelope } from "@/lib/api/envelope";
import { fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { fmtAgo } from "@/lib/format/datetime";
import { useViewer } from "@/lib/viewer";
import { Button, IconButton } from "@/components/ui/Button";
import { FieldInput } from "@/components/ui/Field";
import { ListRow } from "@/components/ui/ListRow";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/* Urgent drawer. Mirrors .drawer from the approved mockup: a 400px right
   slide-over (full width under 480px) on the surface with a left hairline
   and the pop shadow, sliding in over 250ms. Open items render as warn
   ListRows with a ghost Resolve button; resolved items sit below at .62
   opacity. The add input is pinned at the bottom.

   Behavior per spec 02 section 9: the scrim and Escape close it, focus is
   trapped inside while open and restored to the opener on close. Add and
   resolve are optimistic writes against the shared urgent query cache, so
   the topbar pill count and the drawer header count update together. */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LABEL_CLASSES =
  "block pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3";

const WRITE_FAILURE_COPY =
  "Couldn't save. Your numbers are safe. Try again, or tell Al Saeed if it repeats.";

/* Module-level counter for optimistic ids. The live endpoint assigns the
   real id once writes go through saleem-api. */
let tmpIdCounter = 0;

type UrgentEnvelope = Envelope<UrgentData>;

/* Writes go through the fetcher seam: in fixture mode they settle with no
   server effect (the optimistic cache update is the whole story); in live
   mode they POST or PATCH saleem-api and onSettled refetches so optimistic
   temp rows reconcile with server truth. */

type UrgentDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function UrgentDrawer({ open, onClose }: UrgentDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [text, setText] = useState("");

  /* Writes attribute to the real signed-in person, never the viewed person
     (03 section 3), so this reads me rather than effectivePerson. */
  const { me } = useViewer();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.urgent(),
    queryFn: () => fetchEnvelope<UrgentData>("urgent", "/urgent"),
    /* Short staleTime per the key factory notes: optimistic writes should
       reconcile with the server quickly once the endpoint is live. */
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

  function applyUrgent(update: (data: UrgentData) => UrgentData) {
    queryClient.setQueryData<UrgentEnvelope>(qk.urgent(), (old) => {
      if (!old?.data) return old;
      return { ...old, data: update(old.data) };
    });
  }

  const addMutation = useMutation({
    mutationFn: (newText: string) =>
      mutateEnvelope<UrgentItem>("urgent", "POST", "/urgent", { text: newText }),
    onMutate: async (newText: string) => {
      await queryClient.cancelQueries({ queryKey: qk.urgent() });
      const previous = queryClient.getQueryData<UrgentEnvelope>(qk.urgent());
      tmpIdCounter += 1;
      const item: UrgentItem = {
        id: `tmp-${tmpIdCounter}`,
        text: newText,
        raised_by: me?.person ?? "",
        raised_by_name: me?.name ?? "You",
        created_at: new Date().toISOString(),
        resolved_at: null,
        resolved_by: null,
      };
      applyUrgent((data) => ({ ...data, open: [item, ...data.open] }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(qk.urgent(), context.previous);
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: () => {
      toast("Added to the urgent board.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.urgent() });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) =>
      mutateEnvelope<UrgentItem>("urgent", "PATCH", `/urgent/${id}/resolve`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: qk.urgent() });
      const previous = queryClient.getQueryData<UrgentEnvelope>(qk.urgent());
      applyUrgent((data) => {
        const item = data.open.find((row) => row.id === id);
        if (!item) return data;
        const resolved: UrgentItem = {
          ...item,
          resolved_at: new Date().toISOString(),
          resolved_by: me?.person ?? "",
        };
        return {
          open: data.open.filter((row) => row.id !== id),
          resolved: [resolved, ...data.resolved],
        };
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(qk.urgent(), context.previous);
      toast(WRITE_FAILURE_COPY, AlertCircle);
    },
    onSuccess: () => {
      toast("Marked resolved. The team sees it instantly.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.urgent() });
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

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    addMutation.mutate(trimmed);
    setText("");
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
        aria-label="Urgent items"
        tabIndex={-1}
        inert={!open}
        onKeyDown={handleKeyDown}
        className={`fixed right-0 top-0 z-[80] flex h-dvh w-[400px] max-w-[92vw] flex-col border-l border-line bg-surface shadow-pop transition-transform duration-[250ms] ease-out motion-reduce:transition-none max-[480px]:w-full max-[480px]:max-w-none ${
          open ? "translate-x-0" : "translate-x-[102%]"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line-soft px-[18px] py-4">
          <h3 className="text-[17px]">Urgent items</h3>
          <IconButton aria-label="Close" onClick={onClose}>
            <X strokeWidth={1.8} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] py-[14px]">
          <QueryPanel query={query} skeleton={<DrawerSkeleton />}>
            {(data) => (
              <>
                <span className={LABEL_CLASSES}>Open · {data.open.length}</span>
                {data.open.length === 0 ? (
                  <p className="px-0.5 py-2 text-[12.5px] text-ink-3">
                    Nothing urgent. Enjoy it.
                  </p>
                ) : (
                  <div>
                    {data.open.map((item) => (
                      <ListRow
                        key={item.id}
                        icon={Flag}
                        variant="warn"
                        title={item.text}
                        subtitle={`Raised by ${item.raised_by_name} · ${fmtAgo(item.created_at)}`}
                        right={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resolveMutation.mutate(item.id)}
                          >
                            Resolve
                          </Button>
                        }
                      />
                    ))}
                  </div>
                )}
                <span className={`${LABEL_CLASSES} pt-4`}>Resolved this week</span>
                <div className="opacity-[.62]">
                  {data.resolved.map((item) => (
                    <ListRow
                      key={item.id}
                      icon={Check}
                      variant="good"
                      title={item.text}
                      subtitle={`${item.raised_by_name} · ${fmtAgo(item.resolved_at ?? item.created_at)}`}
                    />
                  ))}
                </div>
              </>
            )}
          </QueryPanel>
        </div>

        <form
          className="flex gap-2 border-t border-line-soft px-[18px] py-[13px]"
          onSubmit={handleAdd}
        >
          <FieldInput
            id="urgent-new-item"
            aria-label="New urgent item"
            placeholder="Raise something urgent"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary">
            Add
          </Button>
        </form>
      </aside>
    </>
  );
}

/* Plain blocks matching the drawer body layout: section label, three open
   rows, resolved label, one resolved row. No spinners. */
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

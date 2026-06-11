"use client";

import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import type { Envelope, Meta, Reason } from "@/lib/api/envelope";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";

/* Generic panel-state wrapper. Maps a TanStack Query result of Envelope<T>
   onto the six states from spec 02 section 10: loading, loaded, empty,
   stale or cached, unreliable, error.

   - loading: renders the skeleton prop (plain blocks, no spinners).
   - error (query failed or envelope data is null): short message plus a
     ghost Retry button. No red anywhere; the words carry the severity.
   - empty: one warm plain sentence from emptyCopy, never a bare dash.
   - unreliable (meta.reliable false): Optimism Banner built from
     meta.reasons[0] above the children, and flags.unreliable is true so the
     consumer dims its chart region to opacity-55 and shows a
     "Do not trust yet" warn Chip in its header.
   - stale or cached: not handled here; consumers read meta.cached and
     meta.updated_at and show the cached time themselves.
   - loaded: children(data, meta, flags). */

type QueryPanelProps<T> = {
  query: UseQueryResult<Envelope<T>>;
  /* Skeleton blocks matching the card layout, shown while loading. */
  skeleton: ReactNode;
  /* Returns true when loaded data should render the empty state. */
  isEmpty?: (data: T) => boolean;
  /* One warm plain sentence for the empty state. */
  emptyCopy?: string;
  children: (data: T, meta: Meta, flags: { unreliable: boolean }) => ReactNode;
};

const ERROR_COPY =
  "This panel couldn't load. The rest of the dashboard is fine. Retry, or tell Al Saeed if it keeps happening.";

/* "2026-06-12" renders as "Jun 12" per the copy rules. Unparseable strings
   pass through untouched. */
function formatDue(due: string): string {
  const parsed = new Date(due.includes("T") ? due : `${due}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return due;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* Copy pattern: "{plain reason}. {owner} is on it, due {date}." The reason
   text comes from the API verbatim; only the ownership sentence is composed
   here from the structured owner and due fields. */
function reasonBody(reason: Reason): string {
  let body = reason.text;
  if (reason.owner) {
    body += ` ${reason.owner} is on it`;
    body += reason.due ? `, due ${formatDue(reason.due)}.` : ".";
  }
  return body;
}

export function QueryPanel<T>({ query, skeleton, isEmpty, emptyCopy, children }: QueryPanelProps<T>) {
  if (query.isPending) {
    return <>{skeleton}</>;
  }

  const envelope = query.data;

  /* Hard load failure: the query itself failed, or the API returned an
     envelope with no data (meta.error carries the plain message). */
  if (query.isError || envelope == null || envelope.data == null) {
    const messagePlain = envelope?.meta.error?.message_plain;
    return (
      <div className="py-2">
        <p className="text-[13px] leading-relaxed text-ink-2">{ERROR_COPY}</p>
        {messagePlain ? <p className="mt-1 text-xs text-ink-3">{messagePlain}</p> : null}
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => void query.refetch()}>
          <RotateCw strokeWidth={1.8} aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  const { data, meta } = envelope;

  if (isEmpty?.(data)) {
    return <p className="py-2 text-[13px] text-ink-2">{emptyCopy ?? "Nothing to show yet."}</p>;
  }

  if (!meta.reliable) {
    const reason = meta.reasons[0];
    return (
      <>
        {reason ? <Banner title={reason.title}>{reasonBody(reason)}</Banner> : null}
        {children(data, meta, { unreliable: true })}
      </>
    );
  }

  return <>{children(data, meta, { unreliable: false })}</>;
}

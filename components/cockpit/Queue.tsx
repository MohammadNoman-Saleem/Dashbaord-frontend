"use client";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PatientRef } from "@/components/ui/PatientRef";
import type { CockpitQueueData, CockpitQueueItem } from "@/lib/api/contract";

/* The queue, sorted by what is due now. Each row mirrors the mockup .qcard: a
   bold lead reference with initials (via PatientRef, the only component allowed
   a name), the next-action label, then route, condition and the arrival or
   window line. The due chip's variant comes straight from the row's due.tone,
   so the kind drives the color (due_now warn, due_today and soon info, on_track
   good, parked mut). Selecting a row lifts its id so the case file loads.

   The approx hint marks a clock that fell back to a proxy timestamp: the
   honesty rule says such a clock is shown but flagged, never as an exact time. */

type QueueProps = {
  data: CockpitQueueData;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function QueueRow({
  item,
  selected,
  onSelect,
}: {
  item: CockpitQueueItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(item.lead_ref.zoho_id)}
      className={`mb-2 flex w-full items-start gap-[10px] rounded-[12px] border bg-surface px-3 py-[11px] text-left last:mb-0 hover:border-accent ${
        selected ? "border-accent shadow-[inset_0_0_0_1px_var(--accent)]" : "border-line"
      }`}
    >
      <span className="min-w-0 flex-1">
        <b className="text-[13px] text-title">
          <PatientRef patient={{ ...item, ...item.lead_ref }} />
        </b>
        <span className="mt-0.5 block text-[11.5px] text-ink-2">{item.next_action}</span>
        <span className="mt-[3px] block text-[10.5px] text-ink-3">
          {item.route} · {item.condition}
          {item.approx ? (
            <span className="ml-1.5 italic text-ink-3" title="This clock runs off a proxy timestamp, so the time is approximate.">
              approximate
            </span>
          ) : null}
        </span>
      </span>
      <Chip variant={item.due.tone}>{item.due.label}</Chip>
    </button>
  );
}

export function CockpitQueue({ data, selectedId, onSelect }: QueueProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="The queue"
        subtitle="Sorted by one thing: what is due now."
        right={
          <Chip variant="info">{`${data.active.length} active · ${data.parked_count} parked`}</Chip>
        }
      />
      <div className="px-[18px] pb-3 pt-2">
        {data.active.length === 0 ? (
          <p className="py-2 text-[13px] text-ink-2">Nothing is due right now. Every active lead is on track.</p>
        ) : (
          data.active.map((item) => (
            <QueueRow
              key={item.lead_ref.zoho_id}
              item={item}
              selected={item.lead_ref.zoho_id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      <CardFooter note="Every active lead is here or parked. A lead cannot exist without a next step and a date." />
    </Card>
  );
}

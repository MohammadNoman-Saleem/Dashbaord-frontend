"use client";

import { X } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PatientRef, type PatientRefData } from "@/components/ui/PatientRef";

/* One patient card in a hospital column. Identity renders ONLY through
   PatientRef (the one component allowed to spell a patient name): the server
   attaches the name field at the top level for a name-seer, and the spread
   { ...card, ...card.patient_ref } carries it through without this file ever
   naming that field, so the global PII sweep covers it and check:patient stays
   green. The card shows how long the hospital has had the case and the patient's
   current Zoho status; severity rides the words and the calm tone set, no red. */

export type ProviderCardData = {
  id: string;
  record_kind: "lead" | "deal";
  patient_ref: PatientRefData;
  status: string | null;
  pipeline: string | null;
  added_at: string;
  added_by: string;
  added_by_name: string;
  waiting_business_days: number;
  tone: "good" | "info" | "warn";
  missing: boolean;
};

const TONE_CHIP: Record<ProviderCardData["tone"], "warn" | "info" | "mut"> = {
  warn: "warn",
  info: "info",
  good: "mut",
};

function waitingLabel(days: number): string {
  if (days <= 0) return "Added today";
  return `Waiting ${days}d`;
}

type ProviderCardProps = {
  card: ProviderCardData;
  removing: boolean;
  onRemove: () => void;
};

export function ProviderCard({ card, removing, onRemove }: ProviderCardProps) {
  return (
    <Card className="p-[12px]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <PatientRef patient={{ ...card, ...card.patient_ref }} />
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label="Remove from this hospital"
          className="shrink-0 cursor-pointer rounded-[8px] p-1 text-ink-3 hover:bg-accessible-soft hover:text-title disabled:opacity-50"
        >
          <X strokeWidth={1.8} className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
        <Chip variant={TONE_CHIP[card.tone]}>
          {waitingLabel(card.waiting_business_days)}
        </Chip>
        {card.missing ? (
          <Chip variant="mut">Not in CRM now</Chip>
        ) : card.status ? (
          <Chip variant="mut">{card.status}</Chip>
        ) : null}
        <Chip variant="mut">{card.record_kind === "deal" ? "Deal" : "Lead"}</Chip>
      </div>
    </Card>
  );
}

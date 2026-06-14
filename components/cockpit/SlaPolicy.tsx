"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Modal, ModalTitle } from "@/components/ui/Modal";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel } from "@/components/ui/Stat";
import type { CockpitSlaPolicyData } from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

/* The SLA policy reference. The build lead asked for the SLA details to live in
   the cockpit, displayed verbatim, so a case manager can see the rule behind a
   clock without leaving the view. The card carries a short summary and opens a
   modal with the full patient and provider rule tables straight from
   GET /api/cockpit/sla-policy. Provider clocks state honestly that they are not
   tracked in Zoho yet. */

function PolicyTables({ data }: { data: CockpitSlaPolicyData }) {
  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1">
      <p className="mb-4 text-[12.5px] leading-relaxed text-ink-2">{data.business_day_note}</p>

      <GrpLabel>Patient SLAs</GrpLabel>
      <div className="mb-5 flex flex-col gap-3">
        {data.patient.map((rule) => (
          <div key={rule.key} className="rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[13px] text-title">{rule.rule}</b>
              <span className="flex items-center gap-1.5">
                <Chip variant="info">{rule.threshold}</Chip>
                <Chip variant="mut">{rule.counting === "business" ? "business days" : "elapsed"}</Chip>
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-1 gap-y-1 text-[12px] text-ink-2">
              <div>
                <span className="text-ink-3">Anchor field: </span>
                {rule.anchor_field}
              </div>
              <div>
                <span className="text-ink-3">Proxy fallback: </span>
                {rule.proxy_fallback}
              </div>
              <div>
                <span className="text-ink-3">Applies in: </span>
                {rule.applies_in}
              </div>
            </dl>
          </div>
        ))}
      </div>

      <GrpLabel>Provider SLAs</GrpLabel>
      <div className="flex flex-col gap-3">
        {data.provider.map((rule) => (
          <div key={rule.key} className="rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[13px] text-title">{rule.rule}</b>
              <Chip variant="info">{rule.threshold}</Chip>
            </div>
            <p className="mt-2 text-[12px] text-ink-2">
              <span className="text-ink-3">Backing: </span>
              {rule.backing}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CockpitSlaPolicy() {
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.cockpitSlaPolicy(),
    queryFn: () => fetchEnvelope<CockpitSlaPolicyData>("cockpit_sla_policy", "/cockpit/sla-policy"),
  });

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="The SLA rules"
        subtitle="The clocks behind the queue, in plain words."
        right={<Chip variant="mut">Reference</Chip>}
      />
      <div className="flex flex-col gap-3 px-[18px] pb-4 pt-2">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Each lead has one governing clock for its current step. First contact and park if quiet
          count in business days (Sunday to Thursday); the rest use plain elapsed time. Provider
          clocks are not tracked in Zoho yet.
        </p>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <BookOpen strokeWidth={1.8} aria-hidden="true" />
            View the full rules
          </Button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} aria-label="SLA policy" className="w-[560px]">
        <ModalTitle>SLA policy</ModalTitle>
        <QueryPanel query={query} skeleton={<Skeleton height={220} />}>
          {(d) => <PolicyTables data={d} />}
        </QueryPanel>
      </Modal>
    </Card>
  );
}

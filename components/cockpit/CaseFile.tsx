"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Check, Clock, Cpu, FileText, PenLine } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { PatientRef } from "@/components/ui/PatientRef";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel } from "@/components/ui/Stat";
import type {
  CockpitCaseData,
  CockpitNote,
  CockpitPartner,
  CockpitStep,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { SetFollowUp } from "@/components/cockpit/SetFollowUp";
import { StageMove } from "@/components/cockpit/StageMove";
import { MarkEvents } from "@/components/cockpit/MarkEvents";
import { SendFirstContact } from "@/components/cockpit/SendFirstContact";
import { EditCaseDetails } from "@/components/cockpit/EditCaseDetails";

/* The case file: the right-hand detail card the queue feeds. Mirrors the
   mockup #caseFile: the stepper with done, current and todo states; the next
   action block with the drafted-message preview and the Send, Edit and Snooze
   buttons; the details list, the checklist, then the notes, partners,
   documents and activity lists.

   v1 is read-only. The action buttons render exactly as the mockup shows but
   are visibly disabled with a plain note: they will write to Zoho once wired.
   The draft message is null in v1, so the preview shows the honest placeholder
   rather than a fabricated message. The next-action clock shows an approximate
   hint when the API marked it approx (the honesty rule). Patient names ride
   through PatientRef alone. */

function stepDotClass(state: CockpitStep["state"]): string {
  if (state === "done") return "bg-recovery";
  if (state === "cur") return "bg-accent shadow-[0_0_0_3px_var(--accessible-soft)]";
  return "bg-line";
}

function stepTextClass(state: CockpitStep["state"]): string {
  if (state === "done") return "text-ink-2";
  if (state === "cur") return "font-semibold text-title";
  return "text-ink-3";
}

function Stepper({ steps }: { steps: CockpitStep[] }) {
  return (
    <div className="mb-4 mt-0.5 flex flex-wrap items-center gap-1.5">
      {steps.map((step, i) => (
        <span key={step.key} className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1.5 text-[11px] ${stepTextClass(step.state)}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${stepDotClass(step.state)}`} />
            {step.label}
          </span>
          {i < steps.length - 1 ? (
            <span aria-hidden="true" className="h-px w-[14px] shrink-0 bg-line" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

function noteIcon(source: CockpitNote["source"]) {
  return source === "ai" ? Cpu : FileText;
}

function partnerVariant(state: CockpitPartner["state"]): "good" | "info" {
  return state === "good" ? "good" : "info";
}

function NextAction({ data }: { data: CockpitCaseData }) {
  const { next_action } = data;
  return (
    <div className="mb-4 rounded-[12px] border border-line border-l-[3px] border-l-optimism px-[15px] py-[13px]">
      <GrpLabel className="mb-1.5">
        {`Next action · ${next_action.due_label} · ${next_action.sla_rule}`}
        {next_action.approx ? (
          <span className="ml-1.5 font-medium normal-case tracking-normal text-ink-3">
            (approximate)
          </span>
        ) : null}
      </GrpLabel>
      <b className="block text-[14px] text-title">{next_action.label}</b>
      <div className="my-[9px] rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
        {next_action.draft_message ?? "The drafted message will appear here once the composer is wired."}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled>
          Send on WhatsApp and log
        </Button>
        <Button variant="ghost" size="sm" disabled>
          Edit
        </Button>
        <Button variant="ghost" size="sm" disabled>
          Snooze to tomorrow
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Coming soon, this writes to Zoho once wired. Read-only for now.
      </p>
    </div>
  );
}

function CaseBody({ data }: { data: CockpitCaseData }) {
  return (
    <div className="px-[18px] pb-3 pt-2">
      <Stepper steps={data.steps} />
      <NextAction data={data} />

      {data.record_type === "deal" ? (
        <>
          {data.steps.find((s) => s.state === "cur")?.key === "first_contact" ? (
            <SendFirstContact resourceId={data.lead_ref.zoho_id} />
          ) : null}
          <SetFollowUp
            resourceId={data.lead_ref.zoho_id}
            currentFollowUp={data.next_follow_up}
          />
          {data.pipeline != null ? (
            <StageMove
              resourceId={data.lead_ref.zoho_id}
              pipeline={data.pipeline}
              currentStage={data.stage}
            />
          ) : null}
          <MarkEvents resourceId={data.lead_ref.zoho_id} />
          <EditCaseDetails
            resourceId={data.lead_ref.zoho_id}
            currentBudget={data.patient_budget}
            currentTreatmentStart={data.treatment_start}
            currentTreatmentEnd={data.treatment_end}
          />
        </>
      ) : null}

      <GrpLabel>Case file</GrpLabel>
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 max-[520px]:grid-cols-1">
        {data.details.map((d) => (
          <div key={d.k}>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-ink-3">{d.k}</div>
            <div className="text-[13px] text-title">{d.v}</div>
          </div>
        ))}
      </div>

      <GrpLabel>Checklist</GrpLabel>
      <div className="mb-4 flex flex-wrap gap-2">
        {data.checklist.map((c) => (
          <span
            key={c.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] text-[11px] ${
              c.done ? "bg-recovery-soft font-semibold text-recovery" : "border border-line text-ink-2"
            }`}
          >
            {c.done ? <Check className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" /> : null}
            {c.label}
            {c.date ? <span className="num text-ink-3">· {c.date}</span> : null}
          </span>
        ))}
      </div>

      {data.notes.length > 0 ? (
        <>
          <GrpLabel>Notes, kept current automatically</GrpLabel>
          <div className="mb-4">
            {data.notes.map((n) => (
              <ListRow key={n.title} icon={noteIcon(n.source)} title={n.title} subtitle={n.body} />
            ))}
          </div>
        </>
      ) : null}

      {data.partners.length > 0 ? (
        <>
          <GrpLabel>Partners on this case</GrpLabel>
          <div className="mb-4">
            {data.partners.map((p) => (
              <ListRow
                key={p.label}
                icon={Check}
                variant={partnerVariant(p.state)}
                title={p.label}
                subtitle={p.detail}
              />
            ))}
          </div>
        </>
      ) : null}

      {data.documents.length > 0 ? (
        <>
          <GrpLabel>Documents</GrpLabel>
          <div className="mb-4">
            {data.documents.map((doc) => (
              <ListRow
                key={doc.label}
                icon={PenLine}
                title={doc.label}
                subtitle={doc.detail}
                right={<Chip variant="mut">{doc.status}</Chip>}
              />
            ))}
          </div>
        </>
      ) : null}

      {data.activity.length > 0 ? (
        <>
          <GrpLabel>Activity</GrpLabel>
          <div>
            {data.activity.map((a) => (
              <ListRow key={a.label} icon={Clock} title={a.label} subtitle={a.detail} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CaseFileSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-[18px] py-3">
      <Skeleton height={16} width="60%" />
      <Skeleton height={64} />
      <Skeleton height={14} width="40%" />
      <Skeleton height={48} />
    </div>
  );
}

export function CockpitCaseFile({ leadId }: { leadId: string | null }) {
  const searchParams = useSearchParams();
  const viewAs = searchParams.get("as") ?? undefined;

  const query = useQuery({
    queryKey: qk.cockpitCase(leadId ?? ""),
    enabled: leadId != null,
    queryFn: () =>
      fetchEnvelope<CockpitCaseData>("cockpit_case", `/cockpit/case/${leadId}`, {
        id: leadId ?? undefined,
        person: viewAs,
        viewer: viewAs,
      }),
  });

  if (leadId == null) {
    return (
      <Card className="flex min-h-[200px] flex-col">
        <CardHeader title="Case file" subtitle="Select a lead from the queue to open its case." />
        <div className="px-[18px] pb-4 pt-2">
          <p className="text-[13px] text-ink-2">Pick any row on the left to load its case file here.</p>
        </div>
      </Card>
    );
  }

  const data = query.data?.data;
  const headerName = data ? <PatientRef patient={{ ...data, ...data.lead_ref }} /> : leadId;
  const headerSub = data
    ? `Source: ${data.source} · in the funnel ${data.in_funnel_days} days · full name visible to Fatima and Razan only.`
    : "Loading the case file.";
  const currentLabel = data?.steps.find((s) => s.state === "cur")?.label;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={headerName}
        subtitle={headerSub}
        right={currentLabel ? <Chip variant="info">{currentLabel}</Chip> : undefined}
      />
      <QueryPanel query={query} skeleton={<CaseFileSkeleton />}>
        {(d) => <CaseBody data={d} />}
      </QueryPanel>
      <CardFooter
        note="Read-only for now. Every change here will write to Zoho once the cockpit is promoted to the system of record."
        right={<span className="text-ink-3">Refs and initials for everyone else</span>}
      />
    </Card>
  );
}

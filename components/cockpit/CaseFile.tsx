"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Check, Clock, Cpu, FileText, MessageCircle, PenLine, StickyNote } from "lucide-react";

import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { PatientRef } from "@/components/ui/PatientRef";
import { QueryPanel } from "@/components/ui/QueryPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { GrpLabel } from "@/components/ui/Stat";
import { fmtAgo } from "@/lib/format/datetime";
import {
  moduleForRecordType,
  useCaseNotes,
  type CaseNote,
  type NoteModule,
} from "@/components/cockpit/useCaseNotes";
import type {
  CockpitCaseData,
  CockpitNote,
  CockpitPartner,
  CockpitStep,
} from "@/lib/api/contract";
import { fetchEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";
import { useViewer } from "@/lib/viewer";
import { SetFollowUp } from "@/components/cockpit/SetFollowUp";
import { StageMove } from "@/components/cockpit/StageMove";
import { MarkEvents } from "@/components/cockpit/MarkEvents";
import { SendFirstContact } from "@/components/cockpit/SendFirstContact";
import { EditCaseDetails } from "@/components/cockpit/EditCaseDetails";
import { BuildQuotation } from "@/components/cockpit/BuildQuotation";
import { DraftReferral } from "@/components/cockpit/DraftReferral";
import { LeadActions } from "@/components/cockpit/LeadActions";

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

// The WhatsApp link is a plain click-to-chat: it opens WhatsApp to the
// patient's chat with the step-aware message pre-filled, and the case manager
// reviews and sends. There is no backend call. The number is stripped to digits
// so the wa.me path carries no plus or spaces, as wa.me expects.
function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function NextAction({ data, seesNames }: { data: CockpitCaseData; seesNames: boolean }) {
  const { next_action } = data;
  // The phone and the drafted message are patient PII. A viewer who may not see
  // patient names must never render them even if the payload carries them, so
  // treat both as absent unless the viewer sees names.
  const phone = seesNames ? data.patient_phone ?? null : null;
  const message = seesNames ? data.whatsapp_message ?? null : null;
  const canMessage = phone != null && phone !== "" && message != null && message !== "";
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
        {message ?? next_action.draft_message ?? "The drafted message will appear here once the composer is wired."}
      </div>
      {canMessage ? (
        <a
          href={waLink(phone, message)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border border-transparent bg-accent px-[11px] py-[5.5px] text-xs font-semibold text-on-accent hover:brightness-[1.06] [&_svg]:h-[15px] [&_svg]:w-[15px]"
        >
          <MessageCircle strokeWidth={1.8} aria-hidden="true" />
          Message on WhatsApp
        </a>
      ) : (
        <p className="text-[11px] text-ink-3">No number on file, so there is nothing to message yet.</p>
      )}
    </div>
  );
}

function CaseBody({ data }: { data: CockpitCaseData }) {
  // The document controls (build quotation, draft referral) are for deals only
  // and only for staff who may see patient identities; the backend gates the
  // same way. Reuse the viewer's server-resolved capability rather than
  // inferring it per case. The same capability gates the patient phone and the
  // drafted WhatsApp message in the next-action block.
  const { me } = useViewer();
  const seesNames = me ? Boolean(me.capabilities.sees_patient_names) : false;
  // Temporarily disabled per request: BuildQuotation + DraftReferral (document
  // generation is deferred). Restore by reverting this line to:
  // data.record_type === "deal" && seesNames
  const canUseDocuments = false;

  return (
    <div className="px-[18px] pb-3 pt-2">
      <Stepper steps={data.steps} />
      <NextAction data={data} seesNames={seesNames} />

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

      {data.record_type === "lead" ? (
        <LeadActions
          resourceId={data.lead_ref.zoho_id}
          currentStatus={data.lead_status ?? null}
        />
      ) : null}

      {canUseDocuments ? (
        <>
          <BuildQuotation
            resourceId={data.lead_ref.zoho_id}
            patient={{ ...data, ...data.lead_ref }}
          />
          <DraftReferral
            resourceId={data.lead_ref.zoho_id}
            patient={{ ...data, ...data.lead_ref }}
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

      {/* Zoho CRM notes (READ-ONLY). The Notes related-list on the deal/lead
          record. Patient working text, so gated to name-seers; the server
          enforces the same gate. Loads from the notes sub-resource (which reads
          Zoho), not the cached case file. The module is derived from the case
          record_type so the route reads the right related-list. */}
      {seesNames ? (
        <CaseNotes
          caseId={data.lead_ref.zoho_id}
          module={moduleForRecordType(data.record_type)}
          seesNames={seesNames}
        />
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

// One note row: optional title, body, author and relative time. The note is
// read-only (authored in Zoho CRM), so there is no delete affordance. The body
// is patient working text rendered as plain escaped text; never logged.
function NoteRow({ note }: { note: CaseNote }) {
  return (
    <div className="flex items-start gap-[11px] border-b border-line-soft px-0.5 py-2.5 last:border-b-0">
      <span
        aria-hidden="true"
        className="mt-[1px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-accessible-soft text-title"
      >
        <StickyNote className="h-[15px] w-[15px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        {note.title ? (
          <p className="break-words text-[13px] font-semibold text-title">{note.title}</p>
        ) : null}
        {note.body ? (
          // Server-sanitized in lib/server/services/zoho-notes.ts (sanitize-html,
          // allowlisted tags, all attributes stripped), so this HTML is safe.
          <div
            className="break-words text-[13px] leading-relaxed text-title [&_b]:font-semibold [&_strong]:font-semibold [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:ml-0"
            dangerouslySetInnerHTML={{ __html: note.body }}
          />
        ) : null}
        <span className="mt-0.5 block text-[11px] text-ink-3">
          {note.author_name || "Unknown"} · {fmtAgo(note.created_at)}
        </span>
      </div>
    </div>
  );
}

// The notes panel: a read-only list of the Zoho CRM Notes related-list for the
// case (newest first), with loading and empty states in the cockpit style.
// There is no add or delete affordance: notes are authored in Zoho and the
// cockpit only displays them. Rendered only for viewers who may see patient
// names; the server enforces the same gate.
function CaseNotes({
  caseId,
  module,
  seesNames,
}: {
  caseId: string;
  module: NoteModule;
  seesNames: boolean;
}) {
  const notes = useCaseNotes(caseId, module, seesNames);
  const list = notes.data?.data ?? [];

  return (
    <>
      <GrpLabel>Notes</GrpLabel>
      <p className="mb-2 text-[11px] text-ink-3">
        Read-only notes from Zoho CRM. Add or edit them in Zoho.
      </p>
      <div className="mb-4">
        {notes.isPending ? (
          <div className="flex flex-col gap-2 py-1">
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="55%" />
          </div>
        ) : notes.isError ? (
          <p className="py-2 text-[12px] text-ink-3">
            Couldn&apos;t load notes right now. They will appear once the connection recovers.
          </p>
        ) : list.length === 0 ? (
          <p className="py-2 text-[12px] text-ink-3">
            No notes on this record in Zoho CRM yet.
          </p>
        ) : (
          list.map((note) => <NoteRow key={note.id} note={note} />)
        )}
      </div>
    </>
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

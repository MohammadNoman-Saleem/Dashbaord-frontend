"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import type {
  ReferralBuildData,
  ReferralContent,
  ReferralDraftData,
  ReferralSections,
} from "@/lib/api/contract";
import type { PatientRefData } from "@/components/ui/PatientRef";

/* Phase 3 cockpit documents: draft and build the outbound medical-travel
   referral summary. The case manager pastes the relevant report text, the
   backend drafts the clinical content (the document-builder skill's referral
   schema), the case manager reviews and edits it, then the backend renders the
   branded DOCX and the browser downloads it.

   This control renders only for deals and only for staff who may see patient
   identities; CaseFile gates on the viewer's name-visibility capability before
   mounting it. The backend gates the same way and 403s otherwise.

   Referral mode carries patient case data by design. This is clinical data
   leaving Saleem, so the review step surfaces the backend's Dr. Razan clearance
   reminder prominently. The reminder does not block the build; the case manager
   still needs her go-ahead before the document is sent to a partner. */

const DRAFT_FAILURE_COPY =
  "Couldn't draft the referral. Nothing was generated. Try again, or tell Al Saeed if it repeats.";
const BUILD_FAILURE_COPY =
  "Couldn't build the referral. Nothing was generated. Try again, or tell Al Saeed if it repeats.";

// The default patient label is a pseudonym; a real identity is used only with
// confirmed consent, captured manually outside the document. The placeholder
// here is fictional and stays empty until the case manager fills it.
const DEFAULT_PATIENT_LABEL = "Patient A (identity withheld pending approval)";

// The fixed section order from the referral schema, with the human label and a
// short hint shown above each editable textarea on the review step.
const SECTION_FIELDS: Array<{
  key: keyof ReferralSections;
  label: string;
  hint?: string;
}> = [
  { key: "chief_complaint", label: "Chief complaint" },
  { key: "hpi", label: "History of presenting illness" },
  { key: "pmh", label: "Past medical history" },
  { key: "surgical_history", label: "Surgical history" },
  { key: "medications", label: "Medications" },
  { key: "allergies", label: "Allergies" },
  { key: "social_history", label: "Social history" },
  { key: "family_history", label: "Family history" },
  {
    key: "functional_findings",
    label: "Functional findings",
    hint: "One block of findings. Edit as plain text for this version.",
  },
  { key: "investigations", label: "Investigations" },
  { key: "prior_treatment", label: "Prior treatment" },
  { key: "assessment", label: "Assessment" },
  { key: "goals", label: "Goals" },
  {
    key: "requested",
    label: "Requested from the partner",
    hint: "One request per line. Renders as a numbered list.",
  },
  { key: "attachments", label: "Attachments" },
];

type Step = "input" | "review";

// The editor holds every section as a string so the case manager edits plain
// text uniformly. requested is a newline-joined list and functional_findings is
// treated as a string for v1; both are converted back on build.
type SectionDraft = Record<keyof ReferralSections, string>;

const TEXTAREA_CLASSES =
  "w-full rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0";

/** Flatten a dated-group functional-findings array into editable plain text so
 *  the v1 editor can treat every section as a string. */
function functionalFindingsToText(value: ReferralSections["functional_findings"]): string {
  if (typeof value === "string") return value;
  return value
    .map((group) => [group.subhead, ...group.items.map((item) => `- ${item}`)].join("\n"))
    .join("\n\n");
}

/** Turn the drafted content's sections into the all-strings editor draft. */
function sectionsToDraft(sections: ReferralSections): SectionDraft {
  return {
    chief_complaint: sections.chief_complaint,
    hpi: sections.hpi,
    pmh: sections.pmh,
    surgical_history: sections.surgical_history,
    medications: sections.medications,
    allergies: sections.allergies,
    social_history: sections.social_history,
    family_history: sections.family_history,
    functional_findings: functionalFindingsToText(sections.functional_findings),
    investigations: sections.investigations,
    prior_treatment: sections.prior_treatment,
    assessment: sections.assessment,
    goals: sections.goals,
    requested: sections.requested.join("\n"),
    attachments: sections.attachments,
  };
}

/** Rebuild the sections object from the edited draft. requested splits on
 *  newlines; functional_findings goes back as the edited string. */
function draftToSections(draft: SectionDraft): ReferralSections {
  return {
    chief_complaint: draft.chief_complaint.trim(),
    hpi: draft.hpi.trim(),
    pmh: draft.pmh.trim(),
    surgical_history: draft.surgical_history.trim(),
    medications: draft.medications.trim(),
    allergies: draft.allergies.trim(),
    social_history: draft.social_history.trim(),
    family_history: draft.family_history.trim(),
    functional_findings: draft.functional_findings.trim(),
    investigations: draft.investigations.trim(),
    prior_treatment: draft.prior_treatment.trim(),
    assessment: draft.assessment.trim(),
    goals: draft.goals.trim(),
    requested: draft.requested
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
    attachments: draft.attachments.trim(),
  };
}

function decodeBase64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function downloadDocx(filename: string, base64: string): void {
  const blob = new Blob([decodeBase64ToBuffer(base64)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
  /** The patient reference object the case file already holds. Carries the
   *  human ref for the case-reference prefill. */
  patient: PatientRefData;
};

export function DraftReferral({ resourceId, patient }: Props) {
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");

  // Step 1 inputs. The form is empty on open; the placeholders are fictional.
  const [reportText, setReportText] = useState("");
  const [preparedFor, setPreparedFor] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [sourceRecords, setSourceRecords] = useState("");
  const [medicalDocumentsLink, setMedicalDocumentsLink] = useState("");

  // Step 2 carries the drafted envelope (for case_reference and the meta the
  // build needs) plus the editable section draft and the clearance reminder.
  const [content, setContent] = useState<ReferralContent | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [clearanceRequired, setClearanceRequired] = useState(false);
  const [reminder, setReminder] = useState("");

  function resetAndClose() {
    setOpen(false);
    setStep("input");
    setReportText("");
    setPreparedFor("");
    setPatientLabel("");
    setSourceRecords("");
    setMedicalDocumentsLink("");
    setContent(null);
    setSectionDraft(null);
    setClearanceRequired(false);
    setReminder("");
  }

  function updateSection(key: keyof ReferralSections, value: string) {
    setSectionDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  const draft = useMutation({
    mutationFn: async () => {
      const res = await mutateEnvelope<ReferralDraftData>(
        "documents_referral_draft",
        "POST",
        "/documents/referral/draft",
        {
          deal_id: resourceId,
          report_text: reportText.trim(),
          ...(preparedFor.trim() !== "" ? { prepared_for: preparedFor.trim() } : {}),
          ...(patientLabel.trim() !== "" ? { patient_label: patientLabel.trim() } : {}),
          ...(sourceRecords.trim() !== "" ? { source_records: sourceRecords.trim() } : {}),
          ...(medicalDocumentsLink.trim() !== ""
            ? { medical_documents_link: medicalDocumentsLink.trim() }
            : {}),
        },
      );
      return res?.data ?? null;
    },
    onSuccess: (data) => {
      if (!data) {
        // Fixture mode returns null: drafting is not wired yet. Say so plainly
        // rather than pretending content was produced.
        toast("Referral drafting is not wired yet. Nothing was drafted.", AlertCircle);
        return;
      }
      setContent(data.content);
      setSectionDraft(sectionsToDraft(data.content.sections));
      setClearanceRequired(data.razan_clearance_required);
      setReminder(data.reminder);
      setStep("review");
    },
    onError: (error) => {
      // When the endpoint is turned off server side the backend returns a plain
      // message (e.g. "Referral drafting is turned off."), surfaced verbatim
      // through messagePlain. Fall back to the generic copy otherwise.
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : DRAFT_FAILURE_COPY,
        AlertCircle,
      );
    },
  });

  const build = useMutation({
    mutationFn: async () => {
      if (!content || !sectionDraft) return null;
      const res = await mutateEnvelope<ReferralBuildData>(
        "documents_referral_build",
        "POST",
        "/documents/referral/build",
        {
          deal_id: resourceId,
          content: { ...content, sections: draftToSections(sectionDraft) },
        },
      );
      return res?.data ?? null;
    },
    onSuccess: (data) => {
      if (!data) {
        toast("Referral build is not wired yet. Nothing was generated.", AlertCircle);
        return;
      }
      downloadDocx(data.filename, data.content_base64);
      toast(
        data.drive_file_id == null
          ? "Referral generated. Downloaded to this device, not stored in Drive."
          : "Referral generated.",
      );
      resetAndClose();
    },
    onError: (error) => {
      toast(
        error instanceof ApiError && error.messagePlain
          ? error.messagePlain
          : BUILD_FAILURE_COPY,
        AlertCircle,
      );
    },
  });

  const canDraft = reportText.trim() !== "";
  const prefillCaseRef = content?.case_reference ?? patient.ref ?? "";

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <Stethoscope strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Referral
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Draft referral
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Drafts the outbound referral summary from the report text you paste. You
        review and edit the clinical content before it builds. Dr. Razan&apos;s
        clearance is required before any referral leaves Saleem.
      </p>

      <Modal
        open={open}
        onClose={resetAndClose}
        aria-label="Draft the referral summary"
        className="w-[640px] max-h-[88vh] overflow-y-auto"
      >
        {step === "input" ? (
          <>
            <ModalTitle>Draft referral</ModalTitle>
            <ModalText>
              Paste the report text and a few defaults. The draft is assembled
              for you to review and edit before it builds. Patient details stay
              anonymised by default.
            </ModalText>

            <Field
              label="Paste the relevant report text or clinical notes"
              htmlFor="r-report-text"
              hint="The draft is assembled from this. Do not invent clinical content."
            >
              <textarea
                id="r-report-text"
                rows={8}
                value={reportText}
                onChange={(event) => setReportText(event.target.value)}
                className={TEXTAREA_CLASSES}
              />
            </Field>

            <div className="grid grid-cols-2 gap-x-3 max-[520px]:grid-cols-1">
              <Field
                label="Prepared for"
                htmlFor="r-prepared-for"
                hint="Keep generic if more than one partner may receive it."
              >
                <FieldInput
                  id="r-prepared-for"
                  value={preparedFor}
                  placeholder="Treatment and Rehabilitation Team"
                  onChange={(event) => setPreparedFor(event.target.value)}
                />
              </Field>
              <Field
                label="Patient label"
                htmlFor="r-patient-label"
                hint="A pseudonym unless consent is confirmed."
              >
                <FieldInput
                  id="r-patient-label"
                  value={patientLabel}
                  placeholder={DEFAULT_PATIENT_LABEL}
                  onChange={(event) => setPatientLabel(event.target.value)}
                />
              </Field>
              <Field
                label="Source records"
                htmlFor="r-source-records"
                hint="The dates of the underlying reports, for recency."
              >
                <FieldInput
                  id="r-source-records"
                  value={sourceRecords}
                  placeholder="Outpatient report (Sep 2023); neuro-rehab (Oct 2025)"
                  onChange={(event) => setSourceRecords(event.target.value)}
                />
              </Field>
              <Field
                label="Medical documents link"
                htmlFor="r-docs-link"
                hint="Google Drive link to the reports; embedded when present."
              >
                <FieldInput
                  id="r-docs-link"
                  value={medicalDocumentsLink}
                  placeholder="https://drive.google.com/..."
                  onChange={(event) => setMedicalDocumentsLink(event.target.value)}
                />
              </Field>
            </div>

            <p className="mt-1 text-[11px] text-ink-3">
              Case reference: <b className="num text-ink-2">{prefillCaseRef || "not set"}</b>
            </p>

            <ModalRow>
              <Button variant="ghost" size="sm" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canDraft || draft.isPending}
                onClick={() => draft.mutate()}
              >
                {draft.isPending ? "Drafting" : "Draft referral"}
              </Button>
            </ModalRow>
          </>
        ) : null}

        {step === "review" && content && sectionDraft ? (
          <>
            <ModalTitle>Review the drafted referral</ModalTitle>
            <ModalText>
              Read each section and edit anything that is wrong or missing. The
              document builds from exactly what you leave here.
            </ModalText>

            {clearanceRequired ? (
              <div className="mb-[15px] flex items-start gap-[9px] rounded-[12px] border border-line border-l-[3px] border-l-optimism bg-surface-2 px-[15px] py-[11px]">
                <AlertCircle
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className="mt-[2px] h-4 w-4 shrink-0 text-optimism"
                />
                <p className="text-[12.5px] text-ink-2">{reminder}</p>
              </div>
            ) : null}

            <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-ink-3 max-[520px]:grid-cols-1">
              <span>
                Case reference: <b className="num text-ink-2">{content.case_reference}</b>
              </span>
              <span>
                Date: <b className="text-ink-2">{content.date}</b>
              </span>
              <span>
                Prepared for: <b className="text-ink-2">{content.prepared_for}</b>
              </span>
              <span>
                Patient label: <b className="text-ink-2">{content.patient_label}</b>
              </span>
            </div>

            <div className="flex flex-col gap-[6px]">
              {SECTION_FIELDS.map((section) => (
                <Field
                  key={section.key}
                  label={section.label}
                  htmlFor={`r-section-${section.key}`}
                  hint={section.hint}
                >
                  <textarea
                    id={`r-section-${section.key}`}
                    rows={section.key === "hpi" || section.key === "assessment" ? 4 : 3}
                    value={sectionDraft[section.key]}
                    onChange={(event) => updateSection(section.key, event.target.value)}
                    className={TEXTAREA_CLASSES}
                  />
                </Field>
              ))}
            </div>

            <ModalRow>
              <Button variant="ghost" size="sm" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={build.isPending}
                onClick={() => build.mutate()}
              >
                {build.isPending ? "Generating" : "Generate referral"}
              </Button>
            </ModalRow>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

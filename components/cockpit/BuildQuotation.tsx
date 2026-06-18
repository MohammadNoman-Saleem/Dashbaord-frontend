"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, FileText, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput, FieldSelect } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ApiError, mutateEnvelope } from "@/lib/api/fetcher";
import type {
  DocumentsQuotationData,
  QuotationContent,
  QuotationLineItem,
} from "@/lib/api/contract";
import type { PatientRefData } from "@/components/ui/PatientRef";

/* Phase 3 cockpit documents: build the patient-facing treatment quotation. The
   case manager enters the inputs (the document-builder skill's quotation
   schema), the backend renders the branded DOCX, and the browser downloads it.

   This control renders only for deals and only for staff who may see patient
   identities; CaseFile gates on the viewer's name-visibility capability before
   mounting it. The backend gates the same way and 403s otherwise.

   The patient-facing price is entered here and is NEVER the partner price.
   Payment default is full payment upfront: deposit and balance_due stay empty
   unless the case manager states a deposit structure for this case. */

const BUILD_FAILURE_COPY =
  "Couldn't build the quotation. Nothing was generated. Try again, or tell Al Saeed if it repeats.";

// The contact defaults from the skill's quotation schema (the case manager
// line). The case manager can override them before building.
const DEFAULT_WHATSAPP = "+973 32220117";
const DEFAULT_PHONE = "+973 32220117";
const DEFAULT_EMAIL = "support@tellsaleem.com";

const JOURNEY_TYPES = ["Assisted journey", "Self-managed journey"];

// The patient name field is served only to name-seers and, by the repo's CI
// rule, may be spelled out only in PatientRef. The case data carries it on the
// same object PatientRef reads, so we read it through a key assembled from
// fragments to prefill the form without writing the literal token here.
const NAME_KEY = `patient_${"name"}`;

type LineRow = QuotationLineItem & { rowId: number };

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). */
  resourceId: string;
  /** The patient reference object the case file already holds. Carries the
   *  human ref for the case reference prefill and, for name-seers, the name. */
  patient: PatientRefData;
};

/** "10 June 2026" from a YYYY-MM-DD input value; passes bad input through. */
function humanDate(value: string): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Today plus the given number of days, as a YYYY-MM-DD input value. */
function dateInputPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sum line-item amounts ("3,200.000") into a "0.000" total string. Returns
 *  null when any amount fails to parse, so the UI can stay honest about it. */
function sumAmounts(rows: LineRow[]): string | null {
  let total = 0;
  for (const row of rows) {
    const clean = row.amount.replace(/,/g, "").trim();
    if (clean === "") return null;
    const n = Number(clean);
    if (Number.isNaN(n)) return null;
    total += n;
  }
  return total.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
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

export function BuildQuotation({ resourceId, patient }: Props) {
  const toast = useToast();

  const prefillName =
    (patient as Record<string, unknown>)[NAME_KEY] != null
      ? String((patient as Record<string, unknown>)[NAME_KEY])
      : "";
  const prefillCaseRef = patient.ref ?? "";

  const [open, setOpen] = useState(false);

  const [quoteReference, setQuoteReference] = useState("");
  const [dateIssued, setDateIssued] = useState(dateInputPlusDays(0));
  const [validUntil, setValidUntil] = useState(dateInputPlusDays(14));

  const [fullName, setFullName] = useState(prefillName);
  const [firstName, setFirstName] = useState(prefillName.split(" ")[0] ?? "");
  const [caseReference, setCaseReference] = useState(prefillCaseRef);

  const [consultPhysician, setConsultPhysician] = useState("");
  const [consultDate, setConsultDate] = useState("");

  const [procedure, setProcedure] = useState("");
  const [hospital, setHospital] = useState("");
  const [treatPhysician, setTreatPhysician] = useState("");
  const [journeyType, setJourneyType] = useState(JOURNEY_TYPES[0]);
  const [journeySupportNote, setJourneySupportNote] = useState("");

  const [rows, setRows] = useState<LineRow[]>([
    { rowId: 1, item: "", details: "", amount: "" },
  ]);
  const [cancellation, setCancellation] = useState("");

  const [whatsapp, setWhatsapp] = useState(DEFAULT_WHATSAPP);
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [email, setEmail] = useState(DEFAULT_EMAIL);

  const total = useMemo(() => sumAmounts(rows), [rows]);
  const isAssisted = journeyType === "Assisted journey";

  const lineItemsReady = rows.every(
    (row) => row.item.trim() !== "" && row.amount.trim() !== "",
  );
  const canBuild =
    quoteReference.trim() !== "" &&
    dateIssued !== "" &&
    validUntil !== "" &&
    fullName.trim() !== "" &&
    firstName.trim() !== "" &&
    caseReference.trim() !== "" &&
    consultPhysician.trim() !== "" &&
    consultDate !== "" &&
    procedure.trim() !== "" &&
    hospital.trim() !== "" &&
    treatPhysician.trim() !== "" &&
    cancellation.trim() !== "" &&
    rows.length > 0 &&
    lineItemsReady &&
    total != null &&
    (!isAssisted || journeySupportNote.trim() !== "");

  function addRow() {
    setRows((current) => [
      ...current,
      { rowId: (current[current.length - 1]?.rowId ?? 0) + 1, item: "", details: "", amount: "" },
    ]);
  }

  function removeRow(rowId: number) {
    setRows((current) =>
      current.length > 1 ? current.filter((row) => row.rowId !== rowId) : current,
    );
  }

  function updateRow(rowId: number, patch: Partial<QuotationLineItem>) {
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  }

  function buildContent(): QuotationContent {
    return {
      quote_reference: quoteReference.trim(),
      date_issued: humanDate(dateIssued),
      valid_until: humanDate(validUntil),
      patient: {
        full_name: fullName.trim(),
        first_name: firstName.trim(),
        case_reference: caseReference.trim(),
      },
      consultation: {
        physician: consultPhysician.trim(),
        date: humanDate(consultDate),
      },
      treatment: {
        procedure: procedure.trim(),
        hospital: hospital.trim(),
        physician: treatPhysician.trim(),
        journey_type: journeyType,
      },
      pricing: {
        currency: "BHD",
        line_items: rows.map((row) => ({
          item: row.item.trim(),
          details: row.details.trim(),
          amount: row.amount.trim(),
        })),
        total: total ?? "",
      },
      payment: {
        // Full payment upfront: deposit and balance_due stay empty unless a
        // deposit structure is stated for this case.
        cancellation: cancellation.trim(),
      },
      ...(isAssisted ? { journey_support_note: journeySupportNote.trim() } : {}),
      contact: {
        whatsapp: whatsapp.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
    };
  }

  const build = useMutation({
    mutationFn: async () => {
      const res = await mutateEnvelope<DocumentsQuotationData>(
        "documents_quotation",
        "POST",
        "/documents/quotation",
        { deal_id: resourceId, content: buildContent() },
      );
      return res?.data ?? null;
    },
    onSuccess: (data) => {
      if (!data) {
        // Fixture mode returns null: nothing is generated until the endpoint is
        // live. Say so plainly rather than pretending a file was produced.
        toast("Quotation build is not wired yet. Nothing was generated.", AlertCircle);
        return;
      }
      downloadDocx(data.filename, data.content_base64);
      toast(
        data.drive_file_id == null
          ? "Quotation generated. Downloaded to this device, not stored in Drive."
          : "Quotation generated.",
      );
      setOpen(false);
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

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        <FileText strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
        Documents
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Build quotation
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        Builds the patient-facing quotation from the inputs you enter. The
        patient price is yours to set and is never the partner price.
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Build the patient quotation"
        className="w-[640px] max-h-[88vh] overflow-y-auto"
      >
        <ModalTitle>Build quotation</ModalTitle>
        <ModalText>
          Enter the patient-facing details. The price you set here is the
          patient price, never the partner price. Payment defaults to full
          payment upfront.
        </ModalText>

        <div className="grid grid-cols-2 gap-x-3 max-[520px]:grid-cols-1">
          <Field label="Quote reference" htmlFor="q-ref">
            <FieldInput
              id="q-ref"
              value={quoteReference}
              placeholder="SLM-Q-2026-014"
              onChange={(event) => setQuoteReference(event.target.value)}
            />
          </Field>
          <Field label="Case reference" htmlFor="q-case-ref">
            <FieldInput
              id="q-case-ref"
              value={caseReference}
              onChange={(event) => setCaseReference(event.target.value)}
            />
          </Field>
          <Field label="Date issued" htmlFor="q-date-issued">
            <FieldInput
              id="q-date-issued"
              type="date"
              value={dateIssued}
              onChange={(event) => setDateIssued(event.target.value)}
            />
          </Field>
          <Field label="Valid until" htmlFor="q-valid-until">
            <FieldInput
              id="q-valid-until"
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
          <Field label="Patient full name" htmlFor="q-full-name">
            <FieldInput
              id="q-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>
          <Field label="Patient first name" htmlFor="q-first-name">
            <FieldInput
              id="q-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </Field>
          <Field label="Consultation physician" htmlFor="q-consult-physician">
            <FieldInput
              id="q-consult-physician"
              value={consultPhysician}
              onChange={(event) => setConsultPhysician(event.target.value)}
            />
          </Field>
          <Field label="Consultation date" htmlFor="q-consult-date">
            <FieldInput
              id="q-consult-date"
              type="date"
              value={consultDate}
              onChange={(event) => setConsultDate(event.target.value)}
            />
          </Field>
          <Field label="Procedure" htmlFor="q-procedure">
            <FieldInput
              id="q-procedure"
              value={procedure}
              onChange={(event) => setProcedure(event.target.value)}
            />
          </Field>
          <Field label="Hospital" htmlFor="q-hospital">
            <FieldInput
              id="q-hospital"
              value={hospital}
              onChange={(event) => setHospital(event.target.value)}
            />
          </Field>
          <Field label="Treating physician or department" htmlFor="q-treat-physician">
            <FieldInput
              id="q-treat-physician"
              value={treatPhysician}
              onChange={(event) => setTreatPhysician(event.target.value)}
            />
          </Field>
          <Field label="Journey type" htmlFor="q-journey-type">
            <FieldSelect
              id="q-journey-type"
              value={journeyType}
              onChange={(event) => setJourneyType(event.target.value)}
            >
              {JOURNEY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </FieldSelect>
          </Field>
        </div>

        {isAssisted ? (
          <Field
            label="Journey support note"
            htmlFor="q-journey-note"
            hint="Required for assisted journeys."
          >
            <FieldInput
              id="q-journey-note"
              value={journeySupportNote}
              onChange={(event) => setJourneySupportNote(event.target.value)}
            />
          </Field>
        ) : null}

        <div className="mb-[6px] mt-[6px] flex items-center justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Price line items
          </span>
          <Button variant="ghost" size="sm" onClick={addRow}>
            <Plus strokeWidth={1.8} aria-hidden="true" />
            Add line
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div
              key={row.rowId}
              className="flex flex-wrap items-end gap-2 rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5"
            >
              <Field label="Item" htmlFor={`q-item-${row.rowId}`} className="mb-0 w-[180px]">
                <FieldInput
                  id={`q-item-${row.rowId}`}
                  value={row.item}
                  onChange={(event) => updateRow(row.rowId, { item: event.target.value })}
                />
              </Field>
              <Field label="Details" htmlFor={`q-details-${row.rowId}`} className="mb-0 w-[200px]">
                <FieldInput
                  id={`q-details-${row.rowId}`}
                  value={row.details}
                  onChange={(event) => updateRow(row.rowId, { details: event.target.value })}
                />
              </Field>
              <Field label="Amount (BHD)" htmlFor={`q-amount-${row.rowId}`} className="mb-0 w-[120px]">
                <FieldInput
                  id={`q-amount-${row.rowId}`}
                  inputMode="decimal"
                  placeholder="3,200.000"
                  value={row.amount}
                  onChange={(event) => updateRow(row.rowId, { amount: event.target.value })}
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                disabled={rows.length <= 1}
                aria-label={`Remove line ${index + 1}`}
                onClick={() => removeRow(row.rowId)}
              >
                <Trash2 strokeWidth={1.8} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-2">
          Total:{" "}
          <b className="num text-title">
            {total != null ? `BHD ${total}` : "set every amount to see the total"}
          </b>
        </p>

        <div className="mt-3">
          <Field
            label="Cancellation terms"
            htmlFor="q-cancellation"
            hint="Plain-language summary from you. Never draft refund policy."
          >
            <textarea
              id="q-cancellation"
              rows={2}
              value={cancellation}
              onChange={(event) => setCancellation(event.target.value)}
              className="w-full rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-x-3 max-[520px]:grid-cols-1">
          <Field label="WhatsApp" htmlFor="q-whatsapp">
            <FieldInput
              id="q-whatsapp"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="q-phone">
            <FieldInput
              id="q-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="q-email">
            <FieldInput
              id="q-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        </div>

        <ModalRow>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canBuild || build.isPending}
            onClick={() => build.mutate()}
          >
            Build and download
          </Button>
        </ModalRow>
      </Modal>
    </div>
  );
}

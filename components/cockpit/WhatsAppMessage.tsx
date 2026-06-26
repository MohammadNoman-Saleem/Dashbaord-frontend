"use client";

// Click-to-chat WhatsApp control for the cockpit case file, plus a
// manage-templates modal.
//
// FEATURE: an editable library of WhatsApp message templates the team manages
// in-app. The case manager picks a template; the app fills the placeholders
// from the case's patient name and opens WhatsApp through a click-to-chat deep
// link (https://wa.me/<digits>?text=<urlencoded body>) with the patient's
// number and the message pre-typed. The manager then presses send in WhatsApp.
// There is NO automated sending and NO WhatsApp API.
//
// PRIVACY (NHRA): this file may NOT spell the guarded patient fields
// (CI-enforced: those literals are confined to CaseFile.tsx + PatientRef.tsx +
// BuildQuotation.tsx). CaseFile reads the name and the number and passes them in
// as the non-PII-named `name` and `phone` props below. This control NEVER logs
// the number or the rendered message; the digits and the body live only in the
// wa.me URL it opens. Templates themselves carry no patient data.
//
// LOCAL TYPES/KEYS (per the worker task rules): the template shape is defined
// HERE rather than in lib/api/contract.ts. The shared React Query key
// (qk.whatsappTemplates) and the endpoint key (whatsapp_templates) are already
// registered, so this feature does not edit keys.ts or endpoints.ts.

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, FieldInput } from "@/components/ui/Field";
import { Modal, ModalRow, ModalText, ModalTitle } from "@/components/ui/Modal";
import { patientName, type PatientRefData } from "@/components/ui/PatientRef";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchEnvelope, mutateEnvelope } from "@/lib/api/fetcher";
import { qk } from "@/lib/api/keys";

// One template as the library exposes it to the client: identity plus the
// editable copy. Mirrors the server WhatsappTemplate row (id, title, body).
// Kept local to keep this feature off lib/api/contract.ts.
interface WhatsappTemplate {
  id: string;
  title: string;
  body: string;
}

const LIST_PATH = "/whatsapp/templates";

const LOAD_FAILURE =
  "Couldn't load the templates right now. They will appear once the connection recovers.";
const SAVE_FAILURE =
  "Couldn't save the template. Try again, or tell Al Saeed if it repeats.";
const DELETE_FAILURE =
  "Couldn't remove the template. Try again, or tell Al Saeed if it repeats.";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

/** Pull the plain-language failure message off an ApiError, falling back to the
 *  control's own copy. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.messagePlain
    ? error.messagePlain
    : fallback;
}

// Render the two supported placeholders from the patient name. {{first_name}}
// is the first whitespace token of the name; {{full_name}} is the whole name.
// An unknown placeholder is left as-is. The name is never logged.
function renderBody(body: string, name: string | null): string {
  const fullName = (name ?? "").trim();
  const firstName = fullName.split(/\s+/)[0] ?? "";
  return body
    .replace(/\{\{\s*full_name\s*\}\}/g, fullName)
    .replace(/\{\{\s*first_name\s*\}\}/g, firstName);
}

// Build the click-to-chat link: the number stripped to digits only (wa.me
// expects no plus or spaces) and the rendered body URL-encoded.
function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

type Props = {
  /** The deal's internal Zoho record id (lead_ref.zoho_id on the case). Accepted
   *  to mirror the control it replaces (SendFirstContact) and the task contract;
   *  the template library is case-agnostic, so it is not sent on any call here. */
  resourceId: string;
  /** The same PatientRefData CaseFile hands PatientRef. The name (when this
   *  viewer may see it) is read only through PatientRef's patientName helper, so
   *  this file never spells the guarded field. Used only to render placeholders
   *  client-side; the name is never logged. */
  patient: PatientRefData;
  /** The patient's number, supplied by CaseFile (the allowlisted reader). Null
   *  when none is on file or this viewer may not see it. Stripped to digits for
   *  the wa.me link; never logged. */
  phone: string | null;
};

// resourceId is accepted on Props (the case-file passes it) but not destructured
// here: the library is case-agnostic, so nothing in this control needs it.
export function WhatsAppMessage({ patient, phone }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  // Read the name through the sanctioned helper, never by field. Used only to
  // fill placeholders into the message we open in WhatsApp; never logged.
  const name = patientName(patient);

  const templates = useQuery({
    queryKey: qk.whatsappTemplates(),
    queryFn: () =>
      fetchEnvelope<{ templates: WhatsappTemplate[] }>(
        "whatsapp_templates",
        LIST_PATH,
      ),
  });

  const list = useMemo(
    () => templates.data?.data?.templates ?? [],
    [templates.data],
  );

  // Resolve the chosen template, falling back to the first available so a manager
  // who never touches the picker still has something to send.
  const chosen = useMemo(() => {
    if (list.length === 0) return null;
    return list.find((t) => t.id === selectedId) ?? list[0];
  }, [list, selectedId]);

  const hasPhone = phone != null && phone.trim() !== "";
  const rendered = chosen ? renderBody(chosen.body, name) : "";
  const canMessage = hasPhone && chosen != null;

  function onOpenChat() {
    if (!canMessage || phone == null) return;
    // The digits and the body ride only in the URL we open; never logged.
    window.open(waLink(phone, rendered), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-3 rounded-[12px] border border-line px-[15px] py-[13px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
          <MessageCircle strokeWidth={1.8} aria-hidden="true" className="h-3.5 w-3.5" />
          Message on WhatsApp
        </div>
        <Button size="sm" variant="ghost" onClick={() => setManageOpen(true)}>
          <Pencil strokeWidth={1.8} aria-hidden="true" />
          Manage templates
        </Button>
      </div>

      {templates.isPending ? (
        <p className="py-1 text-[12px] text-ink-3">Loading templates.</p>
      ) : templates.isError ? (
        <p className="py-1 text-[12px] text-ink-3">{LOAD_FAILURE}</p>
      ) : list.length === 0 ? (
        <p className="py-1 text-[12px] text-ink-3">
          No templates yet. Add one with Manage templates.
        </p>
      ) : (
        <>
          <Field label="Template" htmlFor="wa-template-pick" className="mb-2">
            <select
              id="wa-template-pick"
              value={chosen?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
              className="w-full rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
            >
              {list.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="my-[9px] whitespace-pre-wrap break-words rounded-[10px] border border-line-soft bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
            {rendered}
          </div>
        </>
      )}

      {hasPhone ? (
        <button
          type="button"
          disabled={!canMessage}
          onClick={onOpenChat}
          className="inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border border-transparent bg-accent px-[11px] py-[5.5px] text-xs font-semibold text-on-accent hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-[15px] [&_svg]:w-[15px]"
        >
          <MessageCircle strokeWidth={1.8} aria-hidden="true" />
          Open chat with the message
        </button>
      ) : (
        <p className="text-[11px] text-ink-3">
          No number on file, so there is nothing to message yet.
        </p>
      )}

      <p className="mt-2 text-[11px] text-ink-3">
        This opens WhatsApp with the message pre-typed. Review it, then press send
        in WhatsApp. Nothing is sent from here.
      </p>

      {manageOpen ? (
        <ManageTemplatesModal
          templates={list}
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </div>
  );
}

// The manage-templates modal: lists templates with edit and delete, and an
// add form (title + body). Wired to the live POST/PATCH/DELETE seams; each write
// invalidates the shared list query so the picker and the list refresh. Shows
// the supported placeholders as helper text. Templates carry no patient data.
function ManageTemplatesModal({
  templates,
  onClose,
}: {
  templates: WhatsappTemplate[];
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // The row being edited, or null for the add form. Title/body are the working
  // copy bound to the inputs.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
  }

  function startEdit(t: WhatsappTemplate) {
    setEditingId(t.id);
    setTitle(t.title);
    setBody(t.body);
  }

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: qk.whatsappTemplates() });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { title: title.trim(), body: body.trim() };
      if (editingId) {
        return mutateEnvelope<{ id: string }>(
          "whatsapp_templates",
          "PATCH",
          `${LIST_PATH}/${encodeURIComponent(editingId)}`,
          payload,
        );
      }
      return mutateEnvelope<{ id: string }>(
        "whatsapp_templates",
        "POST",
        LIST_PATH,
        payload,
      );
    },
    onSuccess: () => {
      toast(editingId ? "Template updated." : "Template added.");
      void refresh();
      resetForm();
    },
    onError: (error) => toast(errorMessage(error, SAVE_FAILURE), AlertCircle),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      mutateEnvelope<{ id: string }>(
        "whatsapp_templates",
        "DELETE",
        `${LIST_PATH}/${encodeURIComponent(id)}`,
      ),
    onSuccess: (_result, id) => {
      toast("Template removed.");
      void refresh();
      if (editingId === id) resetForm();
    },
    onError: (error) => toast(errorMessage(error, DELETE_FAILURE), AlertCircle),
  });

  const canSave =
    title.trim().length > 0 && body.trim().length > 0 && !saveMutation.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    saveMutation.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      aria-label="Manage WhatsApp templates"
      className="w-[560px]"
    >
      <ModalTitle>Manage WhatsApp templates</ModalTitle>
      <ModalText>
        The team picks one of these on a case; the app fills the placeholders and
        opens WhatsApp with the message pre-typed. Templates carry no patient
        detail.
      </ModalText>

      {templates.length > 0 ? (
        <div className="mb-[15px] max-h-[220px] overflow-y-auto">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-2 border-b border-line-soft py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-title">{t.title}</div>
                <div className="mt-0.5 line-clamp-2 break-words text-[12px] text-ink-2">
                  {t.body}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                  <Pencil strokeWidth={1.8} aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(t.id)}
                >
                  <Trash2 strokeWidth={1.8} aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-[15px] py-1 text-[13px] text-ink-2">
          No templates yet. Add the first one below.
        </p>
      )}

      <form onSubmit={onSubmit}>
        <div className="mb-[5px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
          {editingId ? "Edit template" : "Add a template"}
        </div>
        <Field label="Title" htmlFor="wa-template-title">
          <FieldInput
            id="wa-template-title"
            type="text"
            autoComplete="off"
            maxLength={TITLE_MAX}
            placeholder="e.g. Appointment confirmation"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="Message body"
          htmlFor="wa-template-body"
          hint="Placeholders: {{first_name}} and {{full_name}} are filled from the patient name when you open the chat."
        >
          <textarea
            id="wa-template-body"
            rows={4}
            maxLength={BODY_MAX}
            placeholder="Write the message. Use {{first_name}} or {{full_name}} where the name should go."
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full resize-y rounded-inner border border-line bg-surface-2 px-[11px] py-[8.5px] text-[13.5px] leading-relaxed text-ink focus:border-transparent focus:outline-2 focus:outline-accent focus:outline-offset-0"
          />
        </Field>

        <ModalRow>
          {editingId ? (
            <Button variant="ghost" onClick={resetForm}>
              Cancel edit
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" disabled={!canSave}>
            {editingId ? (
              <>
                <Pencil strokeWidth={1.8} aria-hidden="true" />
                Save changes
              </>
            ) : (
              <>
                <Plus strokeWidth={1.8} aria-hidden="true" />
                Add template
              </>
            )}
          </Button>
        </ModalRow>
      </form>
    </Modal>
  );
}

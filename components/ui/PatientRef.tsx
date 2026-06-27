/* Patient reference. The ONLY file in the repo allowed to reference
   patient_name (CI enforced).

   The API serializes patient_ref { zoho_id, initials } for everyone and
   appends patient_name server-side only for viewers with sees_patient_names
   (Fatima and Razan). This component renders the field verbatim when it is
   present and renders the reference alone otherwise. It NEVER composes or
   guesses a name from any other field. */

export type PatientRefData = {
  zoho_id: string;
  initials: string;
  /* Human-readable Zoho reference the team reads. Shown in place of the
     internal zoho_id when present; zoho_id stays the navigation key. */
  ref?: string | null;
  /* True when ref fell back to the internal record id (no Zoho_ID on the
     record). The marker keeps an honest distinction from a real number. */
  ref_is_fallback?: boolean;
  /* Present only when the API chose to include it for this viewer. */
  patient_name?: string | null;
};

/* The plain patient name string for callers that must fill it into a value
   rather than render it (e.g. WhatsApp template placeholders for a click-to-chat
   link). Returns null when the API did not include the name for this viewer.
   This is the ONLY sanctioned way to read the name outside this file: callers
   pass the same PatientRefData they hand to PatientRef, so they never spell the
   guarded field themselves (CI keeps the literal confined here). The value is
   the patient name; callers must treat it as identity and never log it. */
export function patientName(patient: PatientRefData): string | null {
  return patient.patient_name ?? null;
}

type PatientRefProps = {
  patient: PatientRefData;
  className?: string;
};

export function PatientRef({ patient, className }: PatientRefProps) {
  /* Display the human ref when the API supplied one; otherwise the internal
     record id is the only reference available. The fallback marker says so
     plainly rather than presenting the record id as a Zoho number. */
  const display = patient.ref ?? patient.zoho_id;
  const reference = `${display} · ${patient.initials}`;
  const marker = patient.ref_is_fallback ? (
    <span className="ml-1 italic text-ink-3" title="No Zoho reference on this record yet, showing the internal record id.">
      no ref
    </span>
  ) : null;

  if (patient.patient_name) {
    /* Name-seers (Fatima, Razan) see the patient name and the ID together. The
       initials are dropped here: they are only the privacy stand-in for when
       the name is hidden, so beside the full name they are redundant. */
    return (
      <span className={`block ${className ?? ""}`}>
        <b className="block text-[13px] font-semibold text-title">{patient.patient_name}</b>
        <span className="num block text-[11.5px] text-ink-3">
          {display}
          {marker}
        </span>
      </span>
    );
  }

  return (
    <span className={`num ${className ?? ""}`}>
      {reference}
      {marker}
    </span>
  );
}

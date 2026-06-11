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
  /* Present only when the API chose to include it for this viewer. */
  patient_name?: string | null;
};

type PatientRefProps = {
  patient: PatientRefData;
  className?: string;
};

export function PatientRef({ patient, className }: PatientRefProps) {
  const reference = `${patient.zoho_id} · ${patient.initials}`;

  if (patient.patient_name) {
    return (
      <span className={`block ${className ?? ""}`}>
        <b className="block text-[13px] font-semibold text-title">{patient.patient_name}</b>
        <span className="num block text-[11.5px] text-ink-3">{reference}</span>
      </span>
    );
  }

  return <span className={`num ${className ?? ""}`}>{reference}</span>;
}

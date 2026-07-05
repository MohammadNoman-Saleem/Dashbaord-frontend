// Patient privacy: the per-field gate AND the global sweep backstop, the two
// belts that keep patient identifiers from a viewer without the capability.
// This is compliance-critical (NHRA, 03 section 13). Both must be present and
// the sweep must run inside handler() on every response.
//
// Ported from the NestJS backend:
//   - PatientSerializer  <- src/privacy/patient.serializer.ts (the per-field gate)
//   - sweepPatientPii / PATIENT_PII_KEYS <- src/common/envelope.interceptor.ts
//     (the global deep-delete backstop)
//
// The @Injectable PatientSerializer becomes a plain object (no DI): there is no
// per-request state, so a single shared instance is exported plus standalone
// functions for callers that prefer them. The sweep is a pure function the
// handler invokes with the resolved viewer.
//
// SERVER ONLY. The per-field gate is the primary control; the sweep is
// defense-in-depth. If the serializer misses, the sweep deep-deletes any
// patient-PII key and logs the COUNT only, never any patient value.
import type { RequestViewer } from './auth/viewer';

// ---------------------------------------------------------------------------
// Per-field gate (PatientSerializer). Everyone gets the reference (Zoho record
// id plus initials); patient_name is appended only when the REAL signed-in
// viewer has sees_patient_names. The viewer here is never the ?as= person:
// name visibility follows the session, not the viewed dashboard.
// ---------------------------------------------------------------------------

export interface PatientRef {
  zoho_id: string;
  initials: string;
}

/** "Fatema Hasan" -> "F.H.", "Amal" -> "A.", missing -> the middot. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const letters =
    words.length === 1
      ? [words[0][0]]
      : [words[0][0], words[words.length - 1][0]];
  return letters.map((c) => c.toUpperCase() + '.').join('');
}

export function patientRef(
  zohoId: string,
  name: string | null | undefined,
): PatientRef {
  return { zoho_id: zohoId, initials: initialsOf(name) };
}

/** Append patient_name only for viewers holding the capability. */
export function withPatientName<T extends { patient_ref: PatientRef }>(
  row: T,
  name: string | null | undefined,
  viewer: RequestViewer,
): T & { patient_name?: string } {
  if (viewer.sees_patient_names && name) {
    return { ...row, patient_name: name };
  }
  return row;
}

// PatientSerializer object form: a drop-in for call sites that ported the
// class method names (ref / initialsOf / withName). No state, so one shared
// instance is enough; no DI, no decorators.
export class PatientSerializer {
  initialsOf(name: string | null | undefined): string {
    return initialsOf(name);
  }

  ref(zohoId: string, name: string | null | undefined): PatientRef {
    return patientRef(zohoId, name);
  }

  withName<T extends { patient_ref: PatientRef }>(
    row: T,
    name: string | null | undefined,
    viewer: RequestViewer,
  ): T & { patient_name?: string } {
    return withPatientName(row, name, viewer);
  }
}

/** Shared stateless instance, mirroring the single DI provider in Nest. */
export const patientSerializer = new PatientSerializer();

// ---------------------------------------------------------------------------
// Global sweep backstop. Defense-in-depth: the serializer is the primary gate;
// if it misses, these keys must never reach a viewer who lacks
// sees_patient_names. The handler runs this on every response data payload.
// ---------------------------------------------------------------------------

// The patient-PII keys deep-deleted from a response when the real viewer lacks
// sees_patient_names. Verbatim from the backend envelope interceptor.
export const PATIENT_PII_KEYS: ReadonlySet<string> = new Set([
  'patient_name',
  'patient_phone',
  'whatsapp_message',
  // A reactive-inbox event snippet is raw patient message text; the per-field
  // gate in the channel-events service sets it only for name-seers, this is the
  // sweep backstop.
  'message_snippet',
]);

/** Recursively delete any patient-PII key in place, counting removals. The
 *  count (never any value) is what the handler logs when the sweep fires. */
export function sweepPatientPii(
  value: unknown,
  hits: { count: number },
): void {
  if (Array.isArray(value)) {
    for (const item of value) sweepPatientPii(item, hits);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (PATIENT_PII_KEYS.has(key)) {
        delete record[key];
        hits.count += 1;
        continue;
      }
      sweepPatientPii(record[key], hits);
    }
  }
}

/** True when this viewer must NOT see patient PII (no viewer, or the real
 *  signed-in user lacks the capability). Service (MCP) viewers never see
 *  names, so they are swept too. */
export function viewerMustNotSeePii(
  viewer: RequestViewer | null | undefined,
): boolean {
  return !viewer || !viewer.sees_patient_names;
}

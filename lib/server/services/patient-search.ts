// Patient search by phone (read-only, in-memory over the cached CRM reads).
//
// The Zoho client has no server-side phone search, so this filters the already
// cached Deals + Leads sets (getCrmRead()) by a normalized phone match. No live
// Zoho call. Deals carry the patient WhatsApp number on Patient_Mobile; Leads
// carry it on Phone (see crm-read.ts). Both are patient data: the raw phone is
// NEVER logged, audited, or returned; only the resolved record reference, the
// (gated) patient name, and non-patient routing fields (stage/status, pipeline,
// owner) leave this module.
//
// Normalization rule (so +973, 00973, and a bare local number all match):
//   1. Strip every character except digits from the query and from each record
//      phone.
//   2. A query with fewer than 7 digits is too short to match (returns no
//      matches); an empty query is a BadRequest at the route.
//   3. Compute the trailing suffixes: the last 9 digits (preferred) and the
//      last 8 digits. A record matches when its normalized phone shares the
//      trailing-8 suffix with the query; a trailing-9 suffix match is preferred
//      and sorts first. The 8 to 9 digit window covers Gulf local-number
//      lengths while ignoring country-code prefixes.
//
// Privacy (NHRA, compliance-critical): the route gates this to viewers holding
// sees_patient_names before calling in. The patient name is set only for a
// name-seeing viewer (per-field gate); the handler's global sweep is the
// backstop. The phone is never echoed back.
//
// SERVER ONLY (pulls the cached CRM reads).
import { getCrmRead } from '../crm-read';
import type { RequestViewer } from '../auth/viewer';

// Local response type (kept in this feature file on purpose: the search match
// shape is single-consumer and we do not touch the shared contract module).
export interface PatientSearchMatch {
  kind: 'lead' | 'deal';
  zoho_id: string;
  /** The patient name, present only for a viewer who sees patient names. */
  name: string | null;
  /** Deal Stage or Lead Status, whichever applies to the record. */
  stage_or_status: string | null;
  /** Deal pipeline; null on leads. */
  pipeline: string | null;
  /** Case-manager owner name (staff data, not patient PII). */
  owner: string | null;
  /** Human-readable Zoho reference, falling back to the internal id. */
  ref: string;
}

const MIN_DIGITS = 7;

/** Strip everything but digits. */
function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D+/g, '');
}

/** The trailing n digits of a normalized number, or the whole thing if shorter. */
function suffix(digits: string, n: number): string {
  return digits.length <= n ? digits : digits.slice(-n);
}

interface ScoredMatch {
  match: PatientSearchMatch;
  /** 2 = trailing-9 suffix match (preferred), 1 = trailing-8 suffix match. */
  rank: number;
}

/** Compare a record's normalized phone to the query suffixes. Returns the rank
 *  (2 preferred, 1 weaker) or 0 for no match. Both must be at least 8 digits on
 *  the overlapping window for an 8-suffix match to be meaningful. */
function rankPhone(
  recordDigits: string,
  query8: string,
  query9: string,
): number {
  if (recordDigits.length < MIN_DIGITS) return 0;
  // Trailing-9 preferred: only when both sides actually carry 9+ digits, so a
  // short side cannot spuriously "prefer".
  if (
    query9.length >= 9 &&
    recordDigits.length >= 9 &&
    suffix(recordDigits, 9) === query9
  ) {
    return 2;
  }
  if (suffix(recordDigits, 8) === query8) return 1;
  return 0;
}

/**
 * Search the cached Leads + Deals by phone. Empty query throws is handled at
 * the route (BadRequest); a query under 7 digits returns no matches. The viewer
 * must already be a name-seer (the route enforces this); name is gated here as
 * a second belt.
 */
export async function searchByPhone(
  rawPhone: string,
  viewer: RequestViewer,
): Promise<PatientSearchMatch[]> {
  const queryDigits = normalizePhone(rawPhone);
  if (queryDigits.length < MIN_DIGITS) return [];

  const query8 = suffix(queryDigits, 8);
  const query9 = suffix(queryDigits, 9);

  const crm = getCrmRead();
  const [dealsRead, leadsRead] = await Promise.all([crm.deals(), crm.leads()]);

  const scored: ScoredMatch[] = [];

  for (const d of dealsRead.data) {
    const rank = rankPhone(normalizePhone(d.Patient_Mobile), query8, query9);
    if (rank === 0) continue;
    const name = d.Contact_Name?.name ?? d.Deal_Name ?? null;
    scored.push({
      rank,
      match: {
        kind: 'deal',
        zoho_id: d.id,
        name: viewer.sees_patient_names ? name : null,
        stage_or_status: d.Stage ?? null,
        pipeline: d.Pipeline ?? null,
        owner: d.Owner?.name ?? null,
        ref: (d.Zoho_ID ?? '').trim() || d.id,
      },
    });
  }

  for (const l of leadsRead.data) {
    const rank = rankPhone(normalizePhone(l.Phone), query8, query9);
    if (rank === 0) continue;
    const fullName = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
    scored.push({
      rank,
      match: {
        kind: 'lead',
        zoho_id: l.id,
        name: viewer.sees_patient_names ? fullName || null : null,
        stage_or_status: l.Lead_Status ?? null,
        pipeline: null,
        owner: l.Owner?.name ?? null,
        ref: (l.Zoho_ID ?? '').trim() || l.id,
      },
    });
  }

  // Preferred (trailing-9) matches first; stable within rank.
  scored.sort((a, b) => b.rank - a.rank);
  return scored.map((s) => s.match);
}

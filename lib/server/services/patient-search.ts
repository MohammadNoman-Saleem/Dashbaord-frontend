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
import { initialsOf } from '../privacy';
import type { RequestViewer } from '../auth/viewer';

// Local response type (kept in this feature file on purpose: the search match
// shape is single-consumer and we do not touch the shared contract module).
//
// PRIVACY (NHRA): the match carries a patient_ref (record id + initials + the
// human Zoho reference) that everyone may see, and the patient_name as a
// SEPARATE, optional top-level field set only for a name-seeing viewer. The
// field is named patient_name on purpose so the handler's global PII sweep
// (PATIENT_PII_KEYS) deep-deletes it as a backstop if the per-field gate is ever
// bypassed, and so the client renders it through PatientRef (the only component
// allowed to spell a patient name) via {...match, ...match.patient_ref}, exactly
// like the queue and case file.
export interface PatientSearchMatch {
  kind: 'lead' | 'deal';
  /** Record reference everyone may see: internal id, initials, and the human
   *  Zoho reference (with a fallback marker when no Zoho_ID is on the record). */
  patient_ref: {
    zoho_id: string;
    initials: string;
    ref: string;
    ref_is_fallback: boolean;
  };
  /** The patient name, present ONLY for a viewer who sees patient names. Swept
   *  by the global backstop for anyone else. */
  patient_name?: string;
  /** Deal Stage or Lead Status, whichever applies to the record. */
  stage_or_status: string | null;
  /** Deal pipeline; null on leads. */
  pipeline: string | null;
  /** Case-manager owner name (staff data, not patient PII). */
  owner: string | null;
}

/** Build a match row from a record. Everyone gets the patient_ref (id, initials,
 *  human ref); patient_name is attached only for a name-seeing viewer (the
 *  per-field gate), and the handler's global sweep strips any that slips past.
 *  Centralized so every match path (phone, name, id) gates the name identically. */
function buildMatch(
  kind: 'lead' | 'deal',
  id: string,
  zohoRef: string | null | undefined,
  name: string | null,
  stageOrStatus: string | null,
  pipeline: string | null,
  owner: string | null,
  viewer: RequestViewer,
): PatientSearchMatch {
  const trimmed = (zohoRef ?? '').trim();
  const match: PatientSearchMatch = {
    kind,
    patient_ref: {
      zoho_id: id,
      initials: initialsOf(name),
      ref: trimmed || id,
      ref_is_fallback: trimmed.length === 0,
    },
    stage_or_status: stageOrStatus,
    pipeline,
    owner,
  };
  if (viewer.sees_patient_names && name) {
    match.patient_name = name;
  }
  return match;
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
      match: buildMatch(
        'deal',
        d.id,
        d.Zoho_ID,
        name,
        d.Stage ?? null,
        d.Pipeline ?? null,
        d.Owner?.name ?? null,
        viewer,
      ),
    });
  }

  for (const l of leadsRead.data) {
    const rank = rankPhone(normalizePhone(l.Phone), query8, query9);
    if (rank === 0) continue;
    const fullName = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
    scored.push({
      rank,
      match: buildMatch(
        'lead',
        l.id,
        l.Zoho_ID,
        fullName || null,
        l.Lead_Status ?? null,
        null,
        l.Owner?.name ?? null,
        viewer,
      ),
    });
  }

  // Preferred (trailing-9) matches first; stable within rank.
  scored.sort((a, b) => b.rank - a.rank);
  return scored.map((s) => s.match);
}

// ---------------------------------------------------------------------------
// Smart search (name OR phone OR Zoho record id), auto-detected from the query.
//
// One box, three intents. The mode is inferred from the raw query, never asked
// for: a query that carries any A-Z letter is a NAME search (case-insensitive
// substring); a letter-free query is NUMERIC and matched as both a record id /
// Zoho_ID (exact) and, when long enough, a phone suffix (the existing helper,
// unchanged). Phone behaviour is byte-identical to searchByPhone: same
// normalization, same rankPhone, same suffixes.
//
// Ranking: an id match is the strongest signal (100, an exact reference hit);
// then phone-suffix ranks (2 preferred, 1 weaker); then name (2 prefix, 1
// substring). A record can match more than one way (e.g. an id that also reads
// as a phone suffix), so matches dedupe by `${kind}:${id}` keeping the MAX rank.
//
// PRIVACY (NHRA): identical gates to searchByPhone. The query and any patient
// name are NEVER logged here; the name field is set only for a name-seeing
// viewer (per-field gate), and the route's global sweep is the backstop.
// ---------------------------------------------------------------------------

const NAME_RANK_PREFIX = 2;
const NAME_RANK_SUBSTRING = 1;
const ID_RANK = 100;

/** Name substring rank: 2 when the lowercased name starts with the lowercased
 *  query, 1 when it merely contains it, 0 when it does not. */
function rankName(name: string, queryLower: string): number {
  const haystack = name.toLowerCase();
  if (!haystack.includes(queryLower)) return 0;
  return haystack.startsWith(queryLower) ? NAME_RANK_PREFIX : NAME_RANK_SUBSTRING;
}

/** True when a record's internal id or its Zoho_ID reference equals the query
 *  exactly (trimmed). The internal id is compared raw; the Zoho_ID is trimmed
 *  because the team's references can carry stray whitespace. */
function matchesId(
  recordId: string,
  zohoId: string | null | undefined,
  query: string,
): boolean {
  if (recordId === query) return true;
  const ref = (zohoId ?? '').trim();
  return ref.length > 0 && ref === query;
}

export async function search(
  rawQuery: string,
  viewer: RequestViewer,
): Promise<PatientSearchMatch[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const hasLetters = /[A-Za-z]/.test(q);

  const crm = getCrmRead();
  const [dealsRead, leadsRead] = await Promise.all([crm.deals(), crm.leads()]);

  // Dedupe by record, keeping the strongest rank a record earned across the
  // matching paths (id beats phone beats name).
  const byKey = new Map<string, ScoredMatch>();
  const consider = (key: string, rank: number, build: () => PatientSearchMatch) => {
    if (rank <= 0) return;
    const existing = byKey.get(key);
    if (existing && existing.rank >= rank) return;
    byKey.set(key, { rank, match: build() });
  };

  if (hasLetters) {
    // NAME mode: case-insensitive substring over the record's display name.
    const queryLower = q.toLowerCase();

    for (const d of dealsRead.data) {
      const name = d.Contact_Name?.name ?? d.Deal_Name ?? '';
      const rank = name ? rankName(name, queryLower) : 0;
      consider(`deal:${d.id}`, rank, () =>
        buildMatch(
          'deal',
          d.id,
          d.Zoho_ID,
          d.Contact_Name?.name ?? d.Deal_Name ?? null,
          d.Stage ?? null,
          d.Pipeline ?? null,
          d.Owner?.name ?? null,
          viewer,
        ),
      );
    }

    for (const l of leadsRead.data) {
      const fullName = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
      const rank = fullName ? rankName(fullName, queryLower) : 0;
      consider(`lead:${l.id}`, rank, () =>
        buildMatch(
          'lead',
          l.id,
          l.Zoho_ID,
          fullName || null,
          l.Lead_Status ?? null,
          null,
          l.Owner?.name ?? null,
          viewer,
        ),
      );
    }
  } else {
    // NUMERIC mode: exact id / Zoho_ID, plus a phone-suffix match reusing the
    // existing rankPhone helper (byte-identical to searchByPhone). The phone
    // path only runs once the query carries enough digits to be a phone.
    const digits = q.replace(/\D/g, '');
    const usePhone = digits.length >= MIN_DIGITS;
    const query8 = suffix(digits, 8);
    const query9 = suffix(digits, 9);

    for (const d of dealsRead.data) {
      const idMatch = matchesId(d.id, d.Zoho_ID, q);
      const phoneRank = usePhone
        ? rankPhone(normalizePhone(d.Patient_Mobile), query8, query9)
        : 0;
      const rank = idMatch ? ID_RANK : phoneRank;
      consider(`deal:${d.id}`, rank, () =>
        buildMatch(
          'deal',
          d.id,
          d.Zoho_ID,
          d.Contact_Name?.name ?? d.Deal_Name ?? null,
          d.Stage ?? null,
          d.Pipeline ?? null,
          d.Owner?.name ?? null,
          viewer,
        ),
      );
    }

    for (const l of leadsRead.data) {
      const idMatch = matchesId(l.id, l.Zoho_ID, q);
      const phoneRank = usePhone
        ? rankPhone(normalizePhone(l.Phone), query8, query9)
        : 0;
      const rank = idMatch ? ID_RANK : phoneRank;
      const fullName = [l.First_Name, l.Last_Name].filter(Boolean).join(' ');
      consider(`lead:${l.id}`, rank, () =>
        buildMatch(
          'lead',
          l.id,
          l.Zoho_ID,
          fullName || null,
          l.Lead_Status ?? null,
          null,
          l.Owner?.name ?? null,
          viewer,
        ),
      );
    }
  }

  // Strongest signal first; stable within an equal rank (Map preserves insertion
  // order, and a stable sort keeps that order for ties).
  const scored = [...byKey.values()];
  scored.sort((a, b) => b.rank - a.rank);
  return scored.map((s) => s.match);
}

// The medical-travel leads route service. Ported from the NestJS backend
// src/leads/leads.controller.ts (LeadsController.medicalTravel) plus the
// query-validation that lived in the controller.
//
// The heavy lifting (the LeadsService.medicalTravel read engine, classification,
// enrichment upsert, reconciliation, reads composition, DTOs) was already
// re-homed VERBATIM into lib/server/services/leads-read.ts during Phase 1, where
// pulse and cases consume it. This file REUSES that singleton (getLeadsRead())
// rather than duplicating the logic, and adds only the controller-level concern
// the route needs: validate the ?from / ?to query dates with the exact backend
// message, then return the { data, parts } the route wraps with
// withMeta(data, mergeMeta(parts)).
//
// PRIVACY (NHRA, 07 section 3): this payload serves NO patient or lead names to
// ANY viewer, by construction. The action table emits a synthetic ref ("L01"),
// the Zoho lead id, origin country, an authored specialty display label, and the
// normalized status only; the patient's own concern text and any name/phone stay
// in leads_enrichment for the care team and never enter this DTO. There is thus
// no per-field name to gate here (unlike pipeline/cockpit, which carry a
// patient_ref + optional patient_name). The handler's global sweepPatientPii
// remains the backstop on every response.
//
// SERVER ONLY. Node runtime: the underlying read touches pg (pool) and
// Zoho/Meta. Never import from a client component.
import { BadRequestError } from '../errors';
import {
  getLeadsRead,
  type LeadsReadService,
  type MedicalTravelData,
} from './leads-read';
import type { SourceMeta } from '../envelope';

// Verbatim from the backend controller: from / to must look like 2026-06-01.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate the optional ?from / ?to query dates exactly as the backend
 *  LeadsController did, throwing the same plain-language BadRequest message.
 *  undefined is allowed (the read falls back to the active campaign window). */
export function validateMedicalTravelDates(
  from?: string,
  to?: string,
): void {
  for (const [name, value] of [
    ['from', from],
    ['to', to],
  ] as const) {
    if (value !== undefined && !DATE_RE.test(value)) {
      throw new BadRequestError(`${name} must be a date like 2026-06-01.`);
    }
  }
}

/** Route-facing medical-travel read. Validates the dates (backend controller
 *  behavior), then delegates to the re-homed leads read engine. Returns the
 *  { data, parts } pair so the thin route can wrap it with
 *  withMeta(data, mergeMeta(parts)), matching the backend response shape. */
export async function medicalTravel(
  from?: string,
  to?: string,
): Promise<{ data: MedicalTravelData; parts: SourceMeta[] }> {
  validateMedicalTravelDates(from, to);
  return getLeadsRead().medicalTravel(from, to);
}

// globalThis-pinned singleton mirroring the other domain services. It holds no
// state of its own (the read engine singleton lives in leads-read.ts); this is
// a thin facade so routes get a uniform getLeadsService() accessor.
export class LeadsService {
  private readonly reads: LeadsReadService = getLeadsRead();

  validateDates(from?: string, to?: string): void {
    validateMedicalTravelDates(from, to);
  }

  async medicalTravel(
    from?: string,
    to?: string,
  ): Promise<{ data: MedicalTravelData; parts: SourceMeta[] }> {
    this.validateDates(from, to);
    return this.reads.medicalTravel(from, to);
  }
}

const LEADS_SERVICE_KEY = '__leadsService';

type GlobalWithLeadsService = typeof globalThis & {
  [LEADS_SERVICE_KEY]?: LeadsService;
};

export function getLeadsService(): LeadsService {
  const g = globalThis as GlobalWithLeadsService;
  if (!g[LEADS_SERVICE_KEY]) {
    g[LEADS_SERVICE_KEY] = new LeadsService();
  }
  return g[LEADS_SERVICE_KEY];
}

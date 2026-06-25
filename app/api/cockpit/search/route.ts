// POST /api/cockpit/search - smart patient search (name OR phone OR Zoho id).
//
// A read-only lookup over the cached CRM reads (no live Zoho search, no write).
// The search term is patient-identifiable (a name, a phone, or a Zoho record
// reference), so two privacy measures apply:
//   1. ACCESS: gated to viewers holding sees_patient_names; everyone else gets
//      403 before any record is touched.
//   2. TRANSPORT: the term rides in the POST BODY, never the URL. A GET with the
//      term in the query string would land patient names and phones in server
//      access logs and browser history; POST keeps it out of both. The body is
//      never logged and never written to the audit row, which records only the
//      actor and the result COUNT.
//
// Pattern: handler() + ctx.requireViewer(), runtime nodejs, envelope-shaped.
// The body is JSON-parsed and zod-validated at the boundary (same pattern as the
// cockpit write route), then the service auto-detects name vs numeric and
// applies the match. Name/phone fields ride the per-field gate (set in the
// service) plus the handler's global PII sweep.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import {
  search,
  type PatientSearchMatch,
} from '@/lib/server/services/patient-search';

export const runtime = 'nodejs';

// The search term in the request body: present and non-empty. The length floor
// (>= 2), the name-vs-numeric detection, and the digit normalization all live in
// the service; the route only guards the empty/malformed case.
const searchBodySchema = z.object({
  q: z.string().min(1),
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  // Privacy gate (NHRA): only a viewer who sees patient names may run an
  // identifiable patient lookup. Service viewers and non-name-seers are refused
  // before any record is touched.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to patient search.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // Plain-language, and crucially carries no echo of the input value.
    throw new BadRequestError('Enter a name, phone, or Zoho ID to search.');
  }
  const parsed = searchBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Enter a name, phone, or Zoho ID to search.');
  }

  const matches: PatientSearchMatch[] = await search(parsed.data.q, viewer);

  // Audit the search: actor and a COUNT only. The search term and any patient
  // name are deliberately excluded from the audit payload.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'cockpit.patient_search',
    entity_type: 'crm_search',
    context: { match_count: matches.length },
  });

  return withMeta({ matches });
});

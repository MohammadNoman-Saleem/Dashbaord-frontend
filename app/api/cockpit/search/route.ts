// GET /api/cockpit/search?phone=<raw> - patient search by phone.
//
// A read-only lookup over the cached CRM reads (no live Zoho search, no write).
// Phone-to-patient is an identifiable lookup, so it is gated to viewers holding
// sees_patient_names; everyone else gets 403. The raw phone is treated as
// sensitive: it is NEVER logged and NEVER written to the audit row. The audit
// row records only the actor and the result count.
//
// Pattern: handler() + ctx.requireViewer(), runtime nodejs, envelope-shaped.
// The query string is validated at the boundary (a present, non-empty phone),
// then searchByPhone applies the digit-suffix match. Name/phone fields ride the
// per-field gate (set in the service) plus the handler's global PII sweep.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import {
  searchByPhone,
  type PatientSearchMatch,
} from '@/lib/server/services/patient-search';

export const runtime = 'nodejs';

// The phone query param: present and non-empty. The digit-count floor and the
// normalization live in the service; the route only guards the empty case.
const phoneQuerySchema = z.object({
  phone: z.string().min(1),
});

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  // Privacy gate (NHRA): only a viewer who sees patient names may run an
  // identifiable phone-to-patient lookup. Service viewers and non-name-seers
  // are refused before any record is touched.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to patient search.');
  }

  const phoneParam = new URL(req.url).searchParams.get('phone');
  const parsed = phoneQuerySchema.safeParse({ phone: phoneParam ?? '' });
  if (!parsed.success) {
    // Plain-language, and crucially carries no echo of the input value.
    throw new BadRequestError('Enter a phone number to search.');
  }

  const matches: PatientSearchMatch[] = await searchByPhone(
    parsed.data.phone,
    viewer,
  );

  // Audit the search: actor and a COUNT only. The phone value and any patient
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

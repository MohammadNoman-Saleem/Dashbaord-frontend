// POST /api/extension/lookup  { phone }
//
// The Chrome extension's one-shot lookup: given the active WhatsApp chat's
// phone number, return the best-matching Zoho case with enough context to fill
// the side panel, plus the valid next stages so the panel can offer a one-click
// stage advance. Composes existing services only:
//   - searchByPhone() ranks cached Deals (Patient_Mobile) + Leads (Phone).
//   - cockpitService.caseFile() assembles the full case file for the top match.
//   - PIPELINE_STAGES gives the stage vocabulary for a deal's pipeline.
//
// PRIVACY (NHRA): the phone arrives in the POST body (never the query string) so
// it stays out of request logs and history, exactly like /api/cockpit/search.
// The route is gated to name-seers (a case manager identifying a patient); a
// non-name-seer gets a Forbidden. The per-field patient gates live in the
// services and the handler's global PII sweep is the backstop. The phone is
// never echoed back.
//
// SERVER ONLY: runtime 'nodejs' (the services reach pg/Zoho through the
// foundation singletons).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta, mergeMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { searchByPhone } from '@/lib/server/services/patient-search';
import { cockpitService } from '@/lib/server/services/cockpit';
import { PIPELINE_STAGES } from '@/lib/server/crm-read';
import { LEAD_STATUSES } from '@/lib/server/services/write-gate-changes';
import { openEventsForCase } from '@/lib/server/services/channel-events';

export const runtime = 'nodejs';

const LookupSchema = z.object({
  phone: z.string().min(1, 'A phone number is required.'),
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Identifying a patient from their number is patient data: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to patient lookup.');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Bad request.');
  }
  const parsed = LookupSchema.safeParse(raw);
  if (!parsed.success) throw new BadRequestError('Bad request.');

  const matches = await searchByPhone(parsed.data.phone, viewer);
  const top = matches[0] ?? null;
  if (!top) {
    return withMeta({
      match: null,
      matches_count: 0,
      case: null,
      stage_options: [],
      lead_status_options: [],
    });
  }

  const { data: caseData, parts } = await cockpitService.caseFile(
    top.patient_ref.zoho_id,
    viewer,
  );

  // This route is already name-seer gated, so open-event snippets ride along.
  const openEvents = await openEventsForCase(top.patient_ref.zoho_id, viewer);

  // Deal stages come from the matched pipeline; leads advance by status, which
  // the panel handles separately, so their stage options are empty here.
  const stageOptions =
    top.kind === 'deal' && top.pipeline
      ? (PIPELINE_STAGES[top.pipeline] ?? [])
      : [];

  return withMeta(
    {
      match: top,
      matches_count: matches.length,
      case: caseData,
      stage_options: stageOptions,
      // Leads advance by Lead_Status; the panel's status control offers the
      // exact picklist set_lead_status validates against.
      lead_status_options: top.kind === 'lead' ? [...LEAD_STATUSES] : [],
      open_events: openEvents,
    },
    mergeMeta(parts),
  );
});

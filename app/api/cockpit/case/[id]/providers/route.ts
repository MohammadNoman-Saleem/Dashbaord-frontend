// /api/cockpit/case/[id]/providers
//   GET - the hospitals the case [id] (a deal/lead zoho_id) has been sent to,
//         plus the pickable hospital list, for the case file's Hospitals section.
//
// The patient-to-hospital link lives in the Postgres provider_referrals table
// (see lib/server/services/provider-board.ts); Zoho has no such field. This read
// returns the patient's active links (linked) and the deduped hospital directory
// to pick from (available). Adds and removes reuse the provider-board routes
// (POST /api/provider-board, DELETE /api/provider-board/[id]).
//
// PRIVACY (NHRA): which hospital a patient was sent to is patient health data, so
// this is gated to name-seers, the same gate as the provider board and patient
// search; anyone else gets a ForbiddenError. The response carries hospital names
// and Zoho ids only, never a patient name.
//
// Node runtime: the service reaches Postgres through getPool() and the cached
// Zoho reads.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { ForbiddenError } from '@/lib/server/errors';
import { viewerMustNotSeePii } from '@/lib/server/privacy';
import { getProviderBoardService } from '@/lib/server/services/provider-board';

export const runtime = 'nodejs';

/** Read the case [id] segment from /api/cockpit/case/<id>/providers (second to
 *  last). Mirrors the notes route's path-segment convention. */
function caseIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../case/<id>/providers -> <id> is the segment before the trailing 'providers'.
  return decodeURIComponent(segments[segments.length - 2] ?? '');
}

export const GET = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  // Patient health data: name-seers only.
  if (viewerMustNotSeePii(viewer)) {
    throw new ForbiddenError('You do not have access to this case.');
  }

  const zohoId = caseIdFromUrl(req.url);
  const service = getProviderBoardService();
  const [linked, available] = await Promise.all([
    service.referralsForPatient(zohoId),
    service.listHospitals(),
  ]);

  return withMeta({ linked, available });
});

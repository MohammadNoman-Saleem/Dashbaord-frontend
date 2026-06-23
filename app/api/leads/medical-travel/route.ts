// GET /api/leads/medical-travel?from=&to= (07 section 3). Single source for the
// Cases card, the Marketing campaign card, and the p-mtl home panel. Ported from
// the NestJS backend src/leads/leads.controller.ts (LeadsController.medicalTravel,
// @Controller('leads') @Get('medical-travel')). Visible to any signed-in user.
//
// Thin: require a viewer (the backend's global JwtAuthGuard gated every route),
// read the ?from / ?to query params, call the service (which validates the dates
// and delegates to the re-homed leads read engine), then return the branded
// envelope withMeta(data, mergeMeta(parts)) so the existing frontend
// (lib/api/contract.ts MedicalTravelLeadsData) keeps working unchanged.
//
// PRIVACY (NHRA): lead names are never served to anyone in this payload, by
// construction (no name/phone field is emitted, for any viewer). The handler's
// global patient-PII sweep runs automatically as the backstop.
//
// Node runtime: the service reaches pg (pool) and Zoho/Meta through the leads
// read.
import { handler } from '@/lib/server/handler';
import { mergeMeta, withMeta } from '@/lib/server/envelope';
import { getLeadsService } from '@/lib/server/services/leads';

export const runtime = 'nodejs';

export const GET = handler(async (req, ctx) => {
  ctx.requireViewer();
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const { data, parts } = await getLeadsService().medicalTravel(from, to);
  return withMeta(data, mergeMeta(parts));
});

// GET /api/pulse - the heartbeat strip. Ported from the NestJS backend
// src/pulse/pulse.controller.ts (@Controller('pulse') @Get()). The controller
// was thin (return withMeta(await this.pulse.pulse())) and stays thin here: it
// requires a viewer (the backend's global JwtAuthGuard gated every route), then
// calls the ported PulseService and returns the branded envelope. handler()
// runs the global patient-PII sweep automatically.
//
// The PulseDto shape (blips, steady_count, attention_count, updated_at) is
// preserved VERBATIM from the backend so the existing frontend (lib/api/
// contract.ts PulseData) keeps working unchanged.
//
// Node runtime: the service touches pg (pool) and Zoho/Meta via the leads read.
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { getPulse } from '@/lib/server/services/pulse';

export const runtime = 'nodejs';

export const GET = handler(async (_req, ctx) => {
  ctx.requireViewer();
  return withMeta(await getPulse().pulse());
});

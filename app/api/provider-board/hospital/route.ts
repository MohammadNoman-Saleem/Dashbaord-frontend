// POST /api/provider-board/hospital -> add a board-only custom hospital (one not
// in the Zoho Hospitals directory). It never touches Zoho; it becomes an extra
// column on the provider board under its country. Person-only and open to every
// signed-in viewer, since a hospital name and country carry no patient identity;
// audited (business name + country, no patient data).
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError, ForbiddenError } from '@/lib/server/errors';
import { getAudit } from '@/lib/server/audit';
import { getProviderBoardService } from '@/lib/server/services/provider-board';
import type { RequestViewer } from '@/lib/server/auth/viewer';

export const runtime = 'nodejs';

function assertPerson(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError('The service key cannot edit the provider board.');
  }
}

const addHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();
  assertPerson(viewer);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = addHospitalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError('Enter a hospital name and a country.');
  }

  const result = await getProviderBoardService().addCustomHospital(
    viewer,
    parsed.data,
  );
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'provider_board.add_hospital',
    entity_type: 'provider_board_custom_hospitals',
    entity_id: result.id,
    after: { name: parsed.data.name.trim(), country: parsed.data.country.trim() },
  });
  return withMeta(result);
});

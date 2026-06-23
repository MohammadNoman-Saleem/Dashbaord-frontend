// POST /api/admin/users/:key/reset-password -> issue a one-time temporary
// password the user must change on first login. Admin-only (on the REAL
// viewer), audited.
//
// Ports the NestJS AdminController.resetPassword. Thin: resolve the viewer,
// read the [key] path segment, validate it, call the service, return the
// envelope. The backend used @HttpCode(200); handler() already returns 200 on
// success, so the status matches. Admin gate and audit live in the service.
//
// No request body. The response carries no patient PII; the handler's global
// sweep is the backstop.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import { resetAdminUserPassword } from '@/lib/server/services/admin-users';

// Node runtime: the service reaches pg/argon2 through users.ts and auth.ts.
export const runtime = 'nodejs';

// The :key path param. The backend took it untyped and let findByKey resolve
// it (the key is lowercased there); we apply the same lightweight guard the
// account key uses so an empty or oversized segment is rejected at the
// boundary before any DB work.
const keySchema = z.string().min(1).max(40);

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  // Pull the [key] segment from the path: /api/admin/users/<key>/reset-password.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segments.lastIndexOf('reset-password');
  const rawKey = idx > 0 ? decodeURIComponent(segments[idx - 1] ?? '') : '';

  const parsed = keySchema.safeParse(rawKey);
  if (!parsed.success) {
    throw new BadRequestError('Provide a user key.');
  }

  const result = await resetAdminUserPassword(viewer, parsed.data);
  return withMeta(result);
});

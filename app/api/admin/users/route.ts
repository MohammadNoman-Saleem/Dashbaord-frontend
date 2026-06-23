// GET  /api/admin/users -> every account (admin-only, on the REAL viewer).
// POST /api/admin/users -> create an account, returning a one-time temporary
//                          password. Admin-only, audited.
//
// Ports the NestJS AdminController.list and AdminController.create. Thin:
// resolve the viewer, (for POST) validate the body with a zod schema that
// re-expresses the backend CreateUserDto, call the service, return the
// envelope. Admin gate and audit live in the service, matching the backend.
//
// These rows carry no patient PII; the handler's global sweep is the backstop.
import { z } from 'zod';
import { handler } from '@/lib/server/handler';
import { withMeta } from '@/lib/server/envelope';
import { BadRequestError } from '@/lib/server/errors';
import {
  createAdminUser,
  listAdminUsers,
} from '@/lib/server/services/admin-users';

// Node runtime: the service reaches pg/argon2 through users.ts and auth.ts.
export const runtime = 'nodejs';

// Re-expresses the backend CreateUserDto (class-validator) as a zod schema:
//   key:        Matches /^[a-z][a-z0-9_]{1,30}$/
//   name:       string, MinLength 2, MaxLength 60
//   email:      optional, IsEmail
//   role:       IsIn ['admin','dept_head','member']
//   department: optional string, MaxLength 40
//   manager_key:optional string, MaxLength 40
const createUserSchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{1,30}$/,
      'The key starts with a letter and uses lowercase letters, numbers, and underscores only.',
    ),
  name: z.string().min(2).max(60),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'dept_head', 'member']),
  department: z.string().max(40).optional(),
  manager_key: z.string().max(40).optional(),
});

export const GET = handler(async (_req, ctx) => {
  const viewer = ctx.requireViewer();
  const rows = await listAdminUsers(viewer);
  return withMeta(rows);
});

export const POST = handler(async (req, ctx) => {
  const viewer = ctx.requireViewer();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Send a valid JSON body.');
  }

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new BadRequestError(first?.message ?? 'Check the form and try again.');
  }

  const created = await createAdminUser(viewer, parsed.data);
  return withMeta(created);
});

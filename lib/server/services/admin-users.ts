// User administration service. Ported from the NestJS backend
// src/admin/admin.controller.ts (the AdminController body) into plain async
// functions: list accounts, create an account, reset a password.
//
// Admin-only, evaluated on the REAL signed-in viewer (?as= never grants this),
// and the MCP service key is refused outright. The @Injectable UsersService /
// AuthService / AuditService dependencies become the foundation accessors:
// users.ts functions, auth.ts hashPassword, and getAudit().
//
// Temporary passwords are generated server-side, returned ONCE to the route for
// the admin to hand over out of band, and never logged or audited: the audit
// row records that a password event happened, not the secret itself.
//
// SERVER ONLY (pg/argon2 via users.ts and auth.ts, node:crypto). Routes that
// call this declare export const runtime = 'nodejs'.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/auth';
import { getAudit } from '../audit';
import {
  createUser,
  findByKey,
  listAccounts,
  setTempPassword,
} from '../users';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors';
import type { RequestViewer } from '../auth/viewer';

// Verbatim DTO shapes from the backend admin.controller.ts (class-validator and
// @nestjs/swagger decorators stripped; the body shape is re-expressed as a zod
// schema at the route boundary).
export interface AdminUserRow {
  key: string;
  name: string;
  role: string;
  department: string | null;
  last_login: string | null;
  must_reset: boolean;
}

export interface AdminUserCreated {
  user: AdminUserRow;
  temp_password: string;
}

export interface PasswordReset {
  key: string;
  temp_password: string;
  must_reset: boolean;
}

/** The validated create body. Mirrors the backend CreateUserDto after
 *  class-validator parsing: key/name/role required, email/department/manager_key
 *  optional. The zod schema at the route boundary enforces the same rules. */
export interface CreateUserInput {
  key: string;
  name: string;
  email?: string;
  role: 'admin' | 'dept_head' | 'member';
  department?: string;
  manager_key?: string;
}

/** 12 url-safe characters, comfortably above the 10-char change minimum.
 *  Verbatim from the backend tempPassword(). */
function tempPassword(): string {
  return randomBytes(9).toString('base64url');
}

function toRow(user: {
  key: string;
  name: string;
  role: string;
  department: string | null;
  last_login: Date | null;
  must_reset: boolean;
}): AdminUserRow {
  return {
    key: user.key,
    name: user.name,
    role: user.role,
    department: user.department,
    last_login: user.last_login ? user.last_login.toISOString() : null,
    must_reset: user.must_reset,
  };
}

/** Admin-only, on the real viewer. The MCP service key is refused too.
 *  Verbatim from the backend AdminController.assertAdmin. */
function assertAdmin(viewer: RequestViewer): void {
  if (viewer.is_service) {
    throw new ForbiddenError(
      'The MCP service key cannot manage user accounts.',
    );
  }
  if (viewer.role !== 'admin') {
    throw new ForbiddenError('Only admins can manage user accounts.');
  }
}

/** GET /admin/users body. Ports AdminController.list. */
export async function listAdminUsers(
  viewer: RequestViewer,
): Promise<AdminUserRow[]> {
  assertAdmin(viewer);
  const accounts = await listAccounts();
  return accounts.map(toRow);
}

/** POST /admin/users body. Ports AdminController.create. Returns the temporary
 *  password ONCE; the audit row records the event, never the secret. */
export async function createAdminUser(
  viewer: RequestViewer,
  body: CreateUserInput,
): Promise<AdminUserCreated> {
  assertAdmin(viewer);

  const existing = await findByKey(body.key);
  if (existing) {
    throw new ConflictError(`${body.key} is already taken. Pick another key.`);
  }
  if (body.manager_key) {
    const manager = await findByKey(body.manager_key);
    if (!manager) {
      throw new ConflictError(
        `No user is registered with the key ${body.manager_key}, so they cannot be a manager.`,
      );
    }
  }

  const password = tempPassword();
  const hash = await hashPassword(password);
  try {
    await createUser({
      key: body.key,
      name: body.name.trim(),
      email: body.email?.trim() || null,
      passwordHash: hash,
      role: body.role,
      department: body.department?.trim() || null,
      manager_key: body.manager_key?.trim() || null,
    });
  } catch (err) {
    // Unique key or email violation: a concurrent create won.
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError(
        'That key or email is already taken. Pick another.',
      );
    }
    throw err;
  }

  // The event is audited; the password never is.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'admin_user.create',
    entity_type: 'users',
    entity_id: body.key,
    after: {
      key: body.key,
      name: body.name.trim(),
      email: body.email?.trim() || null,
      role: body.role,
      department: body.department?.trim() || null,
      manager_key: body.manager_key?.trim() || null,
      must_reset: true,
    },
    context: { note: 'Temporary password issued once, not recorded.' },
  });

  const created = await findByKey(body.key);
  return {
    user: toRow({
      key: body.key,
      name: body.name.trim(),
      role: body.role,
      department: body.department?.trim() || null,
      last_login: created?.last_login ?? null,
      must_reset: true,
    }),
    temp_password: password,
  };
}

/** POST /admin/users/:key/reset-password body. Ports
 *  AdminController.resetPassword. Returns the temporary password ONCE; the audit
 *  row records the event, never the secret. */
export async function resetAdminUserPassword(
  viewer: RequestViewer,
  key: string,
): Promise<PasswordReset> {
  assertAdmin(viewer);

  const user = await findByKey(key);
  if (!user) {
    throw new NotFoundError('No user is registered with that key.');
  }

  const password = tempPassword();
  const hash = await hashPassword(password);
  const updated = await setTempPassword(user.key, hash);
  if (!updated) {
    throw new NotFoundError('No user is registered with that key.');
  }

  // The event is audited; the password never is.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'admin_user.reset_password',
    entity_type: 'users',
    entity_id: user.key,
    after: { key: user.key, must_reset: true },
    context: { note: 'Temporary password issued once, not recorded.' },
  });

  return {
    key: user.key,
    temp_password: password,
    must_reset: true,
  };
}

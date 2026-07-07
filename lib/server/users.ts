// Users data access. Ported from the NestJS backend src/users/users.service.ts.
//
// The @Injectable UsersService with an injected PG_POOL becomes plain async
// functions that read the shared pool from db.ts. Every query is preserved
// verbatim (same SQL, same parameters, same return shapes), including the
// key.toLowerCase() normalization on findByKey and the admin-row exclusions.
//
// SERVER ONLY (pg is Node-only). Never import from a client component.
import { getPool } from './db';

export interface UserRow {
  id: number;
  key: string;
  name: string;
  email: string | null;
  password_hash: string;
  must_reset: boolean;
  role: 'admin' | 'dept_head' | 'member';
  department: string | null;
  manager_key: string | null;
  default_view: string;
  theme: string;
  sees_patient_names: boolean;
  can_view_as: boolean;
  can_edit_payout_rules: boolean;
  last_login: Date | null;
}

export async function findByKey(key: string): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>(
    'select * from users where key = $1',
    [key.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function listPeople(): Promise<
  Array<{
    key: string;
    name: string;
    role: string;
    department: string | null;
  }>
> {
  const { rows } = await getPool().query<{
    key: string;
    name: string;
    role: string;
    department: string | null;
  }>(
    `select key, name, role, department from users where key <> 'admin' order by name`,
  );
  return rows;
}

/** Dashboard users assignable as Zoho task owners: anyone with a Zoho Projects
 *  zpuid, excluding the admin system row (it shares a zpuid with a real person,
 *  so showing both would confuse the picker). Sorted by name. Mirrors the
 *  legacy getAssignableUsers(), but sourced from Postgres. */
export async function assignableUsers(): Promise<
  Array<{ key: string; name: string; zpuid: string }>
> {
  const { rows } = await getPool().query<{
    key: string;
    name: string;
    zoho_zpuid: string;
  }>(
    `select key, name, zoho_zpuid from users
     where zoho_zpuid is not null and key <> 'admin'
     order by name`,
  );
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    zpuid: r.zoho_zpuid,
  }));
}

/** The assignable user matching a zpuid, or null. Guards the PATCH/create
 *  paths so only a known person's zpuid is ever written to Zoho. */
export async function findByZpuid(
  zpuid: string,
): Promise<{ key: string; name: string; zpuid: string } | null> {
  if (!zpuid) return null;
  const { rows } = await getPool().query<{
    key: string;
    name: string;
    zoho_zpuid: string;
  }>(
    `select key, name, zoho_zpuid from users
     where zoho_zpuid = $1 and key <> 'admin'
     limit 1`,
    [zpuid],
  );
  const r = rows[0];
  return r ? { key: r.key, name: r.name, zpuid: r.zoho_zpuid } : null;
}

export async function recordLogin(key: string): Promise<void> {
  await getPool().query('update users set last_login = now() where key = $1', [
    key,
  ]);
}

export async function setPassword(
  key: string,
  passwordHash: string,
): Promise<void> {
  await getPool().query(
    'update users set password_hash = $2, must_reset = false, updated_at = now() where key = $1',
    [key, passwordHash],
  );
}

/** Admin reset: a temporary password the user must change on first login.
 *  Returns false when no such user exists. */
export async function setTempPassword(
  key: string,
  passwordHash: string,
): Promise<boolean> {
  const result = await getPool().query(
    'update users set password_hash = $2, must_reset = true, updated_at = now() where key = $1',
    [key, passwordHash],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Every account with the admin-screen fields, the pure-admin one too. */
export async function listAccounts(): Promise<
  Array<{
    key: string;
    name: string;
    role: 'admin' | 'dept_head' | 'member';
    department: string | null;
    last_login: Date | null;
    must_reset: boolean;
  }>
> {
  const { rows } = await getPool().query<{
    key: string;
    name: string;
    role: 'admin' | 'dept_head' | 'member';
    department: string | null;
    last_login: Date | null;
    must_reset: boolean;
  }>(
    'select key, name, role, department, last_login, must_reset from users order by name',
  );
  return rows;
}

export async function createUser(input: {
  key: string;
  name: string;
  email: string | null;
  passwordHash: string;
  role: 'admin' | 'dept_head' | 'member';
  department: string | null;
  manager_key: string | null;
}): Promise<void> {
  await getPool().query(
    `insert into users (key, name, email, password_hash, must_reset, role, department, manager_key)
     values ($1, $2, $3, $4, true, $5, $6, $7)`,
    [
      input.key,
      input.name,
      input.email,
      input.passwordHash,
      input.role,
      input.department,
      input.manager_key,
    ],
  );
}

export async function setTheme(
  key: string,
  theme: 'light' | 'dark',
): Promise<void> {
  await getPool().query(
    'update users set theme = $2, updated_at = now() where key = $1',
    [key, theme],
  );
}

/** Team members a dept head may edit KPI targets for (their own team). */
export async function teamOf(managerKey: string): Promise<string[]> {
  const { rows } = await getPool().query<{ key: string }>(
    'select key from users where manager_key = $1',
    [managerKey],
  );
  return rows.map((r) => r.key);
}

/** Resolve helpdesk assignee first-names to Zoho zpuids against the users table
 *  (an explicit stored zpuid wins; a name that matches no user is skipped, never
 *  invented). A name matches when any token of a user's full name equals it,
 *  case-insensitive, so "Noman" resolves "Mohammad Noman". Returns the resolved
 *  zpuids (deduped) and the names that did not resolve. */
export async function zpuidsByNames(
  names: string[],
): Promise<{ resolved: string[]; unresolved: string[] }> {
  const users = await assignableUsers();
  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const match = users.find((u) =>
      u.name.toLowerCase().split(/\s+/).includes(lower),
    );
    if (match) resolved.push(match.zpuid);
    else unresolved.push(name);
  }
  return { resolved: [...new Set(resolved)], unresolved };
}

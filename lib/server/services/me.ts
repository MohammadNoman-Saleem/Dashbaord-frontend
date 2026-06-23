// The signed-in user's identity, capabilities, theme, and (when permitted) the
// person list for view-as. Ported from the NestJS backend src/auth/me.controller
// .ts (@Controller('me')). The controller carried the business logic inline
// (constructor-injected UsersService); here that logic moves into plain async
// functions reading the foundation users.ts accessors. The MeDto / MeCapabilities
// / MePerson shapes, the ROLE_LABELS map, the roleLabel() fallback, and the
// kpi_edit_scope derivation are kept VERBATIM so the frontend is unchanged.
//
// SERVER ONLY (users.ts touches pg). Node runtime. Never import from a client
// component.
import { findByKey, listPeople, setTheme } from '../users';
import { UnauthorizedError } from '../errors';
import type { RequestViewer } from '../auth/viewer';

export interface MeCapabilitiesDto {
  can_view_as: boolean;
  sees_patient_names: boolean;
  kpi_edit_scope: string;
  can_edit_payout_rules: boolean;
}

export interface MePersonDto {
  key: string;
  name: string;
  role: string;
  role_label: string;
  department: string | null;
}

export interface MeDto {
  person: string;
  name: string;
  role: string;
  role_label: string;
  department: string | null;
  must_reset: boolean;
  theme: string;
  viewed_person: string;
  capabilities: MeCapabilitiesDto;
  people?: MePersonDto[];
}

/** Display titles for the person menu and the sidebar viewer block. One
 *  source of truth, server-side, mirroring the spec's role wording. */
const ROLE_LABELS: Record<string, string> = {
  khalid: 'CEO',
  razan: 'CMO',
  alsaeed: 'Fractional CTO',
  afaf: 'Marketing lead',
  fatima: 'Case manager',
  aziz: 'Operations officer',
  noman: 'Product analyst',
  isa: 'Finance analyst',
  admin: 'Administrator',
};

function roleLabel(key: string, role: string): string {
  return ROLE_LABELS[key] ?? role.replace('_', ' ');
}

/** GET /me. The MCP service key has no personal view; a viewer whose row has
 *  since vanished is treated as an expired session. Capabilities and the
 *  view-as person list come fresh from the database. */
export async function getMe(viewer: RequestViewer): Promise<MeDto> {
  if (viewer.is_service) {
    throw new UnauthorizedError('The MCP service key has no personal view.');
  }
  const user = await findByKey(viewer.key);
  if (!user) {
    throw new UnauthorizedError('Your session expired. Sign in again.');
  }

  const kpiEditScope =
    user.role === 'admin'
      ? 'any'
      : user.role === 'dept_head'
        ? 'team'
        : 'none';

  const me: MeDto = {
    person: user.key,
    name: user.name,
    role: user.role,
    role_label: roleLabel(user.key, user.role),
    department: user.department,
    must_reset: user.must_reset,
    theme: user.theme,
    viewed_person: viewer.viewed_person,
    capabilities: {
      can_view_as: user.can_view_as,
      sees_patient_names: user.sees_patient_names,
      kpi_edit_scope: kpiEditScope,
      can_edit_payout_rules: user.can_edit_payout_rules,
    },
  };
  if (user.can_view_as) {
    const people = await listPeople();
    me.people = people.map((p) => ({
      ...p,
      role_label: roleLabel(p.key, p.role),
    }));
  }
  return me;
}

/** PATCH /me/theme. Service sessions have no theme. The theme value is
 *  validated at the route boundary. Mirrors the backend: a plain UPDATE, no
 *  audit row. */
export async function updateTheme(
  viewer: RequestViewer,
  theme: 'light' | 'dark',
): Promise<{ theme: 'light' | 'dark' }> {
  if (viewer.is_service) {
    throw new UnauthorizedError('Service sessions have no theme.');
  }
  await setTheme(viewer.key, theme);
  return { theme };
}

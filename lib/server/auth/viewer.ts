// The resolved viewer attached to every authenticated request.
// `sees_patient_names` and write scopes ALWAYS reflect the real signed-in
// user. `viewed_person` reflects ?as= and changes only what is displayed.
//
// Ported verbatim from the NestJS backend src/auth/viewer.ts. SERVER ONLY.
export interface RequestViewer {
  key: string;
  name: string;
  role: 'admin' | 'dept_head' | 'member';
  department: string | null;
  sees_patient_names: boolean;
  can_view_as: boolean;
  can_edit_payout_rules: boolean;
  /** Effective person for person-scoped reads (?as= when permitted). */
  viewed_person: string;
  /** True for x-mcp-key service requests: no person, never sees names. */
  is_service: boolean;
}

export const MCP_VIEWER: RequestViewer = {
  key: 'mcp',
  name: 'MCP service',
  role: 'member',
  department: null,
  sees_patient_names: false,
  can_view_as: false,
  can_edit_payout_rules: false,
  viewed_person: 'mcp',
  is_service: true,
};

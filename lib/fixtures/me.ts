// Fixture for GET /api/me. The viewer shape is not defined in
// lib/api/contract.ts (03 section 7 describes it loosely), so it is shaped
// pragmatically here from 03 section 3: roles, server-resolved capabilities,
// and the view-as people list (present only when can_view_as).
import type { Envelope, Meta } from '@/lib/api/envelope'

export interface PersonListing {
  key: string
  name: string
  role_label: string
}

export interface ViewerCapabilities {
  can_view_as: boolean
  sees_patient_names: boolean
  kpi_edit_scope: 'all' | 'team' | 'none'
  can_edit_payout_rules: boolean
}

export interface ViewerData {
  person: string
  name: string
  role: 'admin' | 'dept_head' | 'member'
  role_label: string
  department: string
  must_reset: boolean
  theme: 'light' | 'dark'
  viewed_person: string
  capabilities: ViewerCapabilities
  /** Listed only when can_view_as. */
  people?: PersonListing[]
}

const TS = '2026-06-11T07:42:00+03:00'

function meta(): Meta {
  return { updated_at: TS, cached: false, stale: false, reliable: true, reasons: [] }
}

const PEOPLE = [
  { key: 'khalid', name: 'Khalid', role_label: 'CEO' },
  { key: 'fatima', name: 'Fatima', role_label: 'Case manager' },
  { key: 'afaf', name: 'Afaf', role_label: 'Marketing lead' },
  { key: 'razan', name: 'Dr. Razan', role_label: 'CMO' },
  { key: 'aziz', name: 'Aziz', role_label: 'Operations officer' },
  { key: 'noman', name: 'Noman', role_label: 'Product analyst' },
  { key: 'alsaeed', name: 'Al Saeed', role_label: 'Fractional CTO' },
  { key: 'isa', name: 'Isa', role_label: 'Finance analyst' },
] satisfies PersonListing[]

const VIEWERS = {
  khalid: {
    person: 'khalid',
    name: 'Khalid',
    role: 'admin',
    role_label: 'CEO',
    department: 'executive',
    must_reset: false,
    theme: 'light',
    viewed_person: 'khalid',
    capabilities: {
      can_view_as: true,
      sees_patient_names: false,
      kpi_edit_scope: 'all',
      can_edit_payout_rules: true,
    },
    people: PEOPLE,
  },
  fatima: {
    person: 'fatima',
    name: 'Fatima',
    role: 'member',
    role_label: 'Case manager',
    department: 'operations',
    must_reset: false,
    theme: 'light',
    viewed_person: 'fatima',
    capabilities: {
      can_view_as: false,
      sees_patient_names: true,
      kpi_edit_scope: 'none',
      can_edit_payout_rules: false,
    },
  },
  afaf: {
    person: 'afaf',
    name: 'Afaf',
    role: 'dept_head',
    role_label: 'Marketing lead',
    department: 'marketing',
    must_reset: false,
    theme: 'light',
    viewed_person: 'afaf',
    capabilities: {
      can_view_as: false,
      sees_patient_names: false,
      kpi_edit_scope: 'team',
      can_edit_payout_rules: false,
    },
  },
  razan: {
    person: 'razan',
    name: 'Dr. Razan',
    role: 'dept_head',
    role_label: 'CMO',
    department: 'operations',
    must_reset: false,
    theme: 'light',
    viewed_person: 'razan',
    capabilities: {
      can_view_as: true,
      sees_patient_names: true,
      kpi_edit_scope: 'team',
      can_edit_payout_rules: false,
    },
    people: PEOPLE,
  },
  aziz: {
    person: 'aziz',
    name: 'Aziz',
    role: 'member',
    role_label: 'Operations officer',
    department: 'operations',
    must_reset: false,
    theme: 'light',
    viewed_person: 'aziz',
    capabilities: {
      can_view_as: false,
      sees_patient_names: false,
      kpi_edit_scope: 'none',
      can_edit_payout_rules: false,
    },
  },
  noman: {
    person: 'noman',
    name: 'Noman',
    role: 'member',
    role_label: 'Product analyst',
    department: 'it',
    must_reset: false,
    theme: 'light',
    viewed_person: 'noman',
    capabilities: {
      can_view_as: false,
      sees_patient_names: false,
      kpi_edit_scope: 'none',
      can_edit_payout_rules: false,
    },
  },
  alsaeed: {
    person: 'alsaeed',
    name: 'Al Saeed',
    role: 'dept_head',
    role_label: 'Fractional CTO',
    department: 'it',
    must_reset: false,
    theme: 'light',
    viewed_person: 'alsaeed',
    capabilities: {
      can_view_as: false,
      sees_patient_names: false,
      kpi_edit_scope: 'team',
      can_edit_payout_rules: false,
    },
  },
  isa: {
    person: 'isa',
    name: 'Isa',
    role: 'member',
    role_label: 'Finance analyst',
    department: 'finance',
    must_reset: false,
    theme: 'light',
    viewed_person: 'isa',
    capabilities: {
      can_view_as: false,
      sees_patient_names: false,
      kpi_edit_scope: 'none',
      can_edit_payout_rules: true,
    },
  },
} satisfies Record<string, ViewerData>

type PersonKey = keyof typeof VIEWERS

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const requested = String(params?.person ?? 'khalid')
  const key = (requested in VIEWERS ? requested : 'khalid') as PersonKey
  return { data: VIEWERS[key], meta: meta() }
}

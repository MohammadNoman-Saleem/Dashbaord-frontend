// Fixture for GET /api/crm?resource=leads|treatment|providers.
// Values lifted from the approved mockup (Saleem_Dashboard_Redesign.html,
// Cases view, "CRM, a closer look" card, page 1 of each resource). All data
// is fictional.
//
// This fixture simulates a non-privileged viewer: rows carry anonymized
// patient references only (Lead numbers, "T-031 · Patient A." style), never
// a patient name field. Page, pages, and total match the mockup footer
// ("Page 1 of 6 · 28 records") for every resource.

import type { Envelope, Meta } from '@/lib/api/envelope'
import type { CrmSliceData } from '@/lib/api/contract'

const UPDATED_AT = '2026-06-11T07:42:00+03:00'

const COLUMNS = [
  { key: 'record', label: 'Record' },
  { key: 'source', label: 'Source' },
  { key: 'country', label: 'Country' },
  { key: 'interest', label: 'Interest' },
  { key: 'logged', label: 'Logged', numeric: true },
]

const LEADS = {
  columns: COLUMNS,
  rows: [
    { record: 'Lead 0428', source: 'Meta ad', country: 'Saudi Arabia', interest: 'Spine surgery', logged: 'Today 9:14 AM' },
    { record: 'Lead 0427', source: 'Novo landing', country: 'Bahrain', interest: 'Obesity consult', logged: 'Today 8:51 AM' },
    { record: 'Lead 0426', source: 'WhatsApp', country: 'Bahrain', interest: 'Dermatology', logged: 'Yesterday' },
    { record: 'Lead 0425', source: 'Google', country: 'Kuwait', interest: 'Cardiac second opinion', logged: 'Yesterday' },
    { record: 'Lead 0424', source: 'Instagram', country: 'Saudi Arabia', interest: 'Knee replacement', logged: 'Jun 8' },
  ],
  page: 1,
  pages: 6,
  total: 28,
} satisfies CrmSliceData

const TREATMENT = {
  columns: COLUMNS,
  rows: [
    { record: 'T-031 · Patient A.', source: 'Meta ad', country: 'Saudi Arabia', interest: 'Spine, quote stage', logged: 'Today' },
    { record: 'T-030 · Patient C.', source: 'Meta ad', country: 'Bahrain', interest: 'Knee, quiet 4 days', logged: 'Jun 6' },
    { record: 'T-029 · Patient H.', source: 'Referral', country: 'Kuwait', interest: 'Cardiac, deposit due', logged: 'Jun 5' },
    { record: 'T-028 · Patient E.', source: 'WhatsApp', country: 'Bahrain', interest: 'Spine, treatment done', logged: 'Jun 1' },
    { record: 'T-027 · Patient J.', source: 'Website', country: 'Saudi Arabia', interest: 'Bariatric, 30-day review', logged: 'May 11' },
  ],
  page: 1,
  pages: 6,
  total: 28,
} satisfies CrmSliceData

const PROVIDERS = {
  columns: COLUMNS,
  rows: [
    { record: 'Dr. M.', source: 'Referral', country: 'Bahrain', interest: 'Cardiology · documents stage', logged: 'Jun 2' },
    { record: 'Alnoor Clinic', source: 'Outreach', country: 'Bahrain', interest: 'Multi-specialty · final approval', logged: 'May 28' },
    { record: 'Dr. T. Fakhro', source: 'Inbound', country: 'Bahrain', interest: 'Mental health · NHRA step', logged: 'May 26' },
    { record: 'Dr. P. Nair', source: 'Partner', country: 'India', interest: 'Orthopedics · discussion', logged: 'May 22' },
    { record: 'City Physio', source: 'Outreach', country: 'Bahrain', interest: 'Physiotherapy · discussion', logged: 'May 20' },
  ],
  page: 1,
  pages: 6,
  total: 28,
} satisfies CrmSliceData

const META = {
  updated_at: UPDATED_AT,
  cached: false,
  stale: false,
  reliable: true,
  reasons: [],
} satisfies Meta

export function fixture(params?: Record<string, string | number | undefined>): Envelope<unknown> {
  const resource = params?.resource
  const data = resource === 'treatment' ? TREATMENT : resource === 'providers' ? PROVIDERS : LEADS
  return { data, meta: META }
}

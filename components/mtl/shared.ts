'use client'

// Shared plumbing for the three medical travel leads surfaces (06 group D):
// the full Cases card, the Marketing campaign card, and the p-mtl home
// panel. One query, one label vocabulary, one set of caption composers.
//
// Captions carry live numbers. The delta payload (07 section 3) serves the
// reads engine bodies pre-rendered but no per-chart caption strings, so the
// one-line captions are composed here from the served numbers only; nothing
// numeric is hardcoded.

import { useQuery } from '@tanstack/react-query'

import type {
  CorridorStatus,
  MedicalTravelLeadsData,
  MtlRead,
} from '@/lib/api/contract'
import type { Meta } from '@/lib/api/envelope'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { fmtDate } from '@/lib/format/datetime'

/** Pegged rate per 07 section 3: 1 BHD = 2.65 USD. */
export const USD_PER_BHD = 2.65

export function useMedicalTravelLeads() {
  return useQuery({
    queryKey: qk.leadsMedicalTravel(),
    queryFn: () =>
      fetchEnvelope<MedicalTravelLeadsData>('leads_medical_travel', '/leads/medical-travel'),
  })
}

/* Display labels for the server's normalized specialty groups (07 section 2). */
export const SPECIALTY_LABELS: Record<string, string> = {
  neuro_spine_rehab: 'Neuro, spine and rehab',
  orthopedics: 'Orthopedics',
  gastro: 'Gastroenterology',
  cosmetic: 'Cosmetic',
  womens_health: "Women's health",
  other: 'Other',
}

export function specialtyLabel(group: string): string {
  return SPECIALTY_LABELS[group] ?? group
}

export const STATUS_BAR_LABELS: Array<{
  key: keyof MedicalTravelLeadsData['statuses']
  label: string
  status?: 'ahead' | 'aside'
}> = [
  { key: 'converted', label: 'Converted to deal', status: 'ahead' },
  { key: 'intro_done', label: 'Intro call done' },
  { key: 'waiting', label: 'Waiting their reply' },
  { key: 'new', label: 'New, last 48h' },
  { key: 'not_qualified', label: 'Not qualified', status: 'aside' },
]

const CORRIDOR_PHRASE: Record<CorridorStatus, string> = {
  live: 'is live',
  proposal: 'sits at Proposal',
  final_stages: 'is in final stages',
  developing: 'is developing',
  not_contacted: 'is not yet contacted',
}

/** "BHD 1.09 ($2.89)" parts, per the Foundation currency convention. */
export function bhdValue(bhd: number, decimals = 2): string {
  return `BHD ${decimals === 0 ? Math.round(bhd).toLocaleString('en-US') : bhd.toFixed(decimals)}`
}

export function usdSuffix(usd: number): string {
  return `($${usd.toFixed(2)})`
}

/** "June 1 to 11" when the window sits in one month, otherwise
 *  "Jun 1 to Jul 3". Unparseable dates pass through via fmtDate. */
export function periodLabel(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return `${fmtDate(from)} to ${fmtDate(to)}`
  }
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    const month = a.toLocaleDateString('en-US', { month: 'long' })
    return `${month} ${a.getDate()} to ${b.getDate()}`
  }
  return `${fmtDate(from)} to ${fmtDate(to)}`
}

export function monthLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 'this month'
  return d.toLocaleDateString('en-US', { month: 'long' })
}

/** "Jun 7" for the day before an ISO date (the first-week CPL label). */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The phrase a null Meta-derived field renders inside PendingValue: the
 *  served reason when there is one, the standard wording otherwise. */
export function pendingPhrase(meta: Meta): string {
  return meta.reasons[0]?.title ?? 'Not connected yet'
}

type Destinations = MedicalTravelLeadsData['destinations']

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

/** "Only Turkey is live. India sits at Proposal, Germany is not yet
 *  contacted." Composed from the served corridor statuses (corridor_config
 *  through the API), never hardcoded. */
export function corridorSentence(destinations: Destinations): string {
  const named = destinations.filter((d) => d.group !== 'Other')
  const live = named.filter((d) => d.corridor_status === 'live').map((d) => d.group)
  const gaps = named
    .filter((d) => d.corridor_status !== 'live')
    .slice(0, 2)
    .map((d) => `${d.group} ${CORRIDOR_PHRASE[d.corridor_status]}`)
  const liveLine =
    live.length === 0
      ? 'No corridor is live yet.'
      : `Only ${joinAnd(live)} ${live.length === 1 ? 'is' : 'are'} live.`
  return gaps.length > 0 ? `${liveLine} ${gaps.join(', ')}.` : liveLine
}

export function originsCaption(data: MedicalTravelLeadsData): string {
  const foreign = data.origins.find((o) => o.country !== 'Bahrain')
  const base = `${data.totals.outside_bahrain_pct}% of leads are from outside Bahrain.`
  return foreign ? `${base} ${foreign.country} leads that group with ${foreign.n}.` : base
}

export function specialtiesCaption(data: MedicalTravelLeadsData): string {
  const top = data.specialties.find((s) => s.group !== 'other') ?? data.specialties[0]
  if (!top || data.totals.zoho_leads === 0) return ''
  const pct = Math.round((top.n / data.totals.zoho_leads) * 100)
  return `${pct}% of demand is ${specialtyLabel(top.group).toLowerCase()}, the work medical travel is built on.`
}

export function statusesCaption(data: MedicalTravelLeadsData): string {
  const { converted, not_qualified } = data.statuses
  const total = data.totals.zoho_leads
  const dq = total > 0 ? Math.round((not_qualified / total) * 100) : 0
  const stage = data.action_rows.find((r) => r.status === 'converted')?.deal_stage
  const convertedLine = stage
    ? `All ${converted} converted deals sit at ${stage}.`
    : `${converted} of ${total} are now deals.`
  return `${convertedLine} A ${dq}% disqualification rate is normal for lead forms.`
}

/** Icon tone per read key; the copy itself is server-rendered. */
export function readTone(read: MtlRead): 'warn' | 'good' | 'info' {
  if (read.key === 'creative_fatigue') return 'warn'
  if (read.key === 'warm_leads') return 'good'
  return 'info'
}

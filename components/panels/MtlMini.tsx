'use client'

// p-mtl (06 group D3): the compact travel-demand home panel for Fatima,
// Razan, and Afaf. Top four destinations as mini bars (live corridor in the
// Recovery fill), the corridor-gap sentence, and the top specialty share.
// Same single API source as the Cases and Marketing cards.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { MiniBars } from '@/components/charts/MiniBars'
import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { MedicalTravelLeadsData } from '@/lib/api/contract'
import { buildDeepLink } from '@/lib/deepLink'
import {
  bhdValue,
  corridorSentence,
  monthLong,
  specialtyLabel,
  useMedicalTravelLeads,
} from '@/components/mtl/shared'

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-1">
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={28} className="mt-2" />
  </div>
)

function demandParagraph(d: MedicalTravelLeadsData): string {
  const top = d.specialties.find((s) => s.group !== 'other') ?? d.specialties[0]
  const specialtyLine = top
    ? ` ${top.n} of ${d.totals.zoho_leads} cases are ${specialtyLabel(top.group).toLowerCase()}.`
    : ''
  return `${corridorSentence(d.destinations)}${specialtyLine}`
}

export function MtlMiniPanel(_props: { person: string }) {
  const viewAs = useSearchParams().get('as') ?? undefined
  const query = useMedicalTravelLeads()
  const data = query.data?.data

  return (
    <Card id="p-mtl" data-focus-id="p-mtl">
      <CardHeader
        title={data ? `Travel demand, ${monthLong(data.period.from)}` : 'Travel demand'}
        subtitle={
          data
            ? `${data.totals.zoho_leads} medical travel leads so far. ${data.totals.converted} are already deals.`
            : 'From the Meta lead campaign.'
        }
        right={
          data?.cpl ? (
            <Chip variant="good" className="num">
              {bhdValue(data.cpl.blended_bhd)} per lead
            </Chip>
          ) : undefined
        }
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.totals.zoho_leads === 0}
          emptyCopy="No medical travel leads this month yet."
        >
          {(d) => {
            const named = d.destinations.filter((dest) => dest.group !== 'Other').slice(0, 4)
            const max = Math.max(...named.map((dest) => dest.n), 1)
            return (
              <>
                <MiniBars
                  rows={named.map((dest) => ({
                    label: dest.group,
                    value: dest.n,
                    pct: (dest.n / max) * 100,
                    status: dest.corridor_status === 'live' ? 'ahead' : undefined,
                  }))}
                />
                <p className="mt-3 text-xs leading-relaxed text-ink-2">{demandParagraph(d)}</p>
              </>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={
          data
            ? `${data.statuses.intro_done} warm leads waiting after intro calls.`
            : 'Counts update with the lead sync.'
        }
        right={
          <Link href={buildDeepLink({ view: 'cases', focus: 'mtl-card' }, viewAs)}>
            Full breakdown
          </Link>
        }
      />
    </Card>
  )
}

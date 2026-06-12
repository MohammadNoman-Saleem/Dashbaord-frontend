'use client'

// p-providers (06 group B): provider onboarding stages as MiniBars with the
// scope pills All, Local, International. Data: GET /api/pipeline/providers,
// now shaped as per-scope blocks {stages, foot} plus an unclassified count.
// Bars render from data, never static markup; widths scale to the scope's
// max. Following the V3 mockup, Final approval keeps the Optimism fill and
// Live keeps Recovery, per the V1 status language. The footer sentence
// arrives assembled server-side per scope; when the API reports providers
// with no country set, the All footer appends "n need a country set" so the
// gap stays visible.

import Link from 'next/link'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { MiniBars, type MiniBarRow } from '@/components/charts/MiniBars'
import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Pills } from '@/components/ui/Pills'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ProvidersData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

type ScopeKey = keyof ProvidersData['scopes']

const SCOPE_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'local', label: 'Local' },
  { key: 'intl', label: 'International' },
]

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-1">
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={28} className="mt-2" />
  </div>
)

export function ProvidersPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const [scope, setScope] = useState<ScopeKey>('all')
  const query = useQuery({
    queryKey: qk.providers(),
    queryFn: () => fetchEnvelope<ProvidersData>('providers', '/pipeline/providers'),
  })

  const data = query.data?.data
  const block = data?.scopes[scope]
  const foot = block
    ? scope === 'all' && data && data.unclassified > 0
      ? `${block.foot} ${data.unclassified} need a country set.`
      : block.foot
    : 'Counts update with the CRM.'

  return (
    <Card id="p-providers" data-focus-id="p-providers">
      <CardHeader
        title="Provider onboarding"
        subtitle="Doctors and clinics moving toward Live."
        right={
          <Pills
            aria-label="Filter by provider scope"
            items={SCOPE_PILLS}
            value={scope}
            onChange={(key) => setScope(key as ScopeKey)}
          />
        }
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.scopes.all.stages.length === 0}
          emptyCopy="No providers in the onboarding pipeline right now."
        >
          {(d) => {
            const stages = d.scopes[scope].stages
            const max = Math.max(...stages.map((s) => s.count), 1)
            const last = stages.length - 1
            const rows: MiniBarRow[] = stages.map((stage, i) => ({
              label: stage.label,
              value: stage.count,
              pct: (stage.count / max) * 100,
              /* Live keeps Recovery, Final approval keeps Optimism. */
              status: i === last ? 'ahead' : i === last - 1 ? 'behind' : undefined,
            }))
            return (
              <>
                <MiniBars rows={rows} />
                <p className="sr-only">
                  {stages.map((s) => `${s.label}: ${s.count}`).join('. ')}
                </p>
              </>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={foot}
        right={<Link href={buildDeepLink({ view: 'cases' }, asParam)}>Provider pipeline</Link>}
      />
    </Card>
  )
}

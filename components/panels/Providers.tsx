'use client'

// p-providers: provider onboarding stages as MiniBars plus a plain sentence
// naming who awaits sign-off. Data: GET /api/pipeline/providers. Following
// the mockup, the final stage fills recovery (already live) and the stage
// before it fills optimism while anyone is waiting on a sign-off.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { MiniBars, type MiniBarRow } from '@/components/charts/MiniBars'
import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ProvidersData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

/* "Waiting on you: Dr. M. (cardiology) and Alnoor Clinic. Both passed the
   checklist." Names come from the API; this only joins them. */
function signoffSentence(names: string[]): string {
  if (names.length === 0) return 'No one is waiting on your sign-off.'
  if (names.length === 1) return `Waiting on you: ${names[0]}. Passed the checklist.`
  const joined =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  const all = names.length === 2 ? 'Both' : 'All'
  return `Waiting on you: ${joined}. ${all} passed the checklist.`
}

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
  const query = useQuery({
    queryKey: qk.providers(),
    queryFn: () => fetchEnvelope<ProvidersData>('providers', '/pipeline/providers'),
  })

  const data = query.data?.data
  const waitingCount = data?.awaiting_signoff.length ?? 0
  const waitingChip =
    waitingCount > 0 ? (
      <Chip variant="warn">
        {waitingCount} {waitingCount === 1 ? 'awaits' : 'await'} your sign-off
      </Chip>
    ) : null
  const pipelineTotal = data ? data.stages.reduce((sum, s) => sum + s.count, 0) : null

  return (
    <Card id="p-providers" data-focus-id="p-providers">
      <CardHeader
        title="Provider onboarding"
        subtitle="Doctors and clinics moving toward Live."
        right={waitingChip}
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.stages.length === 0}
          emptyCopy="No providers in the onboarding pipeline right now."
        >
          {(d) => {
            const max = Math.max(...d.stages.map((s) => s.count), 1)
            const last = d.stages.length - 1
            const rows: MiniBarRow[] = d.stages.map((stage, i) => ({
              label: stage.label,
              value: stage.count,
              pct: (stage.count / max) * 100,
              status:
                i === last
                  ? 'ahead'
                  : i === last - 1 && d.awaiting_signoff.length > 0
                    ? 'behind'
                    : undefined,
            }))
            return (
              <>
                <MiniBars rows={rows} />
                <p className="sr-only">
                  {d.stages.map((s) => `${s.label}: ${s.count}`).join('. ')}
                </p>
                <p className="mt-3 text-xs text-ink-2">{signoffSentence(d.awaiting_signoff)}</p>
              </>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={pipelineTotal != null ? `${pipelineTotal} providers in the pipeline.` : 'Counts update with the CRM.'}
        right={<Link href={buildDeepLink({ view: 'cases' }, asParam)}>Provider pipeline</Link>}
      />
    </Card>
  )
}

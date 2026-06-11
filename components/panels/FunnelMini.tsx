'use client'

// p-funnel-mini: the direct full-booking funnel condensed to four rows, with
// the verified paid percentage as the header chip. Data: GET
// /api/funnels/direct?variant=full. The footer carries the active
// reliability note (meta.reasons[0].title) when one exists; when meta says
// unreliable, QueryPanel adds the banner and this panel dims the chart.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { FunnelBars } from '@/components/charts/FunnelBars'
import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { FunnelDirectData, FunnelStep } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

/* The mini panel shows four rows: entry, first commitment, and the last two
   payment steps. Funnels with four or fewer steps render as served. */
function condense(steps: FunnelStep[]): FunnelStep[] {
  if (steps.length <= 4) return steps
  return [steps[0], steps[1], steps[steps.length - 2], steps[steps.length - 1]]
}

const SKELETON = (
  <div className="flex flex-col gap-[9px] py-1">
    <Skeleton height={22} />
    <Skeleton height={22} />
    <Skeleton height={22} />
    <Skeleton height={22} />
  </div>
)

export function FunnelMiniPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.funnels('direct', 'full'),
    queryFn: () =>
      fetchEnvelope<FunnelDirectData>('funnels_direct', '/funnels/direct', { variant: 'full' }),
    staleTime: 5 * 60_000,
  })

  const envelope = query.data
  const data = envelope?.data
  const reason = envelope?.meta.reasons[0]
  const paidChip = data ? (
    envelope.meta.reliable ? (
      <Chip variant="good" className="num">{data.end_to_end_pct}% paid</Chip>
    ) : (
      <Chip variant="warn">Do not trust yet</Chip>
    )
  ) : null

  return (
    <Card id="p-funnel-mini" data-focus-id="p-funnel-mini">
      <CardHeader
        title="Booking funnel, this month"
        subtitle={
          data?.paid_verified === false
            ? 'Direct full booking.'
            : 'Direct full booking. Payments verified in the admin panel.'
        }
        right={paidChip}
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.steps.length === 0}
          emptyCopy="No funnel data for this month yet."
        >
          {(d, _meta, flags) => {
            const rows = condense(d.steps)
            return (
              <div className={flags.unreliable ? 'opacity-55' : undefined}>
                <FunnelBars rows={rows.map((s) => ({ label: s.label, value: s.count }))} />
                <p className="sr-only">
                  {rows
                    .map((s) => `${s.label}: ${s.count.toLocaleString()} (${s.pct_of_first}% of the first step)`)
                    .join('. ')}
                </p>
              </div>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={reason ? reason.title : 'No reliability flags on this funnel.'}
        right={<Link href={buildDeepLink({ view: 'funnels' }, asParam)}>All funnels</Link>}
      />
    </Card>
  )
}

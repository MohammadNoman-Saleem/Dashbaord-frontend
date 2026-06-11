'use client'

// p-handoffs: the week's on-time summary plus each miss as a list row.
// Data: GET /api/handoffs. The 95% target is the documented SLA from the
// spec; the chip flips to warn in words when the week runs under it.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Check, CircleAlert } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ListRow } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { HandoffsData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

const ON_TIME_TARGET_PCT = 95

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

export function HandoffsPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.handoffs(),
    queryFn: () => fetchEnvelope<HandoffsData>('handoffs', '/handoffs'),
  })

  const data = query.data?.data
  const pctChip = data ? (
    <Chip variant={data.on_time_pct >= ON_TIME_TARGET_PCT ? 'good' : 'warn'} className="num">
      {data.on_time_pct}%
    </Chip>
  ) : null

  return (
    <Card id="p-handoffs" data-focus-id="p-handoffs">
      <CardHeader
        title="Handoffs & SLAs, this week"
        subtitle="Promises kept between departments."
        right={pctChip}
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(d) => d.total === 0}
          emptyCopy="No handoffs recorded yet this week."
        >
          {(d) => (
            <div>
              <ListRow
                icon={Check}
                variant="good"
                title={`${d.on_time_count} of ${d.total} handoffs on time`}
                subtitle="Leads logged, bugs routed, releases announced."
              />
              {d.misses.map((miss) => (
                <ListRow
                  key={`${miss.what}-${miss.when}`}
                  icon={CircleAlert}
                  variant="warn"
                  title={miss.what}
                  subtitle={`${miss.owner}, ${miss.when}. ${miss.cause}`}
                />
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
      <CardFooter
        note={`Target is ${ON_TIME_TARGET_PCT}% on time.`}
        right={<Link href={buildDeepLink({ view: 'kpis' }, asParam)}>SLA targets</Link>}
      />
    </Card>
  )
}

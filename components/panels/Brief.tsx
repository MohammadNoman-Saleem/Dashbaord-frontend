'use client'

// p-brief: the weekly brief, three highlight rows plus a freshness chip.
// Data: GET /api/brief/latest. Footer links to the full brief on /agents.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Check, CircleAlert } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ListRow } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { BriefData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'
import { fmtTime } from '@/lib/format/datetime'

/* "Compiled Saturday 7:48 PM." per the copy rules. Bad payloads degrade to
   the raw string, never to "NaN". */
function compiledLine(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return `Compiled ${iso}.`
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `Compiled ${weekday} ${fmtTime(iso)}.`
}

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

export function BriefPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.brief(),
    queryFn: () => fetchEnvelope<BriefData>('brief', '/brief/latest'),
  })

  const envelope = query.data
  const compiledAt = envelope?.data?.compiled_at
  const freshness = envelope?.data ? (
    envelope.meta.stale ? <Chip variant="warn">Stale</Chip> : <Chip variant="good">Fresh</Chip>
  ) : null

  return (
    <Card id="p-brief" data-focus-id="p-brief">
      <CardHeader
        title="Weekly brief"
        subtitle={compiledAt ? compiledLine(compiledAt) : 'Compiled every Saturday evening.'}
        right={freshness}
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(data) => data.highlights.length === 0}
          emptyCopy="No brief compiled yet. The first one lands Saturday evening."
        >
          {(data) => (
            <div>
              {data.highlights.slice(0, 3).map((h) => (
                <ListRow
                  key={h.title}
                  icon={h.good ? Check : CircleAlert}
                  variant={h.good ? 'good' : 'warn'}
                  title={h.title}
                  subtitle={h.text}
                />
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
      <CardFooter
        note="Sunday meeting runs off this."
        right={<Link href={buildDeepLink({ view: 'agents' }, asParam)}>Full brief</Link>}
      />
    </Card>
  )
}

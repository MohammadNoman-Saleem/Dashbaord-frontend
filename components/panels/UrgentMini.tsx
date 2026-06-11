'use client'

// p-urgent-mini: the top three open urgent items, shared by the whole team.
// Data: GET /api/urgent (30s staleness, matching the Topbar pill policy).
// The footer "Open the board" link opens the urgent drawer in place by
// dispatching the 'open-urgent-drawer' window event; it never routes away.

import { useQuery } from '@tanstack/react-query'
import { Flag } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ListRow } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { UrgentData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { fmtAgo } from '@/lib/format/datetime'

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

export function UrgentMiniPanel(_props: { person: string }) {
  const query = useQuery({
    queryKey: qk.urgent(),
    queryFn: () => fetchEnvelope<UrgentData>('urgent', '/urgent'),
    staleTime: 30_000,
  })

  const openCount = query.data?.data?.open.length ?? 0
  const countChip = openCount > 0 ? <Chip variant="warn">{openCount} open</Chip> : null

  return (
    <Card id="p-urgent-mini" data-focus-id="p-urgent-mini">
      <CardHeader
        title="Urgent right now"
        subtitle="Shared across the whole team."
        right={countChip}
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(data) => data.open.length === 0}
          emptyCopy="Nothing urgent. Enjoy it."
        >
          {(data) => (
            <div>
              {data.open.slice(0, 3).map((item) => (
                <ListRow
                  key={item.id}
                  icon={Flag}
                  variant="warn"
                  title={item.text}
                  subtitle={`Raised by ${item.raised_by_name} · ${fmtAgo(item.created_at)}`}
                />
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
      <CardFooter
        note="Resolve them as they land."
        right={
          <button
            type="button"
            className="cursor-pointer text-accent-text"
            onClick={() => window.dispatchEvent(new CustomEvent('open-urgent-drawer'))}
          >
            Open the board
          </button>
        }
      />
    </Card>
  )
}

'use client'

// p-blockers (06 group F): "Blockers raised to you", first on Aziz's home.
// Open blockers with raiser, age, waiting-on, and the repeat chip where the
// root cause flag is set. The footer link opens the blockers drawer in
// place by dispatching the 'open-blockers-drawer' window event; it never
// routes away (mirrors p-urgent-mini).

import { useQuery } from '@tanstack/react-query'
import { MinusCircle } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ListRow } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { BlockerItem, BlockersData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

function subLine(item: BlockerItem): string {
  const parts = [item.raised_by_name, item.age_label]
  if (item.waiting_on) parts.push(`waiting on ${item.waiting_on}`)
  return parts.join(' · ')
}

export function BlockersMiniPanel(_props: { person: string }) {
  const query = useQuery({
    queryKey: qk.blockers(),
    queryFn: () => fetchEnvelope<BlockersData>('blockers', '/blockers'),
    staleTime: 30_000,
  })

  const openCount = query.data?.data?.open.length ?? 0
  const countChip = openCount > 0 ? <Chip variant="warn">{openCount} open</Chip> : null

  return (
    <Card id="p-blockers" data-focus-id="p-blockers">
      <CardHeader
        title="Blockers raised to you"
        subtitle="Anyone on the team can raise one. You own the unblock and the root cause."
        right={countChip}
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(data) => data.open.length === 0}
          emptyCopy="Nothing blocked. Clear road."
        >
          {(data) => (
            <div>
              {data.open.map((item) => (
                <ListRow
                  key={item.id}
                  icon={MinusCircle}
                  variant={item.root_cause_flag ? 'warn' : 'info'}
                  title={item.text}
                  subtitle={subLine(item)}
                  right={
                    item.root_cause_flag ? (
                      <Chip variant="warn">Repeat, root cause review</Chip>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </QueryPanel>
      </div>
      <CardFooter
        note="Still open on Saturday becomes the Blocked section of the weekly update."
        right={
          <button
            type="button"
            id="openBlockFromCard"
            className="cursor-pointer text-accent-text"
            onClick={() => window.dispatchEvent(new CustomEvent('open-blockers-drawer'))}
          >
            Open the board
          </button>
        }
      />
    </Card>
  )
}

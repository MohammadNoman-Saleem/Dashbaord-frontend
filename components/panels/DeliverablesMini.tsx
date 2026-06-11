'use client'

// p-deliverables-mini: four of the month's objectives with status chips and
// honest counts in the footer. Data: GET /api/deliverables?month=2026-06.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Check, CircleAlert, Target } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip, type ChipVariant } from '@/components/ui/Chip'
import { ListRow, type ListRowVariant } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { DeliverableRow } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

const MONTH = '2026-06'
const SHOWN = 4

const STATUS_CHIP: Record<DeliverableRow['status'], { variant: ChipVariant; label: string }> = {
  done: { variant: 'good', label: 'Done' },
  on_track: { variant: 'info', label: 'On track' },
  in_progress: { variant: 'info', label: 'In progress' },
  in_review: { variant: 'info', label: 'In review' },
  needs_start: { variant: 'warn', label: 'Needs a start' },
}

function rowIcon(status: DeliverableRow['status']) {
  if (status === 'done') return Check
  if (status === 'needs_start') return CircleAlert
  return Target
}

function rowVariant(status: DeliverableRow['status']): ListRowVariant {
  if (status === 'done') return 'good'
  if (status === 'needs_start') return 'warn'
  return 'info'
}

/* "khalid" reads as "Khalid"; "al_saeed" reads as "Al Saeed". */
function ownerName(key: string): string {
  return key
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/* "June objectives" from the month constant. */
function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`)
  if (Number.isNaN(d.getTime())) return month
  return d.toLocaleDateString('en-US', { month: 'long' })
}

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

export function DeliverablesMiniPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.deliverables(MONTH),
    queryFn: () => fetchEnvelope<DeliverableRow[]>('deliverables', '/deliverables', { month: MONTH }),
  })

  const total = query.data?.data?.length

  return (
    <Card id="p-deliverables-mini" data-focus-id="p-deliverables-mini">
      <CardHeader
        title={`${monthLabel(MONTH)} objectives`}
        subtitle="Ship-by-end-of-month commitments."
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(rows) => rows.length === 0}
          emptyCopy="No objectives logged for this month yet."
        >
          {(rows) => (
            <div>
              {rows.slice(0, SHOWN).map((row) => {
                const chip = STATUS_CHIP[row.status]
                return (
                  <ListRow
                    key={row.id}
                    icon={rowIcon(row.status)}
                    variant={rowVariant(row.status)}
                    title={row.title}
                    subtitle={`${row.owner_keys.map(ownerName).join(' + ')} · ${row.progress_note}`}
                    right={<Chip variant={chip.variant}>{chip.label}</Chip>}
                  />
                )
              })}
            </div>
          )}
        </QueryPanel>
      </div>
      <CardFooter
        note={total != null ? `${Math.min(SHOWN, total)} of ${total} shown.` : 'The full list lives on the KPIs view.'}
        right={<Link href={buildDeepLink({ view: 'kpis' }, asParam)}>All deliverables</Link>}
      />
    </Card>
  )
}

'use client'

// p-agents-mini: four agent rows with status chips, any stalled agent first.
// Data: GET /api/agents. A stalled row shows its plain error sentence in
// place of the run times; restarts happen on the agents view.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Check, CircleAlert, Clock } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip, type ChipVariant } from '@/components/ui/Chip'
import { ListRow, type ListRowVariant } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { AgentRow, AgentsData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

const STATUS_CHIP: Record<AgentRow['status'], { variant: ChipVariant; label: string }> = {
  success: { variant: 'good', label: 'OK' },
  running: { variant: 'info', label: 'Running' },
  stalled: { variant: 'warn', label: 'Stalled' },
  error: { variant: 'warn', label: 'Error' },
}

function rowIcon(status: AgentRow['status']) {
  if (status === 'success') return Check
  if (status === 'running') return Clock
  return CircleAlert
}

function rowVariant(status: AgentRow['status']): ListRowVariant {
  if (status === 'success') return 'good'
  if (status === 'running') return 'info'
  return 'warn'
}

function rowSubtitle(agent: AgentRow): string {
  if (agent.status === 'stalled' && agent.error_plain) return agent.error_plain
  return `Ran ${agent.last_run_display} · next ${agent.next_run_display}`
}

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

export function AgentsMiniPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.agents(),
    queryFn: () => fetchEnvelope<AgentsData>('agents', '/agents'),
  })

  const agents = query.data?.data?.agents
  const stalledCount = agents ? agents.filter((a) => a.status === 'stalled').length : 0
  const healthChip = agents ? (
    stalledCount > 0 ? (
      <Chip variant="warn">{stalledCount} stalled</Chip>
    ) : (
      <Chip variant="good">All healthy</Chip>
    )
  ) : null

  return (
    <Card id="p-agents-mini" data-focus-id="p-agents-mini">
      <CardHeader
        title="Agents"
        subtitle="The helpers that compile briefs and checks."
        right={healthChip}
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(data) => data.agents.length === 0}
          emptyCopy="No agents are registered yet."
        >
          {(data) => {
            /* Stable sort: stalled rows first, everything else keeps the
               order the API served. */
            const ordered = [...data.agents].sort(
              (a, b) => Number(b.status === 'stalled') - Number(a.status === 'stalled'),
            )
            return (
              <div>
                {ordered.slice(0, 4).map((agent) => {
                  const chip = STATUS_CHIP[agent.status]
                  return (
                    <ListRow
                      key={agent.key}
                      icon={rowIcon(agent.status)}
                      variant={rowVariant(agent.status)}
                      title={agent.label}
                      subtitle={rowSubtitle(agent)}
                      right={<Chip variant={chip.variant}>{chip.label}</Chip>}
                    />
                  )
                })}
              </div>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note="Restart from the agents view."
        right={<Link href={buildDeepLink({ view: 'agents' }, asParam)}>System health</Link>}
      />
    </Card>
  )
}

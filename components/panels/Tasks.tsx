'use client'

// p-tasks: the read-only sprint slice from Zoho Projects. Data: GET
// /api/tasks. Reads only; the footer states the assistant gate. Status
// severity is carried by the chip words, never by color escalation.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip, type ChipVariant } from '@/components/ui/Chip'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { TasksData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

type TaskRow = TasksData['rows'][number]

/* The API serves status as display text; map the known words to chip
   variants and let anything new land as neutral info. */
function statusVariant(status: string): ChipVariant {
  const s = status.toLowerCase()
  if (s.includes('block')) return 'warn'
  if (s.includes('done')) return 'good'
  if (s.includes('queue')) return 'mut'
  return 'info'
}

const COLUMNS: DataTableColumn<TaskRow>[] = [
  {
    key: 'title',
    label: 'Task',
    render: (row) => <b className="font-semibold text-title">{row.title}</b>,
  },
  { key: 'owner', label: 'Owner' },
  {
    key: 'due_display',
    label: 'Due',
    render: (row) => <span className="num">{row.due_display}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    numeric: true,
    render: (row) => <Chip variant={statusVariant(row.status)}>{row.status}</Chip>,
  },
]

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-2">
    <Skeleton height={16} />
    <Skeleton height={16} />
    <Skeleton height={16} />
    <Skeleton height={16} />
    <Skeleton height={16} />
  </div>
)

export function TasksPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.tasks(),
    queryFn: () => fetchEnvelope<TasksData>('tasks', '/tasks'),
  })

  return (
    <Card id="p-tasks" data-focus-id="p-tasks">
      <CardHeader
        title="IT & product tasks"
        subtitle="From the sprint board. Read here, change through the assistant."
      />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(data) => data.rows.length === 0}
          emptyCopy="The sprint board is clear."
        >
          {(data) => (
            <DataTable
              columns={COLUMNS}
              rows={data.rows}
              rowKey={(row) => `${row.title}-${row.due_display}`}
            />
          )}
        </QueryPanel>
      </div>
      <CardFooter
        note="Changes go through the assistant."
        right={<Link href={buildDeepLink({ view: 'agents' }, asParam)}>Agents & health</Link>}
      />
    </Card>
  )
}

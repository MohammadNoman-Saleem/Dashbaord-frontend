'use client'

// p-fin-mini: the money snapshot in three rows: what is in, what is owed to
// us, and what we owe. Data: GET /api/financials. Platform revenue and
// partnership invoices are never summed; the footer repeats the rule.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Clock, Split, Wallet } from 'lucide-react'

import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ListRow } from '@/components/ui/ListRow'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { FinancialsData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'
import { fmtBHD } from '@/lib/format/bhd'

function monthName(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'this month'
  return d.toLocaleDateString('en-US', { month: 'long' })
}

const SKELETON = (
  <div className="flex flex-col gap-2 py-1">
    <Skeleton height={38} />
    <Skeleton height={38} />
    <Skeleton height={38} />
  </div>
)

export function FinMiniPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.financials(),
    queryFn: () => fetchEnvelope<FinancialsData>('financials', '/financials'),
  })

  return (
    <Card id="p-fin-mini" data-focus-id="p-fin-mini">
      <CardHeader title="Money snapshot" subtitle="What is in, what is owed, what we owe." />
      <div className="px-[18px] pb-4 pt-2">
        <QueryPanel query={query} skeleton={SKELETON}>
          {(data, meta) => {
            const month = monthName(meta.updated_at)
            const awaiting = data.invoices.find((inv) => inv.status === 'awaiting')
            return (
              <div>
                <ListRow
                  icon={Wallet}
                  variant="good"
                  title={`${fmtBHD(data.platform_revenue.month_bhd)} platform revenue, ${month}`}
                  subtitle={
                    data.platform_revenue.verified
                      ? 'Verified against the admin panel.'
                      : 'Measured from the platform gateway.'
                  }
                  right={<Chip variant="good">In</Chip>}
                />
                <ListRow
                  icon={Clock}
                  variant={data.outstanding_bhd > 0 ? 'warn' : 'good'}
                  title={`${fmtBHD(data.outstanding_bhd)} outstanding`}
                  subtitle={
                    awaiting
                      ? `${awaiting.customer.split(' · ')[0]} invoice, due ${awaiting.due_display}.`
                      : 'No partnership invoices waiting.'
                  }
                  right={
                    <Chip variant={data.outstanding_bhd > 0 ? 'warn' : 'good'}>Owed to us</Chip>
                  }
                />
                <ListRow
                  icon={Split}
                  variant="info"
                  title={`${fmtBHD(data.payouts_due_bhd)} provider payouts this cycle`}
                  subtitle={`Computed from ${month} bookings.`}
                  right={<Chip variant="info">We owe</Chip>}
                />
              </div>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note="Books carries partnership invoices only."
        right={<Link href={buildDeepLink({ view: 'financials' }, asParam)}>Open financials</Link>}
      />
    </Card>
  )
}

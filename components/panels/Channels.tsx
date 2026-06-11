'use client'

// p-channels: leads by channel as MiniBars with the cost-per-lead read in
// the footer. Data: GET /api/marketing. Bars scale to the busiest channel;
// the channel label drops any campaign detail after the middle dot so the
// compact 108px label column stays readable.

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { MiniBars, type MiniBarRow } from '@/components/charts/MiniBars'
import { Card, CardFooter, CardHeader } from '@/components/ui/Card'
import { QueryPanel } from '@/components/ui/QueryPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import type { MarketingData } from '@/lib/api/contract'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'
import { buildDeepLink } from '@/lib/deepLink'

function monthName(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return 'this month'
  return d.toLocaleDateString('en-US', { month: 'long' })
}

/* "Cost per lead BHD 7.2, under the 8.0 cap." Severity in words. */
function cplLine(cpl: MarketingData['tiles']['cpl']): string {
  const state = cpl.value_bhd <= cpl.cap_bhd ? 'under' : 'over'
  return `Cost per lead BHD ${cpl.value_bhd.toFixed(1)}, ${state} the ${cpl.cap_bhd.toFixed(1)} cap.`
}

const SKELETON = (
  <div className="flex flex-col gap-[10px] py-1">
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
    <Skeleton height={12} />
  </div>
)

export function ChannelsPanel(_props: { person: string }) {
  const asParam = useSearchParams().get('as') ?? undefined
  const query = useQuery({
    queryKey: qk.marketing(),
    queryFn: () => fetchEnvelope<MarketingData>('marketing', '/marketing'),
  })

  const envelope = query.data
  const leadsTotal = envelope?.data?.tiles.leads.value
  const cpl = envelope?.data?.tiles.cpl

  return (
    <Card id="p-channels" data-focus-id="p-channels">
      <CardHeader
        title={`Leads by channel, ${monthName(envelope?.meta.updated_at)}`}
        subtitle={
          leadsTotal != null
            ? `${leadsTotal} logged in the CRM. Clicks are not leads.`
            : 'Logged in the CRM. Clicks are not leads.'
        }
      />
      <div className="px-[18px] pb-4 pt-[13px]">
        <QueryPanel
          query={query}
          skeleton={SKELETON}
          isEmpty={(data) => data.channels.length === 0}
          emptyCopy="No channel leads logged yet this month."
        >
          {(data) => {
            const max = Math.max(...data.channels.map((c) => c.leads), 1)
            const rows: MiniBarRow[] = data.channels.map((c) => ({
              label: c.channel.split(' · ')[0],
              value: c.leads,
              pct: (c.leads / max) * 100,
            }))
            return (
              <>
                <MiniBars rows={rows} />
                <p className="sr-only">
                  {data.channels.map((c) => `${c.channel}: ${c.leads} leads`).join('. ')}
                </p>
              </>
            )
          }}
        </QueryPanel>
      </div>
      <CardFooter
        note={cpl ? cplLine(cpl) : 'Cost per lead updates with the CRM.'}
        right={<Link href={buildDeepLink({ view: 'marketing' }, asParam)}>Marketing view</Link>}
      />
    </Card>
  )
}

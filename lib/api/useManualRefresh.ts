'use client'

// Manual refresh per spec 02 section 8.3: a user-triggered Refresh refetches
// the same endpoint with refresh=1 (the server bypasses its cache TTL once
// per user per ten minutes). The flag rides a ref, not the query key, so the
// refreshed response overwrites the same cache entry the panel reads.
// Consumers inspect the returned envelope: meta.cached true means the server
// kept its saved numbers (rate limited upstream) and the page shows the
// friendly toast from the copy library.

import { useCallback, useRef, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import type { EndpointKey } from '@/config/endpoints'
import type { Envelope } from './envelope'
import { fetchEnvelope } from './fetcher'

type Params = Record<string, string | number | undefined>

export interface RefreshableEnvelope<T> {
  query: UseQueryResult<Envelope<T>>
  /** Refetch with refresh=1. Resolves to the fresh envelope (or undefined
   *  on a failed refetch; the query keeps its error state). */
  refresh: () => Promise<Envelope<T> | undefined>
  refreshing: boolean
}

export function useRefreshableEnvelope<T>(options: {
  queryKey: readonly unknown[]
  endpoint: EndpointKey
  path: string
  params?: Params
  staleTime?: number
  /** Gate the fetch (TanStack enabled). For secondary queries that only
   *  apply to one tab of a page; defaults to true. */
  enabled?: boolean
}): RefreshableEnvelope<T> {
  const { queryKey, endpoint, path, params, staleTime, enabled } = options
  const freshRef = useRef(false)

  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchEnvelope<T>(endpoint, path, {
        ...params,
        ...(freshRef.current ? { refresh: 1 } : {}),
      }),
    staleTime: staleTime ?? 5 * 60_000,
    enabled: enabled ?? true,
  })

  const [refreshing, setRefreshing] = useState(false)
  const { refetch } = query

  const refresh = useCallback(async () => {
    freshRef.current = true
    setRefreshing(true)
    try {
      const result = await refetch()
      return result.data
    } finally {
      freshRef.current = false
      setRefreshing(false)
    }
  }, [refetch])

  return { query, refresh, refreshing }
}

'use client'

// Viewer context: who is signed in and whose dashboard is being viewed.
// /api/me is fetched once per session (staleTime Infinity per the policy in
// lib/api/keys.ts; the cache is invalidated on login or person switch). The
// view-as override lives in the URL (?as=<person>) so it survives reloads
// and is shareable; it only takes effect when the server-resolved
// capabilities allow it (admins and co-founders: Khalid and Razan).
//
// The Viewer shape mirrors the pragmatic /api/me payload documented in
// lib/fixtures/me.ts (03 section 3 describes it loosely). It is defined
// here, not imported, because panels never import fixture modules.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'

export interface ViewerPerson {
  key: string
  name: string
  role_label: string
}

export interface ViewerCapabilities {
  can_view_as: boolean
  sees_patient_names: boolean
  kpi_edit_scope: 'all' | 'team' | 'none'
  can_edit_payout_rules: boolean
}

export interface Viewer {
  person: string
  name: string
  role: 'admin' | 'dept_head' | 'member'
  role_label: string
  department: string
  must_reset: boolean
  theme: 'light' | 'dark'
  viewed_person: string
  capabilities: ViewerCapabilities
  /** The view-as people list. Present only when can_view_as. */
  people?: ViewerPerson[]
}

export interface ViewerState {
  /** The signed-in person, or null while /api/me loads or after a failure. */
  me: Viewer | null
  /**
   * The person whose dashboard should render: the ?as= override when the
   * viewer can view as others, otherwise the signed-in person. Null while
   * loading; gate person-scoped queries on it.
   */
  effectivePerson: string | null
  isLoading: boolean
}

const ViewerContext = createContext<ViewerState | null>(null)

/**
 * Mount once in the app shell, inside Providers (needs the QueryClient) and
 * under a Suspense boundary (useSearchParams suspends during prerender).
 */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: qk.me(),
    queryFn: () => fetchEnvelope<Viewer>('me', '/me'),
    staleTime: Infinity,
  })
  const searchParams = useSearchParams()
  const asParam = searchParams.get('as')

  const me = query.data?.data ?? null
  const isLoading = query.isPending

  const value = useMemo<ViewerState>(() => {
    const effectivePerson = me
      ? me.capabilities.can_view_as && asParam
        ? asParam
        : me.person
      : null
    return { me, effectivePerson, isLoading }
  }, [me, asParam, isLoading])

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}

export function useViewer(): ViewerState {
  const ctx = useContext(ViewerContext)
  if (!ctx) {
    throw new Error('useViewer must be used inside ViewerProvider')
  }
  return ctx
}

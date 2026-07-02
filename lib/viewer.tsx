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

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ApiError, fetchEnvelope } from '@/lib/api/fetcher'
import { qk } from '@/lib/api/keys'

// Hydration flag via the same useSyncExternalStore idiom as lib/theme.ts:
// false on the server and on the first client render, true afterward. The
// signed-in viewer resolves client-side, and the per-session query cache can be
// warm on the first client render while the server prerendered with no viewer.
// Holding me back until hydrated keeps the first client render equal to the
// server for every useViewer consumer, so viewer-dependent UI (the sidebar nav,
// the person menu avatar) never triggers a hydration mismatch.
const subscribeHydrated = () => () => {}
const getHydratedSnapshot = () => true
const getHydratedServerSnapshot = () => false

export interface ViewerPerson {
  key: string
  name: string
  role_label: string
}

export interface ViewerCapabilities {
  can_view_as: boolean
  sees_patient_names: boolean
  kpi_edit_scope: 'any' | 'team' | 'none'
  can_edit_payout_rules: boolean
}

export interface Viewer {
  person: string
  name: string
  role: 'admin' | 'dept_head' | 'member'
  role_label: string
  department: string | null
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
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  })
  const searchParams = useSearchParams()
  const asParam = searchParams.get('as')
  const router = useRouter()
  const pathname = usePathname()

  // No session: send the visitor to sign in. Live mode only ever hits this
  // path; the fixture never 401s.
  const unauthenticated =
    query.error instanceof ApiError && query.error.status === 401
  useEffect(() => {
    if (unauthenticated && pathname !== '/login') {
      router.replace('/login')
    }
  }, [unauthenticated, pathname, router])

  // Until hydrated, report the same not-ready state the server rendered with
  // (no viewer, still loading), regardless of a warm client-side cache. After
  // hydration the real query values flow through and consumers re-render.
  const hydrated = useSyncExternalStore(
    subscribeHydrated,
    getHydratedSnapshot,
    getHydratedServerSnapshot,
  )
  const me = hydrated ? (query.data?.data ?? null) : null
  const isLoading = !hydrated || query.isPending

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

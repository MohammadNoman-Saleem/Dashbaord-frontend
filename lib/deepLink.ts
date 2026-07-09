'use client'

// Deep links per spec 02 section 5.2: route plus ?tab= plus &focus=, with the
// view-as override (&as=) carried along so an admin browsing as someone else
// stays in that person's seat across navigations. The heartbeat blips and the
// attention list both navigate through buildDeepLink; the landing page calls
// useFocusFlash to scroll to and flash the focused element.

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { DeepLink } from '@/lib/api/contract'

/**
 * Maps a DeepLink from the API contract to an href. View 'home' maps to '/',
 * every other view to '/<view>'. Appends ?tab= and &focus= when present and
 * preserves the current &as= override (pass it from useSearchParams).
 *
 * The 'social' view stays in the contract for back-compatible deep links,
 * but the standalone /social route was folded into the Marketing view's
 * Social tab, so a social link resolves to /marketing?tab=social. A tab on
 * a social link is ignored: the Social tab has no sub-tabs of its own.
 */
export function buildDeepLink(link: DeepLink, currentAs?: string): string {
  if (link.view === 'social') {
    const search = new URLSearchParams()
    search.set('tab', 'social')
    if (link.focus) search.set('focus', link.focus)
    if (currentAs) search.set('as', currentAs)
    return `/marketing?${search.toString()}`
  }
  const path = link.view === 'home' ? '/' : `/${link.view}`
  const search = new URLSearchParams()
  if (link.tab) search.set('tab', link.tab)
  if (link.focus) search.set('focus', link.focus)
  if (currentAs) search.set('as', currentAs)
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Href that opens a case in the cockpit by its own record id. Sets ?case= to
 * the case id, focus=cockpit-case so useFocusFlash scrolls to the case panel
 * (data-focus-id="cockpit-case"), and carries the view-as override when given.
 */
export function cockpitCaseHref(caseId: string, currentAs?: string): string {
  const search = new URLSearchParams()
  search.set('case', caseId)
  search.set('focus', 'cockpit-case')
  if (currentAs) search.set('as', currentAs)
  return `/cockpit?${search.toString()}`
}

/* Flash duration matches the .flash animation in app/globals.css (1.6s). */
const FLASH_MS = 1600
/* Panels load async (fixture delay today, network later), so the target
   element may not exist on the first frame. Retry on rAF for up to 3s. */
const RETRY_WINDOW_MS = 3000

/**
 * Scroll a [data-focus-id="<focusId>"] element into view (block center, smooth
 * unless reduced motion) and play the global 'flash' highlight. Retries on rAF
 * until the element mounts (async panels / a just-switched tab), up to 3s.
 * Returns a cleanup that cancels the retry and clears the flash. Used by the
 * cockpit page so selecting a lead visibly opens and flashes the case card, the
 * same "the thing you asked for is here" signal deep links use.
 */
export function flashFocus(focusId: string): () => void {
  let rafId = 0
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let flashed: HTMLElement | null = null
  const startedAt = performance.now()

  const attempt = () => {
    const el = document.querySelector<HTMLElement>(
      `[data-focus-id="${CSS.escape(focusId)}"]`,
    )
    if (el) {
      flashed = el
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Land at the TOP of the target (with its scroll-margin), not its center;
      // a tall case card centered would scroll to the middle of the ticket.
      el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
      el.classList.remove('flash')
      // Force a reflow so re-adding the class restarts the animation on a repeat tap.
      void el.offsetWidth
      el.classList.add('flash')
      flashTimer = setTimeout(() => el.classList.remove('flash'), FLASH_MS)
      return
    }
    if (performance.now() - startedAt < RETRY_WINDOW_MS) {
      rafId = requestAnimationFrame(attempt)
    }
  }
  rafId = requestAnimationFrame(attempt)

  return () => {
    cancelAnimationFrame(rafId)
    if (flashTimer !== undefined) clearTimeout(flashTimer)
    flashed?.classList.remove('flash')
  }
}

/**
 * Reads the ?focus= search param and, once per value, scrolls the matching
 * [data-focus-id="<focus>"] element into view (block center, smooth unless
 * prefers-reduced-motion) and plays the global 'flash' highlight for 1.6s.
 *
 * The param intentionally stays in the URL so a pasted link works from a
 * cold load (spec 02 section 12 item 3). A consumed ref keyed by the focus
 * value prevents replay on re-render; the ref is only marked once the
 * element was actually found and flashed, so async panels (and the dev
 * StrictMode double effect) still get their flash.
 *
 * Mount it once per routed view, anywhere under the page's Suspense
 * boundary (useSearchParams suspends during prerender).
 */
export function useFocusFlash(): void {
  const searchParams = useSearchParams()
  const focus = searchParams.get('focus')
  const consumedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!focus || consumedRef.current === focus) return

    let rafId = 0
    let flashTimer: ReturnType<typeof setTimeout> | undefined
    let flashed: HTMLElement | null = null
    const startedAt = performance.now()

    const attempt = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-focus-id="${CSS.escape(focus)}"]`,
      )
      if (el) {
        consumedRef.current = focus
        flashed = el
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
        el.classList.add('flash')
        flashTimer = setTimeout(() => el.classList.remove('flash'), FLASH_MS)
        return
      }
      if (performance.now() - startedAt < RETRY_WINDOW_MS) {
        rafId = requestAnimationFrame(attempt)
      }
    }

    rafId = requestAnimationFrame(attempt)

    return () => {
      cancelAnimationFrame(rafId)
      if (flashTimer !== undefined) clearTimeout(flashTimer)
      flashed?.classList.remove('flash')
    }
  }, [focus])
}

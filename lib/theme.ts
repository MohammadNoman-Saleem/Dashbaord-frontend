// Theme persistence and no-flash bootstrap.
// Pattern carried over from the previous dashboard: read the stored theme
// before first paint so the page never flashes the wrong theme.

'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sl_theme'

// Inlined into <head> by app/layout.tsx. Runs before paint. Must stay
// self-contained ES5-ish so it never needs transpilation.
export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

// The document's data-theme attribute is the source of truth (set before
// paint by the bootstrap script). Treat it as an external store so React
// reads it without setState-in-effect and stays in sync across hook users.
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

function getServerTheme(): Theme {
  return 'light'
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme)

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // private mode: theme still applies for this page view
    }
  }, [])

  return { theme, setTheme }
}

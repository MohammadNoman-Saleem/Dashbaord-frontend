// Theme persistence and no-flash bootstrap.
// Pattern carried over from the previous dashboard: read the stored theme
// before first paint so the page never flashes the wrong theme.

'use client'

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sl_theme'

// Inlined into <head> by app/layout.tsx. Runs before paint. Must stay
// self-contained ES5-ish so it never needs transpilation.
export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    setThemeState(getTheme())
  }, [])

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // private mode: theme still applies for this page view
    }
    setThemeState(t)
  }, [])

  return { theme, setTheme }
}

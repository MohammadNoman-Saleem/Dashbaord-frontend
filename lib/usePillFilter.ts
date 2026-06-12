'use client'

// The one filter helper behind the V3 pill groups (06 shared additions,
// groups A and C; group B swaps whole scope blocks instead). The mockup's
// wirePills toggles row display by data attribute; in React the same idea is
// a piece of state plus a filter over already-fetched rows. It never
// refetches.

import { useState } from 'react'

export interface PillFilter<K extends string, T> {
  value: K | 'all'
  setValue: (next: K | 'all') => void
  /** Rows matching the active pill; all rows when the pill is All. */
  filter: (rows: T[]) => T[]
}

export function usePillFilter<K extends string, T>(
  keyOf: (row: T) => K,
): PillFilter<K, T> {
  const [value, setValue] = useState<K | 'all'>('all')
  return {
    value,
    setValue,
    filter: (rows) => (value === 'all' ? rows : rows.filter((row) => keyOf(row) === value)),
  }
}

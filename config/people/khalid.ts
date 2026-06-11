// Khalid (CEO) per 02_Frontend_Spec section 8.1: the business at a glance.
import type { PersonHomeConfig } from './types'

export const khalid: PersonHomeConfig = {
  key: 'khalid',
  name: 'Khalid',
  greeting: 'Good morning, Khalid',
  // "Wednesday-style date" per the spec: weekday, month, day, then the line.
  subtitle: ({ date }) =>
    `${date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })}. The business at a glance.`,
  panels: [
    'p-team-kpis',
    'p-revenue',
    'p-brief',
    'p-urgent-mini',
    'p-deliverables-mini',
    'p-late',
  ],
}

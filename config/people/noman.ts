// Noman (Product analyst) per 02_Frontend_Spec section 8.1: data health first.
import type { PersonHomeConfig } from './types'

export const noman: PersonHomeConfig = {
  key: 'noman',
  name: 'Noman',
  greeting: 'Good morning, Noman',
  subtitle: () => 'Data health first, then the funnels.',
  panels: ['p-funnel-mini', 'p-agents-mini', 'p-tasks', 'p-my-tasks'],
}

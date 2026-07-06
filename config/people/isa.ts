// Isa (Finance analyst) per 02_Frontend_Spec section 8.1: money in and owed.
import type { PersonHomeConfig } from './types'

export const isa: PersonHomeConfig = {
  key: 'isa',
  name: 'Isa',
  greeting: 'Good morning, Isa',
  subtitle: () => 'Money in, money owed, and what to chase.',
  panels: ['p-fin-mini', 'p-revenue', 'p-deliverables-mini', 'p-my-tasks'],
}

// Al Saeed (Fractional CTO) per 02_Frontend_Spec section 8.1: platform state.
// The mockup greets him by first name, Mohammed; the copy stays verbatim.
import type { PersonHomeConfig } from './types'

export const alsaeed: PersonHomeConfig = {
  key: 'alsaeed',
  name: 'Al Saeed',
  greeting: 'Good morning, Mohammed',
  subtitle: () => 'Platform and agents, current state.',
  panels: ['p-agents-mini', 'p-tasks', 'p-handoffs'],
}

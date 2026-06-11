// Afaf (Marketing lead) per 02_Frontend_Spec section 8.1: channels and decisions.
import type { PersonHomeConfig } from './types'

export const afaf: PersonHomeConfig = {
  key: 'afaf',
  name: 'Afaf',
  greeting: 'Good morning, Afaf',
  subtitle: () => 'Your channels this week, and what needs a decision.',
  panels: ['p-channels', 'p-deliverables-mini', 'p-late'],
}

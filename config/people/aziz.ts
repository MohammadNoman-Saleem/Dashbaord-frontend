// Aziz (Operations officer) per 02_Frontend_Spec section 8.1: handoffs and SLAs.
import type { PersonHomeConfig } from './types'

export const aziz: PersonHomeConfig = {
  key: 'aziz',
  name: 'Aziz',
  greeting: 'Good morning, Aziz',
  subtitle: () => 'Handoffs, SLAs, and what is slipping.',
  panels: ['p-blockers', 'p-handoffs', 'p-urgent-mini', 'p-brief', 'p-my-tasks'],
}

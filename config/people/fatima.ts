// Fatima (Case manager) per 02_Frontend_Spec section 8.1: her morning, sorted.
import type { PersonHomeConfig } from './types'

export const fatima: PersonHomeConfig = {
  key: 'fatima',
  name: 'Fatima',
  greeting: 'Good morning, Fatima',
  // TODO: the spec writes this as "{n} people are waiting to hear from you"
  // but no endpoint serves that count yet (open backend question; 03 defines
  // no source for it). Static mockup copy until the backend answers it.
  subtitle: () => 'Your morning, sorted. 5 people are waiting to hear from you.',
  panels: ['p-priorities', 'p-mtl', 'p-appointments', 'p-late', 'p-my-tasks'],
}

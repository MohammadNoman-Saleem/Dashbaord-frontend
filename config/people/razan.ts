// Dr. Razan (CMO) per 02_Frontend_Spec section 8.1: the clinic view.
import type { PersonHomeConfig } from './types'

export const razan: PersonHomeConfig = {
  key: 'razan',
  name: 'Dr. Razan',
  greeting: 'Good morning, Razan',
  subtitle: () => "Today's clinic view: consults, providers, and follow-ups.",
  panels: ['p-providers', 'p-mtl', 'p-appointments', 'p-late'],
}

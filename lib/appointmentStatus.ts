import type { ChipVariant } from '@/components/ui/Chip'

// Zoho booking Status to Chip variant, shared by the appointments page table and
// the home "Today's consultations" panel so the two never drift. Done reads as
// good; the in-flight stages (Confirmed, Session Started, Awaiting Review) read
// as neutral information; every other status (Pending Payment, Pending, and
// anything else) stays muted. There is no red, by design.
export function appointmentStatusVariant(status: string): ChipVariant {
  if (status === 'Done') return 'good'
  if (
    status === 'Confirmed' ||
    status === 'Session Started' ||
    status === 'Awaiting Review'
  ) {
    return 'info'
  }
  return 'mut'
}

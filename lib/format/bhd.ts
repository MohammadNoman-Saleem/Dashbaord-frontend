// BHD display per the copy rules (spec 02 section 10): "BHD 4,180".
// Whole dinars only; severity and direction are carried by words, never by
// a minus sign or color.

/** "BHD 4,180". Rounds to whole dinars, en-US thousands separators. */
export function fmtBHD(n: number): string {
  return `BHD ${Math.round(n).toLocaleString('en-US')}`
}

/**
 * Signed BHD display that never renders a minus sign. Follows the
 * covers_bhd semantics on PayoutBookingRow: a negative amount means Saleem
 * covers the cost (free-to-patient rows) and reads "Covers BHD 8"; zero or
 * positive reads as a plain share, "BHD 4,180".
 *
 * covers_bhd is served as a positive number, so pass it negated:
 *   row.covers_bhd != null ? fmtBHDDelta(-row.covers_bhd) : fmtBHD(row.saleem_share_bhd ?? 0)
 */
export function fmtBHDDelta(n: number): string {
  if (n < 0) return `Covers ${fmtBHD(-n)}`
  return fmtBHD(n)
}

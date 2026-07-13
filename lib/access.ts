// Single source of truth for the Financials view gate. Financials (both tabs,
// and every financials and commission/payouts API behind them, plus the revenue
// home panels) is restricted to the admin role, the CEO (person key 'khalid'),
// and the finance analyst (person key 'isa'). Pure and framework-free so the
// server routes (viewer.role / viewer.key) and the client (me.role / me.person)
// share ONE rule; import this rather than re-spelling the check so the two sides
// can never drift. To change who sees Financials, edit this list only.
const FINANCIALS_PEOPLE = new Set(['khalid', 'isa']);

export function canSeeFinancials(role: string, personKey: string): boolean {
  return role === 'admin' || FINANCIALS_PEOPLE.has(personKey);
}

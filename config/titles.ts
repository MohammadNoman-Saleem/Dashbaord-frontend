// Page titles and subtitles for the topbar, lifted from the TITLES map in
// the mockup (Saleem_Dashboard_Redesign.html). Keys are the DeepLink view
// keys; 'home' is the '/' route, every other key is its '/<view>' route.
//
// The mockup hardcodes its demo day ("Wednesday, June 10") and month
// ("June targets"); those two subtitles are getters that read the current
// date so the copy stays true after the demo week. Getters evaluate at
// render time, so a tab left open across midnight corrects itself on the
// next render.

import type { DeepLink } from '@/lib/api/contract'

export type ViewKey = DeepLink['view']

export interface ViewTitle {
  title: string
  sub: string
}

export const TITLES: Record<ViewKey, ViewTitle> = {
  home: {
    title: 'Command Center',
    get sub() {
      const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
      return `${today} · one calm place for the whole team`
    },
  },
  cases: {
    title: 'Cases & Pipeline',
    sub: "Patients, deals, and today's appointments in one place",
  },
  board: {
    title: 'Team board',
    sub: 'Department tasks and IT tickets, straight from Zoho Projects',
  },
  funnels: {
    title: 'Funnels & Behaviour',
    sub: 'How the site and booking flows are performing · refreshes hourly',
  },
  marketing: {
    title: 'Marketing',
    sub: 'Leads, spend, and channel performance',
  },
  financials: {
    title: 'Financials',
    sub: 'Money in, money owed, and where each number comes from',
  },
  kpis: {
    title: 'KPIs & Deliverables',
    get sub() {
      const month = new Date().toLocaleDateString('en-US', { month: 'long' })
      return `${month} targets and end-of-month commitments`
    },
  },
  agents: {
    title: 'Agents & System Health',
    sub: 'The machinery behind this dashboard, and whether it is healthy',
  },
  payouts: {
    title: 'Commission & Payouts',
    sub: 'Every booking split into patient paid, provider payout, and Saleem revenue',
  },
}

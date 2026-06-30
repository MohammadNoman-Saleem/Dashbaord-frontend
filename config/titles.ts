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
  cockpit: {
    title: 'Cockpit',
    sub: 'Every active lead with its next step and the clock that governs it',
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
  // The Marketing view carries two tabs (?tab=marketing|social). This entry
  // titles the Marketing tab; the 'social' entry below titles the Social tab.
  marketing: {
    title: 'Marketing',
    sub: 'Leads, lead quality, spend, and channel performance',
  },
  financials: {
    title: 'Financials',
    sub: 'Money in, money owed, commission, and where each number comes from',
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
  // 'social' is no longer a standalone route: it is the Social tab inside
  // the Marketing view (/marketing?tab=social), and 'payouts' is the
  // Commission tab inside Financials (/financials?tab=commission). Both keys
  // stay in the DeepLink union so back-compatible deep links resolve.
  social: {
    title: 'Social',
    sub: 'Website traffic and the social accounts, side by side',
  },
  appointments: {
    title: 'Appointments',
    sub: 'Booking volume, stage breakdown, doctor activity, and revenue from Zoho bookings',
  },
}

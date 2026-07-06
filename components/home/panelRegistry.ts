// Home panel registry: every panel the engine can place, keyed by PanelId.
// Panel components live in components/panels (built in parallel); each takes
// { person } and renders its own Card. Direct imports on purpose: the home
// route is one chunk either way per person, and direct imports keep the
// prop contract checked at build time.
//
// Spans verified against the mockup home grid (#homeGrid in
// Saleem_Dashboard_Redesign.html): p-priorities is the only c12 section,
// every other panel is c6. The KPI strip above the panels uses c3 cards and
// is not part of this registry.
import type { ComponentType } from 'react'

import type { PanelId } from '@/config/people/types'

import { AgentsMiniPanel } from '@/components/panels/AgentsMini'
import { AppointmentsPanel } from '@/components/panels/Appointments'
import { BlockersMiniPanel } from '@/components/panels/BlockersMini'
import { BriefPanel } from '@/components/panels/Brief'
import { ChannelsPanel } from '@/components/panels/Channels'
import { DeliverablesMiniPanel } from '@/components/panels/DeliverablesMini'
import { FinMiniPanel } from '@/components/panels/FinMini'
import { FunnelMiniPanel } from '@/components/panels/FunnelMini'
import { HandoffsPanel } from '@/components/panels/Handoffs'
import { LatePanel } from '@/components/panels/Late'
import { MtlMiniPanel } from '@/components/panels/MtlMini'
import { MyTasksPanel } from '@/components/panels/MyTasks'
import { PrioritiesPanel } from '@/components/panels/Priorities'
import { ProvidersPanel } from '@/components/panels/Providers'
import { RevenuePanel } from '@/components/panels/Revenue'
import { TasksPanel } from '@/components/panels/Tasks'
import { TeamKpisPanel } from '@/components/panels/TeamKpis'
import { UrgentMiniPanel } from '@/components/panels/UrgentMini'

export type PanelSpan = 'c6' | 'c12'

export interface PanelRegistration {
  Component: ComponentType<{ person: string }>
  span: PanelSpan
}

export const PANEL_REGISTRY: Record<PanelId, PanelRegistration> = {
  'p-priorities': { Component: PrioritiesPanel, span: 'c12' },
  'p-appointments': { Component: AppointmentsPanel, span: 'c6' },
  'p-late': { Component: LatePanel, span: 'c6' },
  'p-team-kpis': { Component: TeamKpisPanel, span: 'c6' },
  'p-revenue': { Component: RevenuePanel, span: 'c6' },
  'p-brief': { Component: BriefPanel, span: 'c6' },
  'p-urgent-mini': { Component: UrgentMiniPanel, span: 'c6' },
  'p-channels': { Component: ChannelsPanel, span: 'c6' },
  'p-deliverables-mini': { Component: DeliverablesMiniPanel, span: 'c6' },
  'p-funnel-mini': { Component: FunnelMiniPanel, span: 'c6' },
  'p-agents-mini': { Component: AgentsMiniPanel, span: 'c6' },
  'p-tasks': { Component: TasksPanel, span: 'c6' },
  'p-my-tasks': { Component: MyTasksPanel, span: 'c6' },
  'p-providers': { Component: ProvidersPanel, span: 'c6' },
  'p-handoffs': { Component: HandoffsPanel, span: 'c6' },
  'p-fin-mini': { Component: FinMiniPanel, span: 'c6' },
  'p-mtl': { Component: MtlMiniPanel, span: 'c6' },
  'p-blockers': { Component: BlockersMiniPanel, span: 'c6' },
}

// Person home configuration types for the Command Center engine
// (02_Frontend_Spec section 8.1). One layout engine plus per-person config:
// the config controls greeting, subtitle, and the ordered panel list. The
// KPI strip and attention list are not configured here; the backend resolves
// them per person via /api/kpi/strip and /api/attention.

export type PersonKey =
  | 'khalid'
  | 'fatima'
  | 'afaf'
  | 'razan'
  | 'aziz'
  | 'noman'
  | 'alsaeed'
  | 'isa'

// Ids match the mockup's #homeGrid section ids one to one, and double as the
// data-focus-id each panel wrapper carries for ?focus= deep links.
export type PanelId =
  | 'p-priorities'
  | 'p-appointments'
  | 'p-late'
  | 'p-team-kpis'
  | 'p-revenue'
  | 'p-brief'
  | 'p-urgent-mini'
  | 'p-channels'
  | 'p-deliverables-mini'
  | 'p-funnel-mini'
  | 'p-agents-mini'
  | 'p-tasks'
  | 'p-providers'
  | 'p-handoffs'
  | 'p-fin-mini'

export interface PersonHomeConfig {
  key: PersonKey
  name: string
  /** Static greeting line, copy from the approved mockup. */
  greeting: string
  /**
   * Muted line under the greeting. A function so date-bearing subtitles
   * (Khalid's "Wednesday, June 10. ...") stay true after the demo week;
   * date-free subtitles ignore the context.
   */
  subtitle: (ctx: { date: Date }) => string
  /** Ordered panel list, rendered through the panel registry. */
  panels: PanelId[]
}

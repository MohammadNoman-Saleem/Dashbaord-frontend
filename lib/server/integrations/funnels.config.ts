// Mixpanel event and saved-funnel registry, ported VERBATIM from the NestJS
// backend src/integrations/mixpanel/funnels.config.ts (itself ported from the
// legacy config/mixpanel.js and lib/mixpanel/novo-funnels.js). Only the
// constants the funnels endpoints need are carried over. No DI, no decorators;
// this is a plain constants module imported by the funnels service.
//
// CRITICAL RULE (from the legacy May 2026 audit): funnel numbers come ONLY
// from the saved-funnel endpoint /api/2.0/funnels?funnel_id=..., which
// enforces step ordering server-side. Never count events ourselves and
// treat them as funnel steps; unique event counts do not enforce ordering
// and once produced "Step 3: 259% conversion".
//
// SERVER ONLY by convention (consumed by the Node-runtime funnels service).

/** The canonical 6-step /consult booking funnel (restructured 13 May 2026). */
export const FUNNEL_ID = '88573229';

/** Verified step event names behind FUNNEL_ID, kept for reference and as a
 *  label fallback. Step 3's event was renamed in the Mixpanel Lexicon to
 *  display as "Consult Booking Form Viewed"; the event name is unchanged. */
export const BOOKING_FUNNEL_VERIFIED = [
  'Consult Page Viewed',
  'Consult Start CTA Clicked',
  'Consult Auth Step Viewed',
  'Consult Summary Step Viewed',
  'Consult Payment Initiated',
  'Consult Payment Success',
];

export interface DirectFunnelConfig {
  funnelId: string;
  /** Plain labels that override the Lexicon step labels in the UI. */
  stepLabels?: string[];
}

/** The two Direct Appointment variants. Saved funnel IDs only (Path A). */
export const DIRECT_FUNNELS: Record<'full' | 'instant', DirectFunnelConfig> = {
  full: {
    funnelId: FUNNEL_ID,
    stepLabels: [
      'Consult page viewed',
      'Start CTA clicked',
      'Consult Booking Form Viewed',
      'Summary step viewed',
      'Payment initiated',
      'Payment success',
    ],
  },
  instant: {
    funnelId: '90007433',
  },
};

/** Saleem Direct scheduled flow (comparison benchmark from saleem.com). */
export const SCHEDULED_FUNNEL_ID = '90007484';

/** The four Novo channel funnels (Path A completed BMI, Path B skipped it).
 *  All four render as their own step chart on the Novo tab. */
export const NOVO_GROUP_FUNNELS = [
  { key: 'novo_a_instant', id: '90004018', label: 'Novo A, instant' },
  { key: 'novo_a_scheduled', id: '90007191', label: 'Novo A, scheduled' },
  { key: 'novo_b_instant', id: '90007280', label: 'Novo B, instant' },
  { key: 'novo_b_scheduled', id: '90007301', label: 'Novo B, scheduled' },
];

/** The two Saleem Direct funnels shown as a benchmark beside the Novo funnels
 *  (the Novo-vs-Direct comparison the old dashboard carried). Same saved-funnel
 *  IDs the Direct and Scheduled tabs use, grouped here for the Novo tab. */
export const NOVO_DIRECT_BENCHMARKS = [
  { key: 'direct_instant', id: DIRECT_FUNNELS.instant.funnelId, label: 'Direct instant' },
  { key: 'direct_scheduled', id: SCHEDULED_FUNNEL_ID, label: 'Direct scheduled' },
];

// Page view events with plain labels for the top-pages list.
export const PAGE_VIEW_EVENTS = [
  'Consult Page Viewed',
  'Index Page Viewed',
  'Viewed Doctor Profile',
  'Viewed Hospital Profile',
  'Viewed Package Detail',
];

export const PAGE_VIEW_LABELS: Record<string, string> = {
  'Consult Page Viewed': 'Consult page',
  'Index Page Viewed': 'Homepage',
  'Viewed Doctor Profile': 'Doctor profiles',
  'Viewed Hospital Profile': 'Hospital profiles',
  'Viewed Package Detail': 'Package pages',
};

export const CONSULT_PAGE_EVENT = 'Consult Page Viewed';
export const INDEX_PAGE_EVENT = 'Index Page Viewed';
export const BOOKING_START_EVENT = 'Consult Start CTA Clicked';

// Retention events (legacy config/mixpanel.js). Born = a real event with
// known data; $all_events with type=unique reads zero on this project
// because identity is not fully configured (legacy overview route note).
export const RETENTION_BORN_EVENT = CONSULT_PAGE_EVENT;
export const RETENTION_RETURN_EVENT = 'Consult Payment Success';

/** Users tapping WhatsApp during the booking flow: a frustration signal. */
export const SUPPORT_ESCAPE_EVENT = 'Consult WhatsApp Support Clicked';

// Click quality events. Not guaranteed to be instrumented; the route checks
// whether Mixpanel returns the event at all before trusting a count.
export const DEAD_CLICK_EVENT = 'Dead Click';
export const RAGE_CLICK_EVENT = 'Rage Click';

// Novo insights events (from the Novo instrumentation spec and the
// May 8 2026 audit).
export const NOVO_LANDING_EVENT = 'Novo Landing Page Viewed';
export const NOVO_CTA_EVENT = 'Novo CTA Clicked';
export const NOVO_CTA_PROPERTY = 'cta_type';
/** cta_type values the spec defines as instrumented. */
export const NOVO_CTA_KNOWN_VALUES = [
  'start_assessment',
  'instant_appointment',
  'scheduled_appointment',
];
/** Per the May 8 audit the spec also lists 'bmi' but it was never
 *  instrumented. The legacy route never emits a row for it, so neither do
 *  we; it is documented here so nobody re-adds it as a real bucket. */
export const NOVO_CTA_NOT_INSTRUMENTED = ['bmi'];

export const BMI_EVENT = 'BMI Assessment Completed';
export const BMI_CATEGORY_PROPERTY = 'bmi_category';
// PDPL data minimisation: NEVER query the raw bmi_value property. Only the
// coarse bmi_category buckets are allowed on the dashboard.
export const BMI_FORBIDDEN_PROPERTY = 'bmi_value';

export const NOVO_UTM_PROPERTY = 'utm_source';

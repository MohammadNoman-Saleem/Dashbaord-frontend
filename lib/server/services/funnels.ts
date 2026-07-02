// Funnels and behaviour: every number on these five tabs comes from the
// Mixpanel Query API through the cached MixpanelClient. Funnel step counts
// come ONLY from saved funnels (/api/2.0/funnels), which enforce step
// ordering; $session_start is a virtual event and is ONLY queryable via
// /api/2.0/segmentation (legacy CLAUDE.md rules, both org-verified).
//
// Honesty rules carried in meta:
//   - A field with no real source is null (or an empty list) plus an
//     authored reason. Never zero standing in for "not measured".
//   - When Mixpanel is rate limited and nothing is saved yet, the payload
//     is null and the reason says so; saved numbers flow automatically from
//     the Postgres cache when they exist.
//
// Ported from the NestJS backend src/funnels/funnels.service.ts. The
// @Injectable FunnelsService with constructor DI (PG_POOL, MixpanelClient)
// becomes a globalThis-pinned singleton (g.__funnels) reading the foundation
// accessors getPool() and getMixpanel(). All business logic, the authored
// reasons, the DTO/payload shapes, and the Mixpanel query shapes are kept
// VERBATIM. No patient data flows through this domain.
//
// SERVER ONLY. Node runtime (touches pg and the Mixpanel client). Never import
// from a client component.
import type { Pool } from 'pg';
import { getPool } from '../db';
import type { ReasonDto, SourceMeta } from '../envelope';
import {
  getMixpanel,
  MixpanelClient,
  MixpanelRateLimitedError,
  type MixpanelQueryOptions,
} from '../integrations/mixpanel';
import {
  BMI_CATEGORY_PROPERTY,
  BMI_EVENT,
  BOOKING_START_EVENT,
  CONSULT_PAGE_EVENT,
  DEAD_CLICK_EVENT,
  DIRECT_FUNNELS,
  NOVO_CTA_EVENT,
  NOVO_CTA_KNOWN_VALUES,
  NOVO_CTA_PROPERTY,
  NOVO_GROUP_FUNNELS,
  NOVO_DIRECT_BENCHMARKS,
  NOVO_LANDING_EVENT,
  NOVO_UTM_PROPERTY,
  PAGE_VIEW_EVENTS,
  PAGE_VIEW_LABELS,
  RAGE_CLICK_EVENT,
  SCHEDULED_FUNNEL_ID,
  SUPPORT_ESCAPE_EVENT,
} from '../integrations/funnels.config';

// -- Payload shapes (mirrored by saleem-web lib/api/contract.ts) --

/** The reporting-period presets the funnel tabs switch between; each resolves
 *  to a Mixpanel from/to window. Mirrored by lib/api/contract.ts. */
export type FunnelPeriod = 'mtd' | 'qtd' | 'ytd' | 'all';

export interface FunnelStepData {
  label: string;
  count: number;
  pct_of_first: number;
}

/** A saved funnel rendered with a name, for the Novo tab's Novo and Direct
 *  comparison grids. */
export interface NamedFunnelPayload {
  key: string;
  label: string;
  steps: FunnelStepData[];
  end_to_end_pct: number;
}

export interface FunnelGeneralPayload {
  tiles: {
    site_visits: number | null;
    consult_page_views: number;
    booking_starts: number;
    dead_clicks: number | null;
  };
  visits_14d: number[];
  top_pages: Array<{ label: string; views: number }>;
}

export interface FunnelDirectPayload {
  variant: 'full' | 'instant';
  steps: FunnelStepData[];
  end_to_end_pct: number;
  paid_verified: boolean;
  readings: { biggest_drop: string; healthy_step: string; owner: string };
}

export interface FunnelUiuxPayload {
  dead_clicks: Array<{
    component: string;
    count: number;
    call: 'Fix queued' | 'Leave' | 'Watch';
  }>;
  frustration: Array<{ signal: string; detail: string }>;
}

export interface FunnelScheduledPayload {
  steps: FunnelStepData[];
  confirmed_by_specialty: Array<{ label: string; count: number }>;
}

export interface FunnelNovoPayload {
  tiles: {
    landing_views: { value: number; chip: 'measured' };
    funnel_says_paid: { value: number; chip: 'misreading' };
    real_consults: { value: number | null; chip: 'verified' };
    bmi_checks: { value: number };
  };
  novo_funnels: NamedFunnelPayload[];
  direct_benchmarks: NamedFunnelPayload[];
  ctas_by_type: Array<{
    label: string;
    count: number;
    not_instrumented?: boolean;
  }>;
  bmi_categories: Array<{ label: string; count: number }>;
  landing_by_campaign: Array<{ label: string; views: number }>;
}

export interface FunnelResult<T> {
  data: T | null;
  parts: SourceMeta[];
}

// -- Mixpanel response shapes --

interface ValuesResponse {
  data?: { values?: Record<string, Record<string, number>> };
}

interface RawFunnelStep {
  goal?: string;
  step_label?: string;
  count?: number;
}

interface FunnelsResponse {
  data?: Record<
    string,
    { $overall?: RawFunnelStep[]; steps?: RawFunnelStep[] }
  >;
}

interface AggStep {
  goal?: string;
  step_label?: string;
  count: number;
}

interface QualityFlagRow {
  active: boolean;
  title_plain: string;
  text_plain: string;
  owner_key: string | null;
  due_date: Date | string | null;
}

// -- Authored reasons --

const RATE_LIMITED_NO_DATA_REASON: ReasonDto = {
  key: 'mixpanel_rate_limited',
  title: 'Mixpanel is busy right now',
  text: 'Mixpanel is busy right now and no saved numbers exist for this view yet. It refreshes again within the hour.',
};

const PAID_UNVERIFIED_REASON: ReasonDto = {
  key: 'admin_panel_pending',
  title: 'The paid step is measured, not verified yet',
  text: 'The paid step comes from Mixpanel events. The admin panel check that verifies real payments is not connected yet.',
};

const DEAD_CLICKS_NOT_INSTRUMENTED_REASON: ReasonDto = {
  key: 'dead_clicks_not_instrumented',
  title: 'Dead click tracking is not wired up yet',
  text: 'Mixpanel returned no dead click events; the tracking is not instrumented for this project yet. This stays empty instead of pretending to be zero.',
};

const SESSIONS_NOT_CONFIGURED_REASON: ReasonDto = {
  key: 'sessions_not_configured',
  title: 'Site visit counting is not switched on',
  text: 'Counting site visits needs Mixpanel sessions, which are not enabled for this project yet. The page view numbers beside this tile are real.',
};

const NO_COMPONENT_BREAKDOWN_REASON: ReasonDto = {
  key: 'no_component_breakdown',
  title: 'Dead clicks are counted site wide',
  text: 'The per component breakdown needs a click target property that is not instrumented yet.',
};

const SPECIALTY_NOT_INSTRUMENTED_REASON: ReasonDto = {
  key: 'specialty_not_instrumented',
  title: 'No specialty breakdown yet',
  text: 'Specialty breakdown needs a booking property that is not instrumented yet.',
};

const REAL_CONSULTS_PENDING_REASON: ReasonDto = {
  key: 'admin_panel_pending',
  title: 'Verified consults come from the admin panel',
  text: 'The verified consult count comes from the admin panel, which is not connected yet. The funnel paid step beside it is a misreading, not the real number.',
};

// -- Date helpers --

const BAHRAIN_TZ = 'Asia/Bahrain';

// The analytics floor for "all time": a day before any Saleem Mixpanel data
// exists, so an all-time window spans everything the project has recorded.
const ALL_TIME_FLOOR = '2023-01-01';

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Today's Bahrain calendar day as YYYY-MM-DD, split into its year and month
// parts. The period boundaries are computed from the Bahrain day so the
// reporting window matches the Appointments page, never the server's clock.
function bahrainToday(): { year: number; month: number; day: string } {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: BAHRAIN_TZ });
  const [year, month] = day.split('-').map((n) => Number(n));
  return { year, month, day };
}

// The Mixpanel from/to window for a reporting period, all in Bahrain time. mtd
// is the first of the current month, qtd the first of the current quarter, ytd
// January 1, all the analytics floor. to_date is always today.
function resolvePeriod(period: FunnelPeriod): {
  from_date: string;
  to_date: string;
} {
  const { year, month, day } = bahrainToday();
  if (period === 'all') return { from_date: ALL_TIME_FLOOR, to_date: day };
  if (period === 'ytd') return { from_date: `${year}-01-01`, to_date: day };
  if (period === 'qtd') {
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return {
      from_date: `${year}-${String(quarterMonth).padStart(2, '0')}-01`,
      to_date: day,
    };
  }
  // mtd
  return {
    from_date: `${year}-${String(month).padStart(2, '0')}-01`,
    to_date: day,
  };
}

// Parse the ?period= query value, falling back to mtd for anything unknown so a
// bad or missing param lands on the same default the page shows.
export function parseFunnelPeriod(
  raw: string | null | undefined,
): FunnelPeriod {
  return raw === 'qtd' || raw === 'ytd' || raw === 'all' ? raw : 'mtd';
}

function lastDays(n: number): { from_date: string; to_date: string } {
  return { from_date: toYmd(daysAgo(n - 1)), to_date: toYmd(new Date()) };
}

function sumDaily(daily: Record<string, number> | undefined): number {
  if (!daily) return 0;
  return Object.values(daily).reduce((s, v) => s + (v || 0), 0);
}

function round1(value: number): number {
  return +value.toFixed(1);
}

/** '$none', empty and null buckets read as "Not set" in every breakdown. */
function bucketLabel(value: string): string {
  return value === '$none' || value === '' ? 'Not set' : value;
}

/** 'start_assessment' reads as 'Start assessment'. */
function humanize(value: string): string {
  const plain = value.replace(/_/g, ' ').trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

export class FunnelsService {
  constructor(
    private readonly pool: Pool,
    private readonly mixpanel: MixpanelClient,
  ) {}

  // -- General tab --

  async general(bypass: boolean): Promise<FunnelResult<FunnelGeneralPayload>> {
    const opts: MixpanelQueryOptions = { bypassTtl: bypass };
    const window = lastDays(14);
    try {
      const [sessions, pages, clicks] = await Promise.all([
        // $session_start is virtual: segmentation only, never /events.
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          { event: '$session_start', type: 'general', unit: 'day', ...window },
          opts,
        ),
        this.mixpanel.query<ValuesResponse>(
          'events',
          {
            event: JSON.stringify([...PAGE_VIEW_EVENTS, BOOKING_START_EVENT]),
            type: 'general',
            unit: 'day',
            ...window,
          },
          opts,
        ),
        this.clickEvents(opts),
      ]);

      const eventTotals: Record<string, number> = {};
      for (const [name, daily] of Object.entries(
        pages.data?.data?.values ?? {},
      )) {
        eventTotals[name] = sumDaily(daily);
      }

      const topPages = PAGE_VIEW_EVENTS.map((event) => ({
        label: PAGE_VIEW_LABELS[event] ?? event,
        views: eventTotals[event] ?? 0,
      })).sort((a, b) => b.views - a.views);
      const totalPageViews = topPages.reduce((s, p) => s + p.views, 0);

      // Mixpanel zero-fills every requested key, so a flat zero series is
      // indistinguishable from "not measured" by shape alone. Sessions are
      // a virtual event that needs the project setting switched on: when
      // they read zero while real page views flowed in the same window,
      // the honest value is null, not zero.
      const sessionDaily = sessions.data?.data?.values?.['$session_start'];
      const sessionTotal = sumDaily(sessionDaily);
      const sessionsMeasured = sessionTotal > 0 || totalPageViews === 0;
      const visits14d: number[] = [];
      if (sessionsMeasured) {
        for (let i = 13; i >= 0; i--) {
          visits14d.push(sessionDaily?.[toYmd(daysAgo(i))] ?? 0);
        }
      }

      // Same shape problem for dead clicks: the event is zero-filled even
      // though it was never instrumented (legacy audit). A zero total means
      // no real source, which is null plus a reason.
      const deadTotal = sumDaily(clicks.data?.data?.values?.[DEAD_CLICK_EVENT]);
      const deadClicks = deadTotal > 0 ? deadTotal : null;

      const parts: SourceMeta[] = [sessions.meta, pages.meta, clicks.meta];
      if (!sessionsMeasured) {
        parts.push({
          ...sessions.meta,
          reasons: [SESSIONS_NOT_CONFIGURED_REASON],
        });
      }
      if (deadClicks === null) {
        parts.push({
          ...clicks.meta,
          reasons: [DEAD_CLICKS_NOT_INSTRUMENTED_REASON],
        });
      }

      return {
        data: {
          tiles: {
            site_visits: sessionsMeasured ? sessionTotal : null,
            consult_page_views: eventTotals[CONSULT_PAGE_EVENT] ?? 0,
            booking_starts: eventTotals[BOOKING_START_EVENT] ?? 0,
            dead_clicks: deadClicks,
          },
          visits_14d: visits14d,
          top_pages: topPages,
        },
        parts,
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  // -- Direct Appointment tab --

  async direct(
    variant: 'full' | 'instant',
    period: FunnelPeriod,
    bypass: boolean,
  ): Promise<FunnelResult<FunnelDirectPayload>> {
    const cfg = DIRECT_FUNNELS[variant];
    try {
      const { steps: agg, meta } = await this.savedFunnelSteps(
        cfg.funnelId,
        resolvePeriod(period),
        bypass,
      );
      const steps = this.toSteps(agg, cfg.stepLabels);
      const last = steps[steps.length - 1];
      return {
        data: {
          variant,
          steps,
          end_to_end_pct: last ? last.pct_of_first : 0,
          // paid_verified stays false until the admin panel cross check
          // lands; the reason explains the gap in plain words.
          paid_verified: false,
          readings: this.readings(steps),
        },
        parts: [{ ...meta, reasons: [PAID_UNVERIFIED_REASON] }],
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  /** Plain readings authored from the actual numbers: the consecutive step
   *  pair with the largest percentage fall, and the one with the smallest. */
  private readings(steps: FunnelStepData[]): FunnelDirectPayload['readings'] {
    const owner = 'Noman';
    if (steps.length < 2 || (steps[0]?.count ?? 0) === 0) {
      return {
        biggest_drop:
          'Not enough funnel entries in this period to point at a drop yet.',
        healthy_step: 'Readings appear once bookings start flowing.',
        owner,
      };
    }
    // Only step pairs that real users entered can be read; a 0 to 0 pair
    // says nothing about health.
    let worstIdx = 1;
    let worstFall = -1;
    let bestIdx = 1;
    let bestFall = Number.POSITIVE_INFINITY;
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].count;
      if (prev === 0) continue;
      const fall = ((prev - steps[i].count) / prev) * 100;
      if (fall > worstFall) {
        worstFall = fall;
        worstIdx = i;
      }
      if (fall < bestFall) {
        bestFall = fall;
        bestIdx = i;
      }
    }
    return {
      biggest_drop: `The biggest drop is between ${steps[worstIdx - 1].label.toLowerCase()} and ${steps[worstIdx].label.toLowerCase()}: ${Math.round(worstFall)}% leave at that step.`,
      healthy_step: `The healthiest step is ${steps[bestIdx - 1].label.toLowerCase()} to ${steps[bestIdx].label.toLowerCase()}: ${Math.round(100 - bestFall)}% carry on.`,
      owner,
    };
  }

  // -- UI/UX tab --

  async uiux(bypass: boolean): Promise<FunnelResult<FunnelUiuxPayload>> {
    try {
      const clicks = await this.clickEvents({ bypassTtl: bypass });
      const values = clicks.data?.data?.values ?? {};
      const reasons: ReasonDto[] = [];

      // Mixpanel zero-fills requested events, so presence proves nothing;
      // only a nonzero total shows the event really fires (the legacy audit
      // found dead and rage click were never instrumented).
      const deadTotal = sumDaily(values[DEAD_CLICK_EVENT]);
      // The Call column defaults to 'Watch': which rows enter the fix queue
      // is a product decision that is still pending.
      const deadRows: FunnelUiuxPayload['dead_clicks'] =
        deadTotal > 0
          ? [
              {
                component: 'All pages combined',
                count: deadTotal,
                call: 'Watch',
              },
            ]
          : [];
      if (deadTotal === 0) {
        reasons.push(DEAD_CLICKS_NOT_INSTRUMENTED_REASON);
      } else {
        reasons.push(NO_COMPONENT_BREAKDOWN_REASON);
      }

      const frustration: FunnelUiuxPayload['frustration'] = [];
      const rageTotal = sumDaily(values[RAGE_CLICK_EVENT]);
      if (rageTotal > 0) {
        frustration.push({
          signal: 'Rage clicks',
          detail: `${rageTotal.toLocaleString('en-US')} rage clicks recorded in the last 14 days.`,
        });
      }
      const escapeTotal = sumDaily(values[SUPPORT_ESCAPE_EVENT]);
      if (escapeTotal > 0) {
        frustration.push({
          signal: 'WhatsApp taps during booking',
          detail: `${escapeTotal.toLocaleString('en-US')} people tapped WhatsApp support mid flow in the last 14 days, a sign they were stuck.`,
        });
      }

      return {
        data: { dead_clicks: deadRows, frustration },
        parts: [{ ...clicks.meta, reasons }],
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  // -- Scheduled tab --

  async scheduled(
    period: FunnelPeriod,
    bypass: boolean,
  ): Promise<FunnelResult<FunnelScheduledPayload>> {
    try {
      const { steps: agg, meta } = await this.savedFunnelSteps(
        SCHEDULED_FUNNEL_ID,
        resolvePeriod(period),
        bypass,
      );
      return {
        data: {
          steps: this.toSteps(agg),
          // No verified booking property carries specialty, so the list
          // stays empty with the reason below rather than guessing.
          confirmed_by_specialty: [],
        },
        parts: [{ ...meta, reasons: [SPECIALTY_NOT_INSTRUMENTED_REASON] }],
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  // -- Novo tab --

  async novo(
    period: FunnelPeriod,
    bypass: boolean,
  ): Promise<FunnelResult<FunnelNovoPayload>> {
    const opts: MixpanelQueryOptions = { bypassTtl: bypass };
    const window = resolvePeriod(period);
    try {
      const [funnelReads, directReads, landing, ctas, bmi, utm, flag] = await Promise.all([
        Promise.all(
          NOVO_GROUP_FUNNELS.map((f) =>
            this.savedFunnelSteps(f.id, window, bypass),
          ),
        ),
        Promise.all(
          NOVO_DIRECT_BENCHMARKS.map((f) =>
            this.savedFunnelSteps(f.id, window, bypass),
          ),
        ),
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: NOVO_LANDING_EVENT,
            type: 'general',
            unit: 'day',
            ...window,
          },
          opts,
        ),
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: NOVO_CTA_EVENT,
            type: 'general',
            unit: 'day',
            on: `properties["${NOVO_CTA_PROPERTY}"]`,
            ...window,
          },
          opts,
        ),
        // PDPL: segment on bmi_category only; bmi_value is never queried.
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: BMI_EVENT,
            type: 'general',
            unit: 'day',
            on: `properties["${BMI_CATEGORY_PROPERTY}"]`,
            ...window,
          },
          opts,
        ),
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: NOVO_LANDING_EVENT,
            type: 'general',
            unit: 'day',
            on: `properties["${NOVO_UTM_PROPERTY}"]`,
            ...window,
          },
          opts,
        ),
        this.novoMismatchFlag(),
      ]);

      const funnelSaysPaid = funnelReads.reduce((sum, read) => {
        const last = read.steps[read.steps.length - 1];
        return sum + (last?.count ?? 0);
      }, 0);

      const buildNamed = (
        defs: ReadonlyArray<{ key: string; label: string }>,
        reads: ReadonlyArray<{ steps: AggStep[] }>,
      ): NamedFunnelPayload[] =>
        defs.map((d, i) => {
          const steps = this.toSteps(reads[i]?.steps ?? []);
          return {
            key: d.key,
            label: d.label,
            steps,
            end_to_end_pct:
              steps.length > 0 ? steps[steps.length - 1].pct_of_first : 0,
          };
        });
      const novoFunnels = buildNamed(NOVO_GROUP_FUNNELS, funnelReads);
      const directBenchmarks = buildNamed(NOVO_DIRECT_BENCHMARKS, directReads);

      const ctaRows = this.segmentRows(ctas).map((row) => ({
        label: humanize(row.label),
        count: row.count,
      }));
      // The spec's known cta_type values appear even at zero so "expected
      // but quiet" stays visible (the legacy route does the same). The
      // never instrumented 'bmi' bucket is deliberately omitted, matching
      // the legacy route, which carries it as a side channel rather than a
      // counted row.
      const present = new Set(this.segmentRows(ctas).map((r) => r.label));
      for (const known of NOVO_CTA_KNOWN_VALUES) {
        if (!present.has(known)) {
          ctaRows.push({ label: humanize(known), count: 0 });
        }
      }

      const bmiRows = this.segmentRows(bmi);
      const bmiChecks = bmiRows.reduce((s, r) => s + r.count, 0);

      const parts: SourceMeta[] = [];
      // The data quality flag rides first so it lands at reasons[0].
      if (flag) parts.push(flag);
      parts.push(
        ...funnelReads.map((r) => r.meta),
        ...directReads.map((r) => r.meta),
        landing.meta,
        ctas.meta,
        bmi.meta,
        utm.meta,
        // The real consults tile has no source yet; its reason rides on a
        // dedicated part so it is not tied to any one upstream read.
        {
          fetched_at: new Date(),
          cached: false,
          stale: false,
          reasons: [REAL_CONSULTS_PENDING_REASON],
        },
      );

      return {
        data: {
          tiles: {
            landing_views: {
              value: sumDaily(landing.data?.data?.values?.[NOVO_LANDING_EVENT]),
              chip: 'measured',
            },
            funnel_says_paid: { value: funnelSaysPaid, chip: 'misreading' },
            // The verified count comes from the admin panel, which is not
            // connected yet: null, never a stand-in number.
            real_consults: { value: null, chip: 'verified' },
            bmi_checks: { value: bmiChecks },
          },
          novo_funnels: novoFunnels,
          direct_benchmarks: directBenchmarks,
          ctas_by_type: ctaRows,
          bmi_categories: bmiRows.map((r) => ({
            label: humanize(r.label),
            count: r.count,
          })),
          landing_by_campaign: this.segmentRows(utm).map((r) => ({
            label: r.label,
            views: r.count,
          })),
        },
        parts,
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  /** While the novo_funnel_mismatch data quality flag is active the tab is
   *  marked unreliable and the flag's own copy becomes the first reason. */
  private async novoMismatchFlag(): Promise<SourceMeta | null> {
    const { rows } = await this.pool.query<QualityFlagRow>(
      `select active, title_plain, text_plain, owner_key, due_date
       from data_quality_flags
       where key = 'novo_funnel_mismatch' and active = true`,
    );
    const row = rows[0];
    if (!row) return null;
    const owner = row.owner_key
      ? row.owner_key.charAt(0).toUpperCase() + row.owner_key.slice(1)
      : undefined;
    // pg hands a date column back as local midnight; format with local
    // parts so the day does not shift when converted through UTC.
    const due =
      row.due_date instanceof Date
        ? `${row.due_date.getFullYear()}-${String(row.due_date.getMonth() + 1).padStart(2, '0')}-${String(row.due_date.getDate()).padStart(2, '0')}`
        : (row.due_date ?? undefined);
    return {
      fetched_at: new Date(),
      cached: false,
      stale: false,
      reliable: false,
      reasons: [
        {
          key: 'definition_mismatch',
          title: row.title_plain,
          text: row.text_plain,
          owner,
          due,
        },
      ],
    };
  }

  // -- Shared plumbing --

  /** One /events call covers the click quality and support escape signals
   *  for both the General tile and the UI/UX tab; the shared URL means the
   *  two endpoints spend a single Mixpanel query between them. */
  private clickEvents(opts: MixpanelQueryOptions) {
    return this.mixpanel.query<ValuesResponse>(
      'events',
      {
        event: JSON.stringify([
          DEAD_CLICK_EVENT,
          RAGE_CLICK_EVENT,
          SUPPORT_ESCAPE_EVENT,
        ]),
        type: 'general',
        unit: 'day',
        ...lastDays(14),
      },
      opts,
    );
  }

  /** Fetch a saved funnel and aggregate step counts across the date
   *  buckets. unit=month dedupes users within each calendar bucket, the
   *  org-verified fix for the per day over-count (legacy probe data). */
  private async savedFunnelSteps(
    funnelId: string,
    window: { from_date: string; to_date: string },
    bypass: boolean,
  ): Promise<{ steps: AggStep[]; meta: SourceMeta }> {
    const read = await this.mixpanel.query<FunnelsResponse>(
      'funnels',
      { funnel_id: funnelId, unit: 'month', ...window },
      { bypassTtl: bypass },
    );
    const dateData = read.data?.data ?? {};
    const dateKeys = Object.keys(dateData)
      .filter((k) => k !== '$overall')
      .sort();
    const agg: AggStep[] = [];
    for (const key of dateKeys) {
      const entry = dateData[key];
      // The per bucket shape varies by saved funnel: consult style uses
      // $overall, novo style uses steps. Both arrays are per bucket.
      const steps = entry?.$overall ?? entry?.steps ?? [];
      steps.forEach((s, i) => {
        if (!agg[i]) {
          agg[i] = { goal: s.goal, step_label: s.step_label, count: 0 };
        }
        agg[i].count += s.count ?? 0;
      });
    }
    return { steps: agg, meta: read.meta };
  }

  private toSteps(agg: AggStep[], stepLabels?: string[]): FunnelStepData[] {
    const first = agg[0]?.count ?? 0;
    return agg.map((step, i) => ({
      label: stepLabels?.[i] ?? step.step_label ?? step.goal ?? `Step ${i + 1}`,
      count: step.count,
      pct_of_first: first > 0 ? round1((step.count / first) * 100) : 0,
    }));
  }

  /** Segmentation values to sorted rows. Buckets with zero hits across the
   *  window are dropped; '$none' reads as "Not set". */
  private segmentRows(read: {
    data: ValuesResponse | null;
  }): Array<{ label: string; count: number }> {
    const values = read.data?.data?.values ?? {};
    return Object.entries(values)
      .map(([value, daily]) => ({
        label: bucketLabel(value),
        count: sumDaily(daily),
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  /** Rate limited with nothing saved yet: null data plus the busy reason.
   *  (When a saved payload exists the cache serves it before this path is
   *  ever reached.) Anything else keeps throwing. */
  private rateLimitedOrThrow<T>(err: unknown): FunnelResult<T> {
    if (err instanceof MixpanelRateLimitedError) {
      return {
        data: null,
        parts: [
          {
            fetched_at: new Date(),
            cached: false,
            stale: true,
            reasons: [RATE_LIMITED_NO_DATA_REASON],
          },
        ],
      };
    }
    throw err;
  }
}

// globalThis-pinned singleton: shares the one pg pool and the Mixpanel client
// singleton (its in-flight map and concurrency slots), so the warm caches are
// reused across requests within one instance.
const FUNNELS_KEY = '__funnels';

type GlobalWithFunnels = typeof globalThis & {
  [FUNNELS_KEY]?: FunnelsService;
};

export function getFunnelsService(): FunnelsService {
  const g = globalThis as GlobalWithFunnels;
  if (!g[FUNNELS_KEY]) {
    g[FUNNELS_KEY] = new FunnelsService(getPool(), getMixpanel());
  }
  return g[FUNNELS_KEY];
}

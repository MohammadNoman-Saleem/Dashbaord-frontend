// Growth and behaviour analytics, ported from the legacy dashboard:
//
//   - /api/growth/engagement: DAU/MAU with a 30-day trend, top events, and
//     traffic with a device split (legacy /api/mixpanel/overview,
//     /api/mixpanel/top-events, /api/mixpanel/traffic).
//   - /api/growth/retention: Mixpanel weekly behaviour retention matrices
//     plus two CRM-identity reads: lead-to-booking conversion and velocity
//     by source, and repeat-booking month cohorts (legacy
//     /api/mixpanel/retention, /api/zoho/crm/lead-to-booking,
//     /api/zoho/appointments/cohorts).
//
// Mixpanel budget: the legacy three engagement routes spent ten queries; this
// service spends six by deriving the 7-day and prior-7-day event windows from
// one 30-day daily series and both traffic windows from one 60-day series.
// Retention spends two. Every query lands in the Postgres cache (1h TTL), so
// the shared 60/hr pool is only touched on a cold or forced read.
//
// Identity rule: emails and patient ids are join keys server-side ONLY.
// Payloads carry aggregates labelled by source name or month; no email, id,
// or name ever leaves this service.
//
// Ported from the NestJS backend src/growth/growth.service.ts. The @Injectable
// class with its MixpanelClient and CrmReadService dependencies becomes a
// globalThis-pinned singleton (g.__growthService) taking the spine accessors:
// getMixpanel() for the cached Query API client and getCrmRead() for the
// cached CRM reads. Business logic, payload shapes, and authored copy are
// verbatim.
//
// SERVER ONLY. Node runtime (pulls in pg/Zoho via getCrmRead() and node:crypto
// via getMixpanel()). Never import from a client component.
import type { ReasonDto, SourceMeta } from '../envelope';
import {
  getMixpanel,
  MixpanelClient,
  MixpanelRateLimitedError,
  type MixpanelQueryOptions,
} from '../integrations/mixpanel';
import {
  getCrmRead,
  CrmReadService,
  type BookingRecord,
  type LeadRecord,
  type PatientEmailRecord,
} from '../crm-read';

// Mixpanel event constants, mirrored from the backend funnels.config
// (INDEX_PAGE_EVENT, RETENTION_BORN_EVENT, RETENTION_RETURN_EVENT). The Phase 4
// funnels port has not yet landed a shared mixpanel config module in the spine;
// these three constants are inlined here verbatim so growth stands alone. When
// the funnels config file lands, this block should import from it instead.
//
// Born = a real event with known data; $all_events with type=unique reads zero
// on this project because identity is not fully configured (legacy overview
// route note).
const INDEX_PAGE_EVENT = 'Index Page Viewed';
const RETENTION_BORN_EVENT = 'Consult Page Viewed';
const RETENTION_RETURN_EVENT = 'Consult Payment Success';

// ── Payload shapes (mirrored by saleem-web lib/api/contract.ts) ──

export interface GrowthTrendPoint {
  date: string;
  dau: number;
  rolling_avg: number;
}

export interface GrowthEngagementPayload {
  active_users: {
    dau: number;
    mau: number;
    stickiness_pct: number;
    /** The event behind DAU/MAU, surfaced so the UI labels it honestly. */
    event: string;
    trend_30d: GrowthTrendPoint[];
  };
  top_events: Array<{
    name: string;
    count_7d: number;
    count_30d: number;
    /** Null when the prior week had no events (no honest base for a trend). */
    trend_pct: number | null;
  }>;
  traffic: {
    window_days: number;
    homepage_views: number;
    consult_views: number;
    trend_homepage_pct: number | null;
    trend_consult_pct: number | null;
    /** Null when Mixpanel returned no $os buckets for the window. */
    device_split: { mobile: number; desktop: number; other: number } | null;
  };
}

export interface RetentionCohortRow {
  /** Cohort start date, YYYY-MM-DD. Week-of-first-visit, never an identity. */
  date: string;
  size: number;
  /** Percent retained per column; null when the bucket has not matured. */
  cells: Array<number | null>;
}

export interface BehaviourRetentionPayload {
  born_event: string;
  return_event: string;
  columns: string[];
  visits: RetentionCohortRow[];
  bookings: RetentionCohortRow[];
}

export interface LeadToBookingPayload {
  by_source: Array<{
    source: string;
    leads: number;
    booked: number;
    conversion_pct: number;
    median_days: number | null;
  }>;
  overall: {
    leads: number;
    booked: number;
    conversion_pct: number;
    median_days: number | null;
  };
  leads_total: number;
  leads_with_email: number;
  definition: string;
}

export interface BookingCohortsPayload {
  cohorts: Array<{
    key: string;
    label: string;
    size: number;
    repeat_1m_pct: number | null;
    repeat_2m_pct: number | null;
    repeat_3m_pct: number | null;
    repeat_revenue: number;
    first_revenue: number;
  }>;
  identified_patients: number;
  definition: string;
}

export interface GrowthRetentionPayload {
  /** Null when Mixpanel is rate limited with nothing saved yet; the CRM
   *  sections below still serve. */
  behaviour: BehaviourRetentionPayload | null;
  lead_to_booking: LeadToBookingPayload;
  booking_cohorts: BookingCohortsPayload;
}

export interface GrowthResult<T> {
  data: T | null;
  parts: SourceMeta[];
}

// ── Mixpanel response shapes ──

interface ValuesResponse {
  data?: { values?: Record<string, Record<string, number>> };
}

interface TopEventsResponse {
  events?: Array<{ event?: string } | string>;
}

type RetentionResponse = Record<
  string,
  { first?: number; counts?: number[] } | undefined
>;

// ── Authored reasons ──

const RATE_LIMITED_NO_DATA_REASON: ReasonDto = {
  key: 'mixpanel_rate_limited',
  title: 'Mixpanel is busy right now',
  text: 'Mixpanel is busy right now and no saved numbers exist for this view yet. It refreshes again within the hour.',
};

const DEVICE_SPLIT_UNAVAILABLE_REASON: ReasonDto = {
  key: 'device_split_unavailable',
  title: 'Device split is not measured yet',
  text: 'Mixpanel returned no operating system buckets for homepage views in this window, so the device split stays empty instead of guessing.',
};

const LEAD_JOIN_PROXY_REASON: ReasonDto = {
  key: 'lead_join_proxy',
  title: 'Direct bookers are not in these numbers',
  text: 'Lead to booking joins CRM leads to paid bookings by email. People who booked without ever becoming a lead are not counted, and a share of leads carry the source Unknown.',
};

const COHORT_UNDERCOUNT_REASON: ReasonDto = {
  key: 'cohort_undercount',
  title: 'Cohorts can slightly undercount repeats',
  text: 'Repeat booking cohorts read the bookings module only. Telemedicine deals without a booking row are not counted, so repeat rates can read slightly low.',
};

// ── Constants (legacy revenue-route convention) ──

const DONE_STATUS = 'Done';
const MIN_RATE_BHD = 1; // Rates <= 1 BHD are test bookings.
const COHORT_COUNT = 9; // Trailing month cohorts to report.
/** The booking flow can create the booking row moments before the Lead lands
 *  in CRM; a 24h grace window keeps the most common ordering counted. */
const LEAD_GRACE_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Weekly buckets from interval=7, interval_count=4: D0 through D28. The
 *  legacy grid labelled the last bucket D30; D28 is the honest label. */
const RETENTION_COLUMNS = ['Day 0', 'Day 7', 'Day 14', 'Day 21', 'Day 28'];

// ── Date helpers ──

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function sumDaily(daily: Record<string, number> | undefined): number {
  if (!daily) return 0;
  return Object.values(daily).reduce((s, v) => s + (v || 0), 0);
}

/** Sum of a daily values map across [from, to] inclusive (YYYY-MM-DD). */
function sumBetween(
  daily: Record<string, number> | undefined,
  from: string,
  to: string,
): number {
  if (!daily) return 0;
  let sum = 0;
  for (const [date, v] of Object.entries(daily)) {
    if (date >= from && date <= to) sum += v || 0;
  }
  return sum;
}

function round1(value: number): number {
  return +value.toFixed(1);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Month index from the raw date string's wall-clock part. Zoho returns
 *  org-local (Bahrain) timestamps, so parsing via new Date() and reading
 *  server-local getters would shift bookings near month boundaries on UTC
 *  hosts. */
function monthIndex(dateStr: string): number {
  const [y, m] = String(dateStr).slice(0, 7).split('-').map(Number);
  return y * 12 + (m - 1);
}

/** "Now" on the Bahrain clock (UTC+3, no DST), read via getUTC* getters. */
function bahrainNow(): Date {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

function normalizedEmail(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export class GrowthService {
  constructor(
    private readonly mixpanel: MixpanelClient,
    private readonly crm: CrmReadService,
  ) {}

  // ── Engagement: DAU/MAU, top events, traffic ──

  async engagement(
    bypass: boolean,
  ): Promise<GrowthResult<GrowthEngagementPayload>> {
    const opts: MixpanelQueryOptions = { bypassTtl: bypass };
    // Unique-user windows end yesterday: today is a partial day and would
    // read as a fake dip (legacy overview convention).
    const dailyWindow = {
      from_date: toYmd(daysAgo(30)),
      to_date: toYmd(daysAgo(1)),
    };
    const trafficWindow = {
      from_date: toYmd(daysAgo(60)),
      to_date: toYmd(daysAgo(1)),
    };

    try {
      const [daily, monthly, top, traffic, device] = await Promise.all([
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: RETENTION_BORN_EVENT,
            type: 'unique',
            unit: 'day',
            ...dailyWindow,
          },
          opts,
        ),
        // unit=month dedupes uniques across the window; summing the daily
        // series would over-count returning users.
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: RETENTION_BORN_EVENT,
            type: 'unique',
            unit: 'month',
            ...dailyWindow,
          },
          opts,
        ),
        this.mixpanel.query<TopEventsResponse>(
          'events/top',
          { type: 'general', limit: '10' },
          opts,
        ),
        // One 60-day series carries both the current and the prior 30-day
        // traffic windows.
        this.mixpanel.query<ValuesResponse>(
          'events',
          {
            event: JSON.stringify([INDEX_PAGE_EVENT, RETENTION_BORN_EVENT]),
            type: 'unique',
            unit: 'day',
            ...trafficWindow,
          },
          opts,
        ),
        this.mixpanel.query<ValuesResponse>(
          'segmentation',
          {
            event: INDEX_PAGE_EVENT,
            type: 'unique',
            unit: 'day',
            on: 'properties["$os"]',
            ...dailyWindow,
          },
          opts,
        ),
      ]);

      // DAU trend with a 7-day rolling average; DAU is the last full day.
      const dauDaily = daily.data?.data?.values?.[RETENTION_BORN_EVENT] ?? {};
      const trend: GrowthTrendPoint[] = [];
      for (let i = 30; i >= 1; i--) {
        trend.push({
          date: toYmd(daysAgo(i)),
          dau: dauDaily[toYmd(daysAgo(i))] ?? 0,
          rolling_avg: 0,
        });
      }
      trend.forEach((point, i) => {
        const slice = trend.slice(Math.max(0, i - 6), i + 1);
        point.rolling_avg = Math.round(
          slice.reduce((s, p) => s + p.dau, 0) / slice.length,
        );
      });
      const dau = trend.length ? trend[trend.length - 1].dau : 0;

      const monthVals =
        monthly.data?.data?.values?.[RETENTION_BORN_EVENT] ?? {};
      let mau = Object.values(monthVals).reduce((s, v) => s + (v || 0), 0);
      if (!mau) {
        // Fallback: sum of daily uniques (slight over-count from returning
        // users, ported from the legacy route).
        mau = trend.reduce((s, p) => s + p.dau, 0);
      }

      // Top events: 30-day, 7-day and prior-7-day windows all derived from
      // the same daily series, one query for all three.
      const names = (top.data?.events ?? [])
        .map((e) => (typeof e === 'string' ? e : e.event))
        .filter((name): name is string => Boolean(name))
        // Mixpanel internal telemetry ($mp_session_record, $mp_page_leave,
        // $mp_click, ...) is not product behaviour and would crowd real
        // events out of the table.
        .filter((name) => !name.startsWith('$'))
        .slice(0, 10);
      let topEvents: GrowthEngagementPayload['top_events'] = [];
      let countsMeta: SourceMeta | null = null;
      if (names.length > 0) {
        const counts = await this.mixpanel.query<ValuesResponse>(
          'events',
          {
            event: JSON.stringify(names),
            type: 'general',
            unit: 'day',
            from_date: toYmd(daysAgo(29)),
            to_date: toYmd(new Date()),
          },
          opts,
        );
        countsMeta = counts.meta;
        const values = counts.data?.data?.values ?? {};
        topEvents = names
          .map((name) => {
            const series = values[name];
            const count7d = sumBetween(
              series,
              toYmd(daysAgo(6)),
              toYmd(new Date()),
            );
            const prev7d = sumBetween(
              series,
              toYmd(daysAgo(13)),
              toYmd(daysAgo(7)),
            );
            return {
              name,
              count_7d: count7d,
              count_30d: sumDaily(series),
              trend_pct:
                prev7d > 0
                  ? Math.round(((count7d - prev7d) / prev7d) * 100)
                  : null,
            };
          })
          .sort((a, b) => b.count_7d - a.count_7d);
      }

      // Traffic: split the 60-day series into the current and prior 30 days.
      const trafficVals = traffic.data?.data?.values ?? {};
      const curFrom = toYmd(daysAgo(30));
      const curTo = toYmd(daysAgo(1));
      const prevFrom = toYmd(daysAgo(60));
      const prevTo = toYmd(daysAgo(31));
      const windowSums = (event: string) => ({
        current: sumBetween(trafficVals[event], curFrom, curTo),
        previous: sumBetween(trafficVals[event], prevFrom, prevTo),
      });
      const homepage = windowSums(INDEX_PAGE_EVENT);
      const consult = windowSums(RETENTION_BORN_EVENT);
      const trendPct = (cur: number, prev: number): number | null =>
        prev > 0 ? round1(((cur - prev) / prev) * 100) : null;

      // Device split from $os buckets on homepage views. Zero buckets means
      // not measured: null, never a guessed split.
      const MOBILE = ['ios', 'android'];
      const DESKTOP = ['windows', 'mac os x', 'macos', 'linux', 'chrome os'];
      let mobile = 0;
      let desktop = 0;
      let other = 0;
      for (const [osName, series] of Object.entries(
        device.data?.data?.values ?? {},
      )) {
        const total = sumDaily(series);
        const key = osName.toLowerCase();
        if (MOBILE.some((m) => key.includes(m))) mobile += total;
        else if (DESKTOP.some((d) => key.includes(d))) desktop += total;
        else other += total;
      }
      const deviceTotal = mobile + desktop + other;

      const parts: SourceMeta[] = [
        daily.meta,
        monthly.meta,
        top.meta,
        traffic.meta,
        device.meta,
      ];
      if (countsMeta) parts.push(countsMeta);
      if (deviceTotal === 0) {
        parts.push({
          ...device.meta,
          reasons: [DEVICE_SPLIT_UNAVAILABLE_REASON],
        });
      }

      return {
        data: {
          active_users: {
            dau,
            mau,
            stickiness_pct: mau > 0 ? round1((dau / mau) * 100) : 0,
            event: RETENTION_BORN_EVENT,
            trend_30d: trend,
          },
          top_events: topEvents,
          traffic: {
            window_days: 30,
            homepage_views: homepage.current,
            consult_views: consult.current,
            trend_homepage_pct: trendPct(homepage.current, homepage.previous),
            trend_consult_pct: trendPct(consult.current, consult.previous),
            device_split: deviceTotal > 0 ? { mobile, desktop, other } : null,
          },
        },
        parts,
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  // ── Retention: behaviour matrices + CRM identity cohorts ──

  async retention(
    bypass: boolean,
  ): Promise<GrowthResult<GrowthRetentionPayload>> {
    // The Mixpanel matrices and the three CRM reads run side by side; a
    // rate-limited Mixpanel nulls only the behaviour section.
    const behaviourPromise = this.behaviourRetention(bypass);
    const [leads, bookings, patients] = await Promise.all([
      this.crm.leads(),
      this.crm.bookings(),
      this.crm.patients(),
    ]);
    const behaviour = await behaviourPromise;

    const leadToBooking = this.computeLeadToBooking(
      leads.data,
      bookings.data,
      patients.data,
    );
    const bookingCohorts = this.computeBookingCohorts(bookings.data);

    return {
      data: {
        behaviour: behaviour.data,
        lead_to_booking: leadToBooking,
        booking_cohorts: bookingCohorts,
      },
      parts: [
        ...behaviour.parts,
        { ...leads.meta, reasons: [LEAD_JOIN_PROXY_REASON] },
        { ...bookings.meta, reasons: [COHORT_UNDERCOUNT_REASON] },
        patients.meta,
      ],
    };
  }

  /** Two saved retention reads (visits and paid bookings) over the same
   *  60-day birth window, weekly buckets. Mixpanel's retention endpoint
   *  computes the cohorts server-side; we only express counts as percents. */
  private async behaviourRetention(
    bypass: boolean,
  ): Promise<GrowthResult<BehaviourRetentionPayload>> {
    const opts: MixpanelQueryOptions = { bypassTtl: bypass };
    // Mixpanel retention API: pass interval (days) OR unit, not both.
    // interval=7 with interval_count=4 yields D0..D28 buckets.
    const baseParams = {
      from_date: toYmd(daysAgo(60)),
      to_date: toYmd(new Date()),
      retention_type: 'birth',
      born_event: RETENTION_BORN_EVENT,
      interval: '7',
      interval_count: '4',
    };
    try {
      const [visits, bookings] = await Promise.all([
        this.mixpanel.query<RetentionResponse>(
          'retention',
          { ...baseParams, event: RETENTION_BORN_EVENT },
          opts,
        ),
        this.mixpanel.query<RetentionResponse>(
          'retention',
          { ...baseParams, event: RETENTION_RETURN_EVENT },
          opts,
        ),
      ]);
      return {
        data: {
          born_event: RETENTION_BORN_EVENT,
          return_event: RETENTION_RETURN_EVENT,
          columns: RETENTION_COLUMNS,
          visits: this.parseCohorts(visits.data),
          bookings: this.parseCohorts(bookings.data),
        },
        parts: [visits.meta, bookings.meta],
      };
    } catch (err) {
      return this.rateLimitedOrThrow(err);
    }
  }

  /** Cohort rows from a raw retention response: last eight weekly cohorts,
   *  cells as percent of the cohort's first count. A bucket Mixpanel has not
   *  served yet (the cohort is too young) stays null, never zero. */
  private parseCohorts(res: RetentionResponse | null): RetentionCohortRow[] {
    return Object.entries(res ?? {})
      .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .map(([date, cohort]) => {
        const counts = cohort?.counts ?? [];
        const first = cohort?.first ?? counts[0] ?? 0;
        const cells = RETENTION_COLUMNS.map((_, i) =>
          first > 0 && counts[i] != null
            ? Math.round((counts[i] / first) * 100)
            : null,
        );
        return { date, size: first, cells };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-8);
  }

  /** True cohort conversion: one lead per normalized email (earliest record
   *  wins and its source takes the attribution), converting when a paid
   *  booking exists on/after lead creation (24h grace). Ported verbatim from
   *  the legacy route, including the Patients-module email join. */
  private computeLeadToBooking(
    leads: LeadRecord[],
    bookings: BookingRecord[],
    patients: PatientEmailRecord[],
  ): LeadToBookingPayload {
    const patientEmailById = new Map<string, string>();
    for (const p of patients) {
      const email = normalizedEmail(p.Email);
      if (email) patientEmailById.set(String(p.id), email);
    }

    // Paid booking dates per normalized email (via the Patient lookup, with
    // the booking's own Email field as fallback), ascending.
    const bookingsByEmail = new Map<string, Date[]>();
    for (const b of bookings) {
      if (b.Status !== DONE_STATUS) continue;
      if ((parseFloat(String(b.Rate)) || 0) <= MIN_RATE_BHD) continue;
      const email =
        (b.Patient?.id && patientEmailById.get(String(b.Patient.id))) ||
        normalizedEmail(b.Email);
      const date = b.Created_At || b.Created_Time;
      if (!email || !date) continue;
      const list = bookingsByEmail.get(email) ?? [];
      list.push(new Date(date));
      bookingsByEmail.set(email, list);
    }
    for (const dates of bookingsByEmail.values()) {
      dates.sort((x, y) => x.getTime() - y.getTime());
    }

    // Dedupe to ONE lead per email. Without this, duplicate lead records for
    // the same person each count in the denominator AND each claim the same
    // booking as a conversion, inflating booked across sources.
    const leadByEmail = new Map<
      string,
      { created: Date | null; source: string }
    >();
    for (const lead of leads) {
      const email = normalizedEmail(lead.Email);
      if (!email) continue;
      const created = lead.Created_Time ? new Date(lead.Created_Time) : null;
      const existing = leadByEmail.get(email);
      if (
        !existing ||
        (created && (!existing.created || created < existing.created))
      ) {
        leadByEmail.set(email, {
          created,
          source: (lead.Lead_Source ?? '').trim() || 'Unknown',
        });
      }
    }

    const bySource = new Map<
      string,
      { source: string; leads: number; booked: number; days: number[] }
    >();
    for (const [email, lead] of leadByEmail) {
      const bucket = bySource.get(lead.source) ?? {
        source: lead.source,
        leads: 0,
        booked: 0,
        days: [],
      };
      bySource.set(lead.source, bucket);
      bucket.leads += 1;

      if (!lead.created) continue;
      const created = lead.created;
      const firstBooking = (bookingsByEmail.get(email) ?? []).find(
        (d) => d.getTime() >= created.getTime() - LEAD_GRACE_MS,
      );
      if (firstBooking) {
        bucket.booked += 1;
        bucket.days.push(
          Math.max(
            0,
            Math.round((firstBooking.getTime() - created.getTime()) / 86400000),
          ),
        );
      }
    }

    const conversionPct = (booked: number, count: number) =>
      count > 0 ? Math.round((booked / count) * 1000) / 10 : 0;

    const by_source = [...bySource.values()]
      .map((s) => ({
        source: s.source,
        leads: s.leads,
        booked: s.booked,
        conversion_pct: conversionPct(s.booked, s.leads),
        median_days: median(s.days),
      }))
      .sort((a, b) => b.leads - a.leads);

    const totals = by_source.reduce(
      (acc, s) => ({
        leads: acc.leads + s.leads,
        booked: acc.booked + s.booked,
      }),
      { leads: 0, booked: 0 },
    );
    const allDays = [...bySource.values()].flatMap((s) => s.days);

    return {
      by_source,
      overall: {
        leads: totals.leads,
        booked: totals.booked,
        conversion_pct: conversionPct(totals.booked, totals.leads),
        median_days: median(allDays),
      },
      leads_total: leads.length,
      leads_with_email: leadByEmail.size,
      definition:
        'Email join, one lead per unique email (earliest record, its source attributed). A lead converts when a ' +
        'paid booking (Status "Done", Rate > 1 BHD) exists on/after lead creation (24h grace for the ' +
        'booking-creates-lead ordering). Direct bookers who never became leads are not counted.',
    };
  }

  /** Repeat-booking cohorts: cohort = month of a patient's FIRST paid
   *  booking; we then track the share booking again within 1/2/3 months,
   *  plus repeat revenue. Purchase retention with real identity, distinct
   *  from the anonymous device-level Mixpanel matrices. */
  private computeBookingCohorts(
    bookings: BookingRecord[],
  ): BookingCohortsPayload {
    // Identity is the Patient lookup id (paid bookings carry the lookup
    // while their Email field is empty); booking email is the fallback.
    const byPatient = new Map<string, Array<{ date: string; rate: number }>>();
    for (const b of bookings) {
      if (b.Status !== DONE_STATUS) continue;
      const rate = parseFloat(String(b.Rate)) || 0;
      if (rate <= MIN_RATE_BHD) continue;
      const identity = b.Patient?.id || normalizedEmail(b.Email);
      if (!identity) continue;
      const date = b.Created_At || b.Created_Time;
      if (!date) continue;
      const list = byPatient.get(String(identity)) ?? [];
      list.push({ date, rate });
      byPatient.set(String(identity), list);
    }
    for (const list of byPatient.values()) {
      list.sort(
        (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime(),
      );
    }

    const bh = bahrainNow();
    const nowIdx = bh.getUTCFullYear() * 12 + bh.getUTCMonth();

    interface CohortAcc {
      key: string;
      label: string;
      idx: number;
      size: number;
      repeat_1m: number;
      repeat_2m: number;
      repeat_3m: number;
      repeat_revenue: number;
      first_revenue: number;
    }
    const cohorts: CohortAcc[] = [];
    for (let i = COHORT_COUNT - 1; i >= 0; i--) {
      const idx = nowIdx - i;
      const y = Math.floor(idx / 12);
      const m = idx % 12;
      cohorts.push({
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: `${MONTH_NAMES[m]} ${y}`,
        idx,
        size: 0,
        repeat_1m: 0,
        repeat_2m: 0,
        repeat_3m: 0,
        repeat_revenue: 0,
        first_revenue: 0,
      });
    }
    const cohortByIdx = new Map(cohorts.map((c) => [c.idx, c]));

    let identifiedPatients = 0;
    for (const list of byPatient.values()) {
      identifiedPatients += 1;
      const first = list[0];
      const firstIdx = monthIndex(first.date);
      const cohort = cohortByIdx.get(firstIdx);
      if (!cohort) continue; // First booking predates the window.

      cohort.size += 1;
      cohort.first_revenue += first.rate;

      let within1 = false;
      let within2 = false;
      let within3 = false;
      for (const b of list.slice(1)) {
        const gap = monthIndex(b.date) - firstIdx;
        if (gap >= 0 && gap <= 1) within1 = true;
        if (gap >= 0 && gap <= 2) within2 = true;
        if (gap >= 0 && gap <= 3) within3 = true;
        cohort.repeat_revenue += b.rate;
      }
      if (within1) cohort.repeat_1m += 1;
      if (within2) cohort.repeat_2m += 1;
      if (within3) cohort.repeat_3m += 1;
    }

    return {
      cohorts: cohorts.map((c) => {
        const pct = (n: number) =>
          c.size > 0 ? Math.round((n / c.size) * 100) : 0;
        // A <=N-month window includes repeats landing anywhere in month
        // cohort+N, so it is only final once that month has fully ended,
        // i.e. nowIdx - idx >= N + 1. Immature windows stay null (pending).
        return {
          key: c.key,
          label: c.label,
          size: c.size,
          repeat_1m_pct: nowIdx - c.idx >= 2 ? pct(c.repeat_1m) : null,
          repeat_2m_pct: nowIdx - c.idx >= 3 ? pct(c.repeat_2m) : null,
          repeat_3m_pct: nowIdx - c.idx >= 4 ? pct(c.repeat_3m) : null,
          repeat_revenue: Math.round(c.repeat_revenue),
          first_revenue: Math.round(c.first_revenue),
        };
      }),
      identified_patients: identifiedPatients,
      definition:
        'Cohort = month of first paid booking (Status "Done", Rate > 1 BHD) per unique patient (Patient lookup id). ' +
        'Repeat % = share of the cohort booking again within N calendar months of their first booking. ' +
        'Repeat revenue = all paid bookings after the first, attributed to the cohort.',
    };
  }

  /** Rate limited with nothing saved yet: null data plus the busy reason.
   *  Anything else keeps throwing (the handler envelopes it). */
  private rateLimitedOrThrow<T>(err: unknown): GrowthResult<T> {
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

// globalThis-pinned singleton: mirrors the single DI provider in Nest, sharing
// the warm Mixpanel client (its in-flight map and 4-slot semaphore) and the
// warm CRM read cache across both growth routes within one warm instance.
const GROWTH_KEY = '__growthService';

type GlobalWithGrowth = typeof globalThis & {
  [GROWTH_KEY]?: GrowthService;
};

export function getGrowthService(): GrowthService {
  const g = globalThis as GlobalWithGrowth;
  if (!g[GROWTH_KEY]) {
    g[GROWTH_KEY] = new GrowthService(getMixpanel(), getCrmRead());
  }
  return g[GROWTH_KEY];
}

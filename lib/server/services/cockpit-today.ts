// The unified "Today" list: the cockpit home. ONE row per case, merging the
// SLA governing clock (from the queue) with that case's open inbound messages
// and the top AI suggestion (from the inbox). A case shows up when it is due now
// or today, OR when it has an open message. Everything keys on the Zoho record
// id, so the timer-world and the message-world collapse into a single ranked
// to-do list. Derived-only rows (pure SLA, no message) carry no dismiss; their
// clock clears when Zoho state moves.
//
// Reuses cockpitService.queue() (SLA clocks) and channel-events.inbox() (stored
// events), so there is no new data source and no materialised queue. SERVER ONLY.
import { cockpitService } from './cockpit';
import { inbox, type InboxEventOut } from './channel-events';
import type { RequestViewer } from '../auth/viewer';
import type { SourceMeta } from '../envelope';
import { getSummaries } from './case-summary';
import type { SuggestedChange } from './triage';

export interface TodayRow {
  // The case reference, or null for an unmatched inbound (a new number).
  lead_ref: {
    zoho_id: string;
    initials: string;
    ref: string;
    ref_is_fallback: boolean;
  } | null;
  patient_name?: string;
  record_type: 'lead' | 'deal' | null;
  pipeline: string | null;
  stage_or_status: string | null;
  next_action: string | null;
  // The SLA clock for the case, or null when it is only here for a message.
  due: { label: string; tone: string; kind: string } | null;
  approx: boolean;
  // Open messages for this case (may be empty for a pure-SLA row).
  events: InboxEventOut[];
  urgency_rank: number;
  // Proactive AI summary + suggestion (from the manual refresh, case state not a
  // message). The message summary/suggestion above takes priority; these are the
  // fallback for a silent-but-active case. ai_summary is name-seer gated.
  ai_summary?: string | null;
  ai_suggestion?: { change: SuggestedChange; stage_at: string | null } | null;
}

export interface TodayData {
  rows: TodayRow[];
  counts: { total: number; due_now: number; messages: number };
}

const CLOCK_RANK: Record<string, number> = {
  due_now: 3,
  due_today: 2,
  soon: 1,
  on_track: 0,
};
const URGENCY_RANK: Record<string, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

function eventsRank(events: InboxEventOut[]): number {
  let max = -1;
  for (const e of events) {
    const r = URGENCY_RANK[e.triage?.urgency ?? 'low'] ?? 0;
    if (r > max) max = r;
  }
  return max;
}

/** Merge the SLA queue and the inbox into one ranked "Today" list. */
export async function today(
  viewer: RequestViewer,
  person: string,
): Promise<{ data: TodayData; parts: SourceMeta[] }> {
  const [{ data: q, parts }, ib] = await Promise.all([
    cockpitService.queue(person, viewer),
    inbox(viewer),
  ]);

  // Index the SLA queue items by their Zoho id.
  const queueByo = new Map<string, (typeof q.active)[number]>();
  for (const item of q.active) queueByo.set(item.lead_ref.zoho_id, item);

  // Index the inbox groups by their matched Zoho id (matched groups only here;
  // unmatched groups are handled separately below).
  const groupByo = new Map<string, (typeof ib.groups)[number]>();
  const unmatched: typeof ib.groups = [];
  for (const g of ib.groups) {
    if (g.case) groupByo.set(g.case.patient_ref.zoho_id, g);
    else unmatched.push(g);
  }

  const rows: TodayRow[] = [];

  // Every case with a due-now/due-today clock OR an open message.
  const ids = new Set<string>([...queueByo.keys(), ...groupByo.keys()]);
  for (const id of ids) {
    const item = queueByo.get(id);
    const group = groupByo.get(id);
    const events = group ? group.events : [];
    const clockKind = item?.due.kind ?? null;
    const isDue = clockKind === 'due_now' || clockKind === 'due_today';
    if (!isDue && events.length === 0) continue; // on-track + no message = not today

    const ref = item?.lead_ref ?? group?.case?.patient_ref ?? null;
    const rank = Math.max(
      clockKind ? (CLOCK_RANK[clockKind] ?? 0) : 0,
      eventsRank(events),
    );
    rows.push({
      lead_ref: ref,
      patient_name: item?.patient_name ?? group?.case?.patient_name,
      record_type: item?.record_type ?? group?.case?.kind ?? null,
      pipeline: item?.pipeline ?? group?.case?.pipeline ?? null,
      stage_or_status: group?.case?.stage_or_status ?? item?.step ?? null,
      next_action: item?.next_action ?? null,
      due: item ? item.due : null,
      approx: item?.approx ?? false,
      events,
      urgency_rank: rank,
    });
  }

  // Unmatched inbound (a new number nobody is on yet): always worth a look.
  for (const g of unmatched) {
    rows.push({
      lead_ref: null,
      record_type: null,
      pipeline: null,
      stage_or_status: null,
      next_action: null,
      due: null,
      approx: false,
      events: g.events,
      urgency_rank: Math.max(2, eventsRank(g.events)),
    });
  }

  // Attach proactive summaries/suggestions from the store. ai_summary is
  // name-seer gated (may phrase case detail); the suggestion is an action.
  const seesNames = viewer.sees_patient_names;
  const summaryIds = rows
    .map((r) => r.lead_ref?.zoho_id)
    .filter((x): x is string => Boolean(x));
  const summaries = await getSummaries(summaryIds);
  for (const r of rows) {
    const zid = r.lead_ref?.zoho_id;
    const s = zid ? summaries.get(zid) : undefined;
    if (!s) continue;
    if (seesNames && s.summary) r.ai_summary = s.summary;
    if (s.suggested_change) r.ai_suggestion = { change: s.suggested_change, stage_at: s.stage_at };
  }

  // Most urgent first; within the same urgency, a waiting message beats a silent
  // timer (a reply needs a human now, an overdue clock is background pressure).
  rows.sort((a, b) => {
    if (b.urgency_rank !== a.urgency_rank) return b.urgency_rank - a.urgency_rank;
    return (b.events.length > 0 ? 1 : 0) - (a.events.length > 0 ? 1 : 0);
  });

  const dueNow = rows.filter((r) => r.due?.kind === 'due_now').length;
  const withMsg = rows.filter((r) => r.events.length > 0).length;

  return {
    data: { rows, counts: { total: rows.length, due_now: dueNow, messages: withMsg } },
    parts,
  };
}

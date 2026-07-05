// The reactive event spine. Inbound patient messages (WhatsApp in v1; email and
// calls plug into the same table later) are ingested here, matched to a Zoho
// lead/deal, triaged, and read back as a grouped "needs action" inbox. Writes to
// our own Postgres only (channel_events); no Zoho write, so it is NOT
// WRITE_GATE_ENABLED-gated.
//
// PRIVACY (NHRA): message content and the sender phone are patient data. They
// are stored so the manager can read them, purged after retention (a lazy UPDATE
// on each ingest), gated per viewer on read (message_snippet / patient_phone for
// name-seers only), and NEVER logged or audited (audit rows carry counts only).
// The patient NAME is never stored; the inbox enriches matched ids from the
// cached CRM read at display time.
//
// SERVER ONLY.
import { getPool } from '../db';
import { getCrmRead } from '../crm-read';
import { getAudit } from '../audit';
import {
  searchByPhone,
  buildMatch,
  type PatientSearchMatch,
} from './patient-search';
import { cockpitService } from './cockpit';
import { governingClock } from './sla';
import {
  rulesTriage,
  aiRefine,
  type Triage,
  type TriageContext,
} from './triage';
import type { RequestViewer } from '../auth/viewer';

// ---- shapes returned to the routes (mirrored in lib/api/contract.ts) ----

export interface IngestResult {
  inserted: number;
  duplicates: number;
  resolved: number;
  matched: { kind: 'lead' | 'deal'; zoho_id: string } | null;
}

export interface InboxEventOut {
  id: string;
  channel: 'whatsapp' | 'email' | 'call';
  occurred_at: string;
  status: 'open';
  message_snippet?: string | null;
  triage: Triage | null;
}

export interface InboxGroupOut {
  case: PatientSearchMatch | null;
  patient_phone?: string | null;
  events: InboxEventOut[];
}

export interface InboxOut {
  groups: InboxGroupOut[];
  counts: { open: number; urgent: number };
}

const WA = 'whatsapp' as const;
const CAPTURE_WINDOW_SEC = 72 * 60 * 60;

// WhatsApp `t` is epoch seconds; guard a stray millisecond value.
function toSeconds(ts: number): number {
  return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

const URGENCY_RANK: Record<string, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

/** Build the de-identified triage context for a matched case by reading its
 *  cockpit step + governing clock. A matched record outside the cockpit
 *  population (e.g. a deal in a non-patient pipeline) degrades to no step/clock,
 *  which the rules treat as a plain reply. */
async function triageContextFor(
  matched: { kind: 'lead' | 'deal'; zoho_id: string } | null,
): Promise<TriageContext> {
  if (!matched) {
    return {
      matched: false,
      kind: null,
      step: null,
      stage_or_status: null,
      pipeline: null,
      clock: null,
    };
  }
  const { cases } = await cockpitService.population();
  const c = cases.find((x) => x.zoho_id === matched.zoho_id);
  if (!c) {
    return {
      matched: true,
      kind: matched.kind,
      step: null,
      stage_or_status: null,
      pipeline: null,
      clock: null,
    };
  }
  const clock = governingClock(c.clockInputs, new Date());
  return {
    matched: true,
    kind: matched.kind,
    step: c.step,
    stage_or_status: c.recordType === 'deal' ? c.stage : c.leadStatus,
    pipeline: c.pipeline,
    clock: { kind: clock.kind, sla_key: clock.sla_key },
  };
}

interface IngestMessage {
  external_id: string;
  from_me: boolean;
  ts: number;
  body?: string;
}

/** Ingest a batch of the active chat's trailing messages. Dedupes on
 *  (channel, external_id); uses the newest from_me timestamp as the
 *  already-answered cutoff and to auto-resolve open events she replied to.
 *  AI triage runs once per ingest over the case's open unanswered burst and
 *  is stored on the newest open row. */
export async function ingestWhatsapp(
  viewer: RequestViewer,
  chatPhone: string,
  messages: IngestMessage[],
): Promise<IngestResult> {
  const pool = getPool();

  // Retention purge: null out expired content + phone, keep metadata/triage.
  const purged = await pool.query(
    `update channel_events set content = null, sender_phone = null
     where content_expires_at < now() and content is not null`,
  );

  // Match the chat phone to a Zoho record (cached suffix match).
  const matches = await searchByPhone(chatPhone, viewer);
  const top = matches[0];
  const matched = top
    ? { kind: top.kind, zoho_id: top.patient_ref.zoho_id }
    : null;

  // The already-answered cutoff: the newest outgoing message in this batch.
  const fromMeTs = messages
    .filter((m) => m.from_me)
    .reduce<number | null>(
      (max, m) => Math.max(max ?? 0, toSeconds(m.ts)) || null,
      null,
    );

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = fromMeTs ?? 0;
  const candidates = messages
    .filter((m) => !m.from_me && m.body)
    .map((m) => ({ ...m, sec: toSeconds(m.ts) }))
    .filter((m) => m.sec > cutoff && m.sec > nowSec - CAPTURE_WINDOW_SEC);

  let inserted = 0;
  // One triage context for the chat; rules are identical per candidate.
  const ctx = await triageContextFor(matched);
  const base = rulesTriage(ctx);
  if (candidates.length > 0) {
    const rows = candidates.map((m) => ({
      external_id: m.external_id,
      sec: m.sec,
      body: (m.body ?? '').slice(0, 4000),
      triage: base,
    }));

    const params: unknown[] = [];
    const tuples = rows.map((r) => {
      const off = params.length;
      params.push(
        r.external_id,
        r.sec,
        viewer.key,
        matched?.kind ?? null,
        matched?.zoho_id ?? null,
        chatPhone,
        r.body,
        r.body.length,
        JSON.stringify(r.triage),
      );
      return `('${WA}', $${off + 1}, to_timestamp($${off + 2}), $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7}, $${off + 8}, $${off + 9}::jsonb)`;
    });

    const res = await pool.query(
      `insert into channel_events
         (channel, external_id, occurred_at, ingested_by, matched_kind, matched_zoho_id, sender_phone, content, content_length, triage)
       values ${tuples.join(', ')}
       on conflict (channel, external_id) do nothing
       returning id`,
      params,
    );
    inserted = res.rowCount ?? 0;
  }

  // Late-match backfill: prior unmatched history for this phone adopts the lead
  // the moment a match exists.
  if (matched) {
    await pool.query(
      `update channel_events set matched_kind = $1, matched_zoho_id = $2
       where matched_zoho_id is null and sender_phone = $3`,
      [matched.kind, matched.zoho_id, chatPhone],
    );
  }

  // Reply auto-resolve: open events at or before the newest outgoing message
  // were answered in WhatsApp itself.
  let resolvedReplied = 0;
  if (fromMeTs != null) {
    const q = matched
      ? await pool.query(
          `update channel_events set status='actioned', resolution='replied_on_whatsapp', resolved_at=now()
           where status='open' and channel=$1 and matched_zoho_id=$2 and occurred_at <= to_timestamp($3)`,
          [WA, matched.zoho_id, fromMeTs],
        )
      : await pool.query(
          `update channel_events set status='actioned', resolution='replied_on_whatsapp', resolved_at=now()
           where status='open' and channel=$1 and matched_zoho_id is null and sender_phone=$2 and occurred_at <= to_timestamp($3)`,
          [WA, chatPhone, fromMeTs],
        );
    resolvedReplied = q.rowCount ?? 0;
  }

  // Burst-aware AI refine: gather the case's open unanswered inbound burst,
  // oldest to newest, and refine ONCE over the whole thing. The suggestion is
  // stored on the newest open row so the per-case group surfaces it. Older
  // rows keep rules triage; a superseded AI suggestion on an older row is
  // nulled so the full-picture read always wins in pickSuggestion.
  if (inserted > 0) {
    const burst = matched
      ? await pool.query<{ id: string; content: string }>(
          `select id, content from channel_events
           where status = 'open' and channel = $1
             and (matched_zoho_id = $2 or (matched_zoho_id is null and sender_phone = $3))
             and content is not null
           order by occurred_at desc limit 10`,
          [WA, matched.zoho_id, chatPhone],
        )
      : await pool.query<{ id: string; content: string }>(
          `select id, content from channel_events
           where status = 'open' and channel = $1
             and matched_zoho_id is null and sender_phone = $2
             and content is not null
           order by occurred_at desc limit 10`,
          [WA, chatPhone],
        );
    if (burst.rows.length > 0) {
      const newestId = burst.rows[0].id;
      const bodies = burst.rows.map((r) => r.content).reverse(); // oldest first
      const aiTriage = await aiRefine(base, ctx, bodies);
      if (aiTriage !== base) {
        await pool.query(
          `update channel_events set triage = $1::jsonb where id = $2`,
          [JSON.stringify(aiTriage), newestId],
        );
        await pool.query(
          `update channel_events
           set triage = jsonb_set(triage, '{suggested_change}', 'null')
           where status = 'open' and channel = $1 and id <> $2
             and (matched_zoho_id = $3 or (matched_zoho_id is null and sender_phone = $4))
             and triage ->> 'source' = 'ai'
             and triage -> 'suggested_change' is not null`,
          [WA, newestId, matched?.zoho_id ?? null, chatPhone],
        );
      }
    }
  }

  const duplicates = Math.max(0, candidates.length - inserted);

  // Audit counts only, never body or phone.
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'events.ingest',
    entity_type: 'channel_events',
    entity_id: matched?.zoho_id ?? null,
    context: {
      channel: WA,
      inserted,
      duplicates,
      resolved_replied: resolvedReplied,
      purged: purged.rowCount ?? 0,
      matched: matched != null,
    },
  });

  return { inserted, duplicates, resolved: resolvedReplied, matched };
}

interface EventRow {
  id: string;
  channel: 'whatsapp' | 'email' | 'call';
  occurred_at: Date;
  matched_kind: 'lead' | 'deal' | null;
  matched_zoho_id: string | null;
  sender_phone: string | null;
  content: string | null;
  triage: Triage | null;
}

/** The triage as sent to a viewer: the AI summary can echo message content, so
 *  it is stripped for anyone who may not see patient names. Everything else in
 *  triage is non-identifying routing state. */
function gateTriage(t: Triage | null, seesNames: boolean): Triage | null {
  if (!t || seesNames || t.summary === undefined) return t;
  const { summary: _summary, ...rest } = t;
  return rest;
}

/** The open inbox, grouped per matched case (or per sender phone when
 *  unmatched), enriched from the cached CRM read and gated per viewer. */
export async function inbox(viewer: RequestViewer): Promise<InboxOut> {
  const pool = getPool();
  const { rows } = await pool.query<EventRow>(
    `select id, channel, occurred_at, matched_kind, matched_zoho_id, sender_phone, content, triage
     from channel_events where status='open' order by occurred_at desc limit 200`,
  );
  if (rows.length === 0) return { groups: [], counts: { open: 0, urgent: 0 } };

  const seesNames = viewer.sees_patient_names;
  const crm = getCrmRead();
  const [deals, leads] = await Promise.all([crm.deals(), crm.leads()]);

  const groupMap = new Map<string, EventRow[]>();
  for (const r of rows) {
    const key = r.matched_zoho_id ?? `phone:${r.sender_phone ?? ''}`;
    const arr = groupMap.get(key);
    if (arr) arr.push(r);
    else groupMap.set(key, [r]);
  }

  const groups: InboxGroupOut[] = [];
  for (const evts of groupMap.values()) {
    const head = evts[0];
    let matchCase: PatientSearchMatch | null = null;
    let patientPhone: string | null | undefined;

    if (head.matched_zoho_id) {
      if (head.matched_kind === 'deal') {
        const d = deals.data.find((x) => x.id === head.matched_zoho_id);
        if (d) {
          matchCase = buildMatch(
            'deal',
            d.id,
            d.Zoho_ID,
            d.Contact_Name?.name ?? d.Deal_Name ?? null,
            d.Stage ?? null,
            d.Pipeline ?? null,
            d.Owner?.name ?? null,
            viewer,
          );
        }
      } else {
        const l = leads.data.find((x) => x.id === head.matched_zoho_id);
        if (l) {
          matchCase = buildMatch(
            'lead',
            l.id,
            l.Zoho_ID,
            [l.First_Name, l.Last_Name].filter(Boolean).join(' ') || null,
            l.Lead_Status ?? null,
            null,
            l.Owner?.name ?? null,
            viewer,
          );
        }
      }
    } else if (seesNames) {
      patientPhone = head.sender_phone ?? null;
    }

    const events: InboxEventOut[] = evts.map((e) => {
      const out: InboxEventOut = {
        id: e.id,
        channel: e.channel,
        occurred_at: e.occurred_at.toISOString(),
        status: 'open',
        triage: gateTriage(e.triage ?? null, seesNames),
      };
      // Snippet is patient content: name-seers only. null signals "purged".
      if (seesNames) out.message_snippet = e.content ? e.content.slice(0, 160) : null;
      return out;
    });

    groups.push({ case: matchCase, patient_phone: patientPhone, events });
  }

  // Sort groups by their most urgent event, then by their newest event.
  const rank = (g: InboxGroupOut) =>
    Math.max(...g.events.map((e) => URGENCY_RANK[e.triage?.urgency ?? 'low'] ?? 0));
  groups.sort((a, b) => {
    const r = rank(b) - rank(a);
    if (r !== 0) return r;
    return b.events[0].occurred_at.localeCompare(a.events[0].occurred_at);
  });

  const urgent = rows.filter((r) => r.triage?.urgency === 'urgent').length;
  return { groups, counts: { open: rows.length, urgent } };
}

/** Open events for one matched case, newest first. Powers the extension panel
 *  strip (that route is already name-seer gated, so snippets ride along). */
export async function openEventsForCase(
  zohoId: string,
  viewer: RequestViewer,
  limit = 10,
): Promise<InboxEventOut[]> {
  const { rows } = await getPool().query<EventRow>(
    `select id, channel, occurred_at, matched_kind, matched_zoho_id, sender_phone, content, triage
     from channel_events where status='open' and matched_zoho_id=$1 order by occurred_at desc limit $2`,
    [zohoId, limit],
  );
  const seesNames = viewer.sees_patient_names;
  return rows.map((e) => {
    const out: InboxEventOut = {
      id: e.id,
      channel: e.channel,
      occurred_at: e.occurred_at.toISOString(),
      status: 'open',
      triage: gateTriage(e.triage ?? null, seesNames),
    };
    if (seesNames) out.message_snippet = e.content ? e.content.slice(0, 160) : null;
    return out;
  });
}

/** Manually resolve events (done -> actioned, dismiss -> dismissed). */
export async function resolveEvents(
  viewer: RequestViewer,
  ids: string[],
  action: 'done' | 'dismiss',
): Promise<number> {
  const status = action === 'dismiss' ? 'dismissed' : 'actioned';
  const res = await getPool().query(
    `update channel_events set status=$1, resolution='manual', resolved_by=$2, resolved_at=now()
     where id = any($3::uuid[]) and status='open'`,
    [status, viewer.key, ids],
  );
  const count = res.rowCount ?? 0;
  await getAudit().log({
    actor: viewer.key,
    actor_role: viewer.role,
    action: 'events.resolve',
    entity_type: 'channel_events',
    context: { count, action },
  });
  return count;
}


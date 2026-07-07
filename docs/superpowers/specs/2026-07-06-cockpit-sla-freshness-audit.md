# Cockpit stale-after-write audit (SLA / next action reverts on refresh)

Date: 2026-07-06 (resolved 2026-07-07)
Branch: `debug/cockpit-sla-freshness`
Status: RESOLVED. Two separate causes confirmed and fixed, plus a related cache
race. See "Resolution (2026-07-07)" at the end. The original ranked hypotheses
below are kept for the record; note the correction to item 3 under "Confirmed".

## Symptom

In the cockpit, updating a case (status, and a follow-up date) writes to Zoho
correctly, but refreshing the page can show the pre-update value. Reported
concretely as the SLA / next action moving off "contact now" to a few days
later, or reverting to the old value, on refresh. Seen on Vercel; now also being
checked on a local run.

## How the SLA is derived (so we know what "reverts" means)

`lib/server/services/sla.ts` computes one governing clock per case, anchored on
the time the record entered its CURRENT status or stage:

- Deal: `Stage_Entry_Date`.
- Lead: `Last_Status_Change`, which a Zoho workflow stamps on every
  `Lead_Status` change (and at creation).
- Fallback: the record's created time, marked approx.

So changing status resets the anchor to "now," which restarts the clock and
moves the due label out (for example first_contact is 24 business hours,
partner_quotes is 3 days, reports_window is 7 to 10 days). "Contact now becoming
days later" is the anchor resetting. The bug is that a refresh can show the OLD
anchor or the OLD status.

## Confirmed by reading the code

1. The case file reads the single record LIVE and uncached
   (`crm.dealById` / `crm.leadById`) and computes the SLA from that live anchor
   (`caseFile()` in `lib/server/services/cockpit.ts`). It should be fresh on
   refresh.
2. The queue, priorities, and parked lists come from `population()`, which reads
   the CACHED `crm.deals()` and `crm.leads()` lists, so their SLA is computed
   from the cached anchor.
3. Every cockpit write handler writes to Zoho and then calls
   `getCrmRead().invalidate()` (`lib/server/services/cockpit-write.ts`, six
   sites). CORRECTION (2026-07-07): the call is made, but it busted the WRONG
   key. `deals()` reads under `zoho_crm:deals_v10` while `invalidate()` deleted
   `zoho_crm:deals_v9` (the pre-bump key), and `cache.invalidate` matches by
   exact key, so deal writes never cleared the deals list. That is a real
   missing-invalidation bug for deals; this original claim was wrong. Leads were
   consistent (`leads_v7` both sides).
4. The cache is two-tier (`lib/server/cache.ts`): a per-instance in-memory L1
   and a shared L2 in Postgres (`cache_entries`). `invalidate()` clears the
   writing instance's L1 and deletes the shared L2 row, but cannot reach any
   other warm instance's L1, which keeps serving its pre-write copy until its
   own TTL (`zoho_crm` is 10 minutes).
5. Zoho's v8 docs: a GET by record id is read-after-write consistent and there
   is no documented response cache serving stale data. Stale-after-write is
   attributed to client/own caching, concurrency, or workflow-triggered changes
   that have not finished yet. See
   https://www.zoho.com/crm/developer/docs/api/v8/get-records.html and
   https://www.zoho.com/crm/developer/docs/api/v8/update-records.html

## Candidate root causes (ranked)

1. Cross-instance L1 cache staleness (Vercel, multi-instance). The queue and
   list SLA are served from the cached deals/leads list, and after a write only
   the writing instance's L1 and the shared L2 are cleared. A refresh routed to
   a different warm instance serves that instance's pre-write L1 for up to 10
   minutes. Does NOT reproduce on a single local instance, because a local
   refresh cold-misses L1 and L2 and refetches fresh.
2. Zoho workflow lag on the anchor. `Last_Status_Change` is stamped by a Zoho
   workflow, not by the cockpit write. If the workflow has not completed when
   the case file live-reads the record, the live read returns the new status but
   the old anchor, so even the live case-file SLA is momentarily wrong. This
   WOULD reproduce locally.

Both can be true at once. The local run is the clean way to separate them: on a
single instance the cache cause cannot occur, so anything stale locally points
at cause 2 (or a failing L2 delete).

## Assumptions and how each is validated

- A1. Case file reads live and is fresh. Validate with the `SLA_DEBUG` log on a
  refresh right after a write: did the anchor advance to the write time?
- A2. Queue and lists read the cached deals/leads. Validate by code (above) and
  by comparing the queue row's SLA against the case file's SLA for the same
  record.
- A3. Every write invalidates. Validated by code (six invalidate sites).
- A4. `invalidate()` cannot clear another instance's L1, so lists go stale
  cross-instance. Validate deterministically with
  `node scripts/validate-cache-cross-instance.mjs`.
- A5. The SLA is anchored on the status-change time. Validated by code (sla.ts)
  and shown in the `SLA_DEBUG` log (`anchor=` and `due=`).
- A6. Zoho workflow lag can leave the anchor stale on a live read. The decisive
  local test: the `SLA_DEBUG` log right after a status write. If the anchor did
  not advance, the workflow had not stamped yet.
- A7. Zoho does not cache single-record reads. Validated by the Zoho docs above
  and by A6 (a fresh anchor on the live read means Zoho is current).

## Local reproduction procedure

1. Start dev with the diagnostic on: `SLA_DEBUG=1 npm run dev` (PowerShell:
   `$env:SLA_DEBUG='1'; npm run dev`).
2. Open a case in the cockpit and note its `[sla-debug] caseFile ...` line: the
   `anchor`, `leadStatus`/`stage`, and `due`.
3. Update the status (and set the follow-up), then hard-refresh the case.
4. Read the new `[sla-debug] caseFile ...` line and compare:
   - Anchor advanced to about now and `due` moved as expected: the live case
     file is correct. Any staleness you saw is the cached list on Vercel
     (cause 1); it will not show locally.
   - Status advanced but anchor unchanged (still the old time): Zoho had not
     stamped the new `Last_Status_Change` yet (cause 2, workflow lag).
   - Neither advanced: the live read itself is not seeing the write; capture the
     line and we dig into the write path and Zoho response.
5. Separately, on the cockpit home/queue, compare the SLA shown for that case
   against the case-file value to see the cached-list divergence.

## Fix directions (deferred until a cause is confirmed)

- If cause 1 (cross-instance cache): make invalidation effective across
  instances with a small shared invalidation token in L2 that reads check
  cheaply, so other instances drop their stale L1 at once instead of waiting out
  the TTL; or read the queue's changed rows live like the case file does.
- If cause 2 (workflow lag): stamp the anchor directly in the cockpit write
  (write `Last_Status_Change` alongside `Lead_Status`) rather than relying on
  the async workflow, so the live read is always consistent.

No fix is applied on this branch. This is the audit and the validation
harness only.

## Resolution (2026-07-07)

The reported symptom was two different problems reported as one, and only one of
them was a cache issue.

1. Deal status changes looked stale on refresh: a real cache-invalidation bug.
   `deals()` reads/writes `zoho_crm:deals_v10` but `invalidate()` deleted
   `zoho_crm:deals_v9` (the read key was bumped v9 to v10 per the
   2026-06-29 design spec; the invalidate call was not). Since `cache.invalidate`
   matches by exact key, no deal write ever busted the deals list, so
   `queue()` / `parked()` served the pre-write deals (and their SLA) for up to
   the 10-minute `zoho_crm` TTL, on a single instance and on Vercel. This is
   distinct from, and larger than, the cross-instance L1 hypothesis (cause 1),
   because it fails even locally. Fix: the invalidate now busts `deals_v10` (and
   `leads_v8`), and a comment ties the keys together. The single-case file was
   never affected: it reads live via `dealById` / `leadById`.

2. Setting a follow-up date still showed "due now": NOT a cache issue at all.
   `governingClock` never read `Next_Follow_up`, so the follow-up date had no
   effect on the SLA "due" and a case past its step threshold stayed "due now"
   regardless of the follow-up saved. Product decision (Mohammad, 2026-07-07):
   a set follow-up date OVERRIDES the status clock for any active case and
   becomes the single "when to act next" indicator (flowing through the label,
   the due-now / due-today tiles, and the queue sort). Format: passed = "Due
   now"; under 24h = hours ("In 7h"); else short date ("Jul 12"). The follow-up
   is a calendar date, so its time of day is taken from the record's
   `Modified_Time` (when the follow-up was saved), read in Bahrain; `Leads` did
   not carry that field in the cached read, so it was added (leads key v7 to v8).
   Parked cases ignore the follow-up. Behavior implication accepted by the team:
   a future follow-up pulls a case off the due-now list (an intentional snooze).

3. Related cache race, fixed defensively. Even with a correct key, `read()`
   serves a stale hit and fires a background revalidation whose upstream snapshot
   can predate a concurrent write, then writes it back AFTER that write's
   `invalidate()` cleared the entry, resurrecting the stale value for a full TTL.
   Fix: a per-key generation counter in `CacheService`; `invalidate()` bumps it,
   and both fetch-then-write paths (cold miss and background revalidation) refuse
   to persist a snapshot whose generation changed while they were fetching.

Not changed (secondary, still true): a lead's live case-file SLA can be briefly
wrong right after a status change because its anchor (`Last_Status_Change`) is
stamped by an async Zoho workflow, not by our write; and on Vercel other warm
instances still serve their own L1 list until the TTL (cause 1). Neither was the
primary reported symptom; both are noted for follow-up if they surface.

Verification: `scripts/verify-followup-sla.mjs` compiles the pure `sla.ts` and
asserts the follow-up override end to end against the real engine (10 checks).
`scripts/validate-cache-cross-instance.mjs` updated to the live `deals_v10` key.
`npm run ci` passes (dash / red / hype / patient checks, typecheck, lint). The
cache generation guard is covered by review and typecheck (CacheService is not
standalone-compilable and its timing is not easily driven without a harness).

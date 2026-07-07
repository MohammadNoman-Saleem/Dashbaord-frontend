-- channel_events: the reactive event spine. Inbound patient communications
-- (WhatsApp now; email and calls later on the same table) are ingested here,
-- matched to their Zoho lead/deal, triaged, and surfaced as an actionable inbox
-- in the cockpit and the extension side panel. Mirrors the table+RLS pattern of
-- 0023_whatsapp_templates.sql. Idempotent (if not exists), applied manually to
-- the shared Supabase.
--
-- PRIVACY (NHRA): patient message content lives in `content` and the sender
-- number in `sender_phone`; BOTH are nulled by the retention purge (a lazy
-- UPDATE run on each ingest) after `content_expires_at`. The patient NAME is
-- never stored here: the inbox enriches `matched_zoho_id` against the cached CRM
-- read at display time and gates the name per viewer. `content_length` survives
-- the purge for audit/debug. Audit rows for ingest carry counts only, never
-- body or phone.
--
-- RLS is enabled with no policy (default-deny): the service-role pool connects;
-- the anon browser bundle can never read or write it.

create table if not exists channel_events (
  id                 uuid primary key default gen_random_uuid(),
  channel            text not null check (channel in ('whatsapp', 'email', 'call')),
  external_id        text not null,
  occurred_at        timestamptz not null,
  ingested_at        timestamptz not null default now(),
  ingested_by        text not null,
  matched_kind       text check (matched_kind in ('lead', 'deal')),
  matched_zoho_id    text,
  sender_phone       text,
  content            text,
  content_length     int not null default 0,
  content_expires_at timestamptz not null default now() + interval '30 days',
  triage             jsonb,
  status             text not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),
  resolution         text
    check (resolution in ('manual', 'auto_write', 'replied_on_whatsapp')),
  resolved_by        text,
  resolved_at        timestamptz
);

-- Dedupe: one row per (channel, external_id). Ingest upserts with
-- `on conflict (channel, external_id) do nothing`, atomic under concurrent
-- batches (no advisory lock, no transaction).
create unique index if not exists channel_events_dedupe
  on channel_events (channel, external_id);

-- Inbox read: open events for a matched case, newest first.
create index if not exists channel_events_open
  on channel_events (matched_zoho_id, occurred_at desc)
  where status = 'open';

-- Purge scan: rows whose content is still present and past expiry.
create index if not exists channel_events_purge
  on channel_events (content_expires_at)
  where content is not null;

alter table channel_events enable row level security;

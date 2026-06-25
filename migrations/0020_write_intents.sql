-- write_intents: the cockpit write-gate's record of a proposed Zoho change
-- between prepare (validate, capture Modified_Time, persist pending) and commit
-- (re-check, write, audit, mark committed). Ported verbatim from the backend
-- migration 0020_write_intents.sql. The table exists in the backend's own repo
-- but was never applied to the shared Supabase, so the write-gate's prepare step
-- failed with "relation write_intents does not exist"; this file documents it
-- and must be applied to the shared Supabase. Idempotent (if not exists).
--
-- The partial unique index write_intents_committed_idem is what the serverless
-- idempotency rework relies on (one committed row per logical change), so it
-- must be present. RLS default-deny: the service role connects; the anon bundle
-- can never read or write it.

create table if not exists write_intents (
  id text primary key,
  actor_user_id text not null,
  resource_type text not null check (resource_type in ('deal', 'lead')),
  resource_id text not null,
  proposed_change jsonb not null,
  change_list_text text not null,
  base_modified_time timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'committed', 'expired', 'conflict')),
  idempotency_key text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  committed_at timestamptz
);

create unique index if not exists write_intents_committed_idem
  on write_intents (idempotency_key)
  where status = 'committed';

create index if not exists write_intents_resource
  on write_intents (resource_type, resource_id);

alter table write_intents enable row level security;

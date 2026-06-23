-- 0023_case_notes.sql
-- Cockpit patient notes. A net-new table read and written through the app's own
-- serverless routes (the urgent/blockers pattern: zod-validated, audited,
-- Postgres-only, no Zoho write). Notes live in the dashboard, not Zoho CRM.
--
-- Idempotent (if not exists) so it can be re-applied safely. Must be applied to
-- the shared Supabase before the notes feature works live.
--
-- RLS is enabled with NO policies: the app reaches this table only through the
-- service-role pool (db.ts), so service-role access bypasses RLS while the
-- legacy browser bundle's anon key is denied (matches every other new table).

create table if not exists case_notes (
  id          uuid primary key default gen_random_uuid(),
  zoho_id     text not null,            -- the case/deal/lead id the note attaches to
  author_key  text not null,           -- users.key of the author
  body        text not null,           -- free text, capped at 4000 chars at the route
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz              -- soft delete; null = active
);

create index if not exists case_notes_zoho_id_idx
  on case_notes (zoho_id)
  where deleted_at is null;

alter table case_notes enable row level security;  -- no policies; service-role only, like the other tables

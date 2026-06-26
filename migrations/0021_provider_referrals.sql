-- provider_referrals: the provider board's record of which patient (a Zoho lead
-- or deal) the case manager has sent to which hospital, and when. The board is a
-- Supabase view over live Zoho reads: the hospital list and the patient records
-- live in Zoho, but the assignment and the waiting clock live here because Zoho
-- has no patient->provider link at all. A patient may sit under several hospitals
-- at once (one active row per hospital). Mirrors the table+RLS pattern of
-- 0020_write_intents.sql. Idempotent (if not exists).
--
-- PRIVACY (NHRA): this table stores ONLY Zoho record ids and the hospital's
-- business name. It NEVER stores a patient name, phone, or budget. The card's
-- patient name is resolved live from Zoho at read time and gated to name-seers.
--
-- RLS is enabled with no policy (default-deny): the service-role pool connects;
-- the anon browser bundle can never read or write it.

create table if not exists provider_referrals (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   text not null,
  hospital_name text not null,
  record_kind   text not null check (record_kind in ('lead', 'deal')),
  zoho_id       text not null,
  added_by      text not null,
  added_at      timestamptz not null default now(),
  removed_at    timestamptz
);

-- One ACTIVE card per (hospital, patient): a patient appears once in a hospital
-- column. Removal is a soft delete (removed_at set), so the same patient can be
-- re-added later and the history is preserved.
create unique index if not exists provider_referrals_active_uniq
  on provider_referrals (hospital_id, zoho_id)
  where removed_at is null;

create index if not exists provider_referrals_active
  on provider_referrals (hospital_id)
  where removed_at is null;

alter table provider_referrals enable row level security;

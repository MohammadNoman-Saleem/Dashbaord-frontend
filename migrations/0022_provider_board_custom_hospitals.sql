-- provider_board_custom_hospitals: board-only ("ad hoc") hospitals a case
-- manager adds when sending a patient to a hospital not yet in the Zoho
-- Hospitals directory. These NEVER touch Zoho; they appear as extra columns on
-- the provider board under their chosen country, and patients are added to them
-- through provider_referrals exactly like a Zoho hospital (the referral stores
-- this record's id as its hospital_id). Mirrors the table+RLS pattern of
-- 0021_provider_referrals.sql. Idempotent (if not exists).
--
-- PRIVACY (NHRA): stores only a hospital business name, a country, and the actor
-- key. Never any patient data.
--
-- RLS default-deny: the service-role pool connects; the anon browser bundle can
-- never read or write it.

create table if not exists provider_board_custom_hospitals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     text not null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz
);

-- One ACTIVE custom hospital per name (case-insensitive), so the same ad-hoc
-- hospital is not added twice.
create unique index if not exists provider_board_custom_hospitals_active_name
  on provider_board_custom_hospitals (lower(name))
  where removed_at is null;

alter table provider_board_custom_hospitals enable row level security;

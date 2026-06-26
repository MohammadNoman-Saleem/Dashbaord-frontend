-- whatsapp_templates: an editable library of WhatsApp message templates the team
-- manages in-app. On a patient case, the case manager picks a template; the app
-- fills the placeholders and opens WhatsApp through a click-to-chat deep link
-- (wa.me) with the patient's number and the message pre-typed, then the manager
-- presses send. There is NO automated sending and NO WhatsApp API. Mirrors the
-- table+RLS pattern of 0021_provider_referrals.sql. Idempotent (if not exists).
--
-- PRIVACY (NHRA): templates carry NO patient data. A body holds only fixed copy
-- plus {{first_name}}/{{full_name}} placeholders, which are rendered client-side
-- from the case's patient name at send time and never stored here.
--
-- RLS is enabled with no policy (default-deny): the service-role pool connects;
-- the anon browser bundle can never read or write it.

create table if not exists whatsapp_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  removed_at  timestamptz
);

create index if not exists whatsapp_templates_active
  on whatsapp_templates (title)
  where removed_at is null;

alter table whatsapp_templates enable row level security;

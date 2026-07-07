-- case_summaries: proactive AI status per active cockpit case. Generated from
-- case STATE (stage, step, how long it has sat, SLA clock) with no message, on a
-- manual "Refresh summaries" click. One row per Zoho lead/deal. The Today list
-- reads it as the row's context line + a suggested action, so a silent-but-active
-- case is still actionable. Recomputed only when state_fingerprint changes.
-- Mirrors the table+RLS pattern of 0024/0025 (idempotent, RLS enable no policy,
-- applied manually to the shared Supabase; service-role pool only).
--
-- PRIVACY (NHRA): the summary is derived from de-identified state (no name/phone
-- sent to the model) but may phrase case detail, so it is gated to name-seers on
-- read. No patient identifiers stored: the Zoho record id is the key, the rest is
-- routing state.

create table if not exists case_summaries (
  zoho_id           text primary key,
  summary           text,
  suggested_change  jsonb,
  stage_at          text,
  state_fingerprint text,
  model             text,
  updated_at        timestamptz not null default now()
);

alter table case_summaries enable row level security;

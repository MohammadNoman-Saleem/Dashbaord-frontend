-- bedrock_usage: one row per Bedrock (Nova) model call, for the AI-costs page.
-- We meter our OWN token usage (returned by the Converse API) and compute USD
-- from a fixed per-model price, so the cost is EXACT and real-time - it does not
-- wait on AWS Cost Explorer's ~1-day billing lag. The AI-costs page sums this.
-- Mirrors the table+RLS pattern of 0020-0024 (idempotent, RLS enable no policy,
-- applied manually to the shared Supabase; service-role pool only).
--
-- No patient data here: only model id, token counts, computed cost, and a short
-- purpose label ('triage'). Retained indefinitely (it is cost accounting).

create table if not exists bedrock_usage (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  usd           numeric(12, 6) not null default 0,
  purpose       text
);

create index if not exists bedrock_usage_ts on bedrock_usage (ts desc);

alter table bedrock_usage enable row level security;

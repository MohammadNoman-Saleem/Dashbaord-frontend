// AI-costs read: sums the self-metered bedrock_usage rows into an exact,
// real-time USD total for the Nova spend, plus per-day and per-model breakdowns.
// This is our OWN token accounting (each Converse call's returned token counts x
// the per-model price), so it is precise and immediate - it does not wait on AWS
// Cost Explorer's ~1-day billing lag. The AI-costs page renders this.
//
// No patient data: cost accounting only. SERVER ONLY.
import { getPool } from '../db';

export interface AiCostDay {
  date: string;
  usd: number;
  calls: number;
}
export interface AiCostModel {
  model: string;
  usd: number;
  calls: number;
}
export interface AiCostsData {
  total_usd: number;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  last_call_at: string | null;
  by_day: AiCostDay[];
  by_model: AiCostModel[];
}

const n = (v: unknown): number => Number(v ?? 0);

export async function aiCosts(): Promise<AiCostsData> {
  const pool = getPool();

  const totals = await pool.query<{
    usd: string;
    calls: string;
    input_tokens: string;
    output_tokens: string;
    last_call_at: Date | null;
  }>(
    `select coalesce(sum(usd),0) usd, count(*) calls,
            coalesce(sum(input_tokens),0) input_tokens,
            coalesce(sum(output_tokens),0) output_tokens,
            max(ts) last_call_at
     from bedrock_usage`,
  );
  const t = totals.rows[0];

  const byDay = await pool.query<{ date: string; usd: string; calls: string }>(
    `select to_char(date_trunc('day', ts), 'YYYY-MM-DD') date,
            sum(usd) usd, count(*) calls
     from bedrock_usage group by 1 order by 1 desc limit 30`,
  );

  const byModel = await pool.query<{ model: string; usd: string; calls: string }>(
    `select model, sum(usd) usd, count(*) calls
     from bedrock_usage group by model order by sum(usd) desc`,
  );

  return {
    total_usd: n(t.usd),
    calls: n(t.calls),
    input_tokens: n(t.input_tokens),
    output_tokens: n(t.output_tokens),
    last_call_at: t.last_call_at ? t.last_call_at.toISOString() : null,
    by_day: byDay.rows.map((r) => ({ date: r.date, usd: n(r.usd), calls: n(r.calls) })),
    by_model: byModel.rows.map((r) => ({ model: r.model, usd: n(r.usd), calls: n(r.calls) })),
  };
}

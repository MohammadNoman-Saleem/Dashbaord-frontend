// Amazon Bedrock client for the reactive-inbox AI triage. Thin and memoized like
// the other integration singletons (zoho/auth.ts). It is only reached when
// TRIAGE_AI_ENABLED is on; callers treat ANY throw here (unset config, timeout,
// bad output) as "AI off" and fall back to the rule-based triage.
//
// Nova is NOT served in me-south-1; BEDROCK_REGION is a deliberate cross-region
// choice and BEDROCK_MODEL_ID a cross-region inference profile. Credentials are
// the BEDROCK_-prefixed pair (never the ambient AWS_* names) passed explicitly.
//
// PRIVACY: the caller de-identifies before calling; this module never logs the
// prompt or the completion.
//
// SERVER ONLY (Node AWS SDK). Routes that reach it declare runtime 'nodejs'.
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { getEnv } from '../env';
import { getPool } from '../db';

// Per-model on-demand price, USD per 1M tokens (in / out). Nova, from AWS Nova
// pricing. Matched by substring on the model id (inference-profile ids like
// "us.amazon.nova-micro-v1:0" contain the model name). Unknown -> micro rate,
// so a cost is never dropped silently; adjust here when a model is added.
const PRICING: Array<{ match: string; in: number; out: number }> = [
  { match: 'nova-micro', in: 0.035, out: 0.14 },
  { match: 'nova-lite', in: 0.06, out: 0.24 },
  { match: 'nova-pro', in: 0.8, out: 3.2 },
];

function priceFor(modelId: string): { in: number; out: number } {
  return PRICING.find((p) => modelId.includes(p.match)) ?? PRICING[0];
}

// Record one call's token usage + computed USD. Best-effort: never throws into
// the model path. No patient data (tokens + cost + a purpose label only).
async function recordUsage(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  purpose: string,
): Promise<void> {
  try {
    const price = priceFor(modelId);
    const usd = (inputTokens / 1e6) * price.in + (outputTokens / 1e6) * price.out;
    await getPool().query(
      `insert into bedrock_usage (model, input_tokens, output_tokens, usd, purpose)
       values ($1, $2, $3, $4, $5)`,
      [modelId, inputTokens, outputTokens, usd, purpose],
    );
  } catch (err) {
    console.warn(
      `bedrock usage record failed: ${err instanceof Error ? err.message : 'error'}`,
    );
  }
}

const CLIENT_KEY = '__saleem_bedrock__';

type GlobalWithBedrock = typeof globalThis & {
  [CLIENT_KEY]?: BedrockRuntimeClient;
};

function getClient(): BedrockRuntimeClient {
  const env = getEnv();
  if (!env.BEDROCK_REGION || !env.BEDROCK_ACCESS_KEY_ID || !env.BEDROCK_SECRET_ACCESS_KEY) {
    throw new Error('Bedrock is not configured.');
  }
  const g = globalThis as GlobalWithBedrock;
  if (!g[CLIENT_KEY]) {
    g[CLIENT_KEY] = new BedrockRuntimeClient({
      region: env.BEDROCK_REGION,
      credentials: {
        accessKeyId: env.BEDROCK_ACCESS_KEY_ID,
        secretAccessKey: env.BEDROCK_SECRET_ACCESS_KEY,
      },
    });
  }
  return g[CLIENT_KEY];
}

/** Run one Converse turn asking for strict JSON, and parse it. The model id is
 *  the configured Nova inference profile. Throws on config, timeout, transport,
 *  or non-JSON output, so the caller can fall back to rules. Returns the parsed
 *  JSON value (unvalidated; the caller validates with zod). */
export async function converseJson(
  system: string,
  user: string,
  opts: { timeoutMs: number; purpose?: string },
): Promise<unknown> {
  const client = getClient();
  const modelId = getEnv().BEDROCK_MODEL_ID;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 400, temperature: 0 },
      }),
      { abortSignal: controller.signal },
    );
    // Meter the spend from the returned token counts (exact, real-time).
    await recordUsage(
      modelId,
      res.usage?.inputTokens ?? 0,
      res.usage?.outputTokens ?? 0,
      opts.purpose ?? 'unknown',
    );
    const text = res.output?.message?.content?.[0]?.text ?? '';
    // Nova may wrap JSON in prose or a code fence; take the first {...} block.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error('No JSON object in the model output.');
    }
    return JSON.parse(text.slice(start, end + 1));
  } finally {
    clearTimeout(timer);
  }
}

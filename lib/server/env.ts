// Zod-validated environment. Fails fast at first read with a plain list of what
// is missing or malformed. No silent dev fallbacks for secrets: the old
// dashboard's "saleem-dashboard-dev-secret" fallback was flagged in the
// security review and is deliberately not repeated here.
//
// SERVER ONLY. None of these vars is NEXT_PUBLIC_-prefixed and this module must
// never be imported from a client component. dotenv loads .env for local dev;
// on the deploy platform the env is injected and .env is absent. quiet: true
// suppresses dotenv v17's promotional log lines.
//
// Ported from the NestJS backend src/config/env.ts. The Nest DI token ENV is
// replaced by a memoized getEnv() accessor: the schema is parsed once on first
// access and cached, so route handlers read a validated, typed env without
// re-parsing per request.
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ quiet: true });

const strictBool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Supabase Postgres connection string. In the self-contained app this points
  // at the transaction pooler (6543) with a small per-instance pool.
  DATABASE_URL: z
    .string()
    .min(1, 'Supabase Postgres connection string is required'),

  // Reserved for the deferred write-gate, which needs a session-scoped
  // advisory lock and so a direct (5432) connection rather than the
  // transaction pooler. Optional: nothing in the foundation requires it yet.
  DATABASE_URL_SESSION: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  MCP_SERVICE_KEY: z
    .string()
    .min(24, 'MCP_SERVICE_KEY must be at least 24 characters'),

  // Exact-origin CORS allowlist, comma separated. Same-origin in the
  // self-contained app, but kept for parity and any cross-origin MCP caller.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Zoho: the read-only OAuth client minted for saleem-api (never the legacy
  // dashboard's client; never write scopes). Optional so the app boots before
  // the client is minted; Zoho-backed endpoints throw a clear configuration
  // error until these are set.
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  ZOHO_REFRESH_TOKEN: z.string().optional(),
  ZOHO_BOOKS_ORG_ID: z.string().optional(),
  // Zoho Projects portal. When the name is set the portal id is resolved by
  // listing /portals/; otherwise the known stable portal id is used directly.
  ZOHO_PORTAL_NAME: z.string().optional(),

  // Mixpanel Query API service account (read-only basic auth). Optional so the
  // app boots before the account is set; Mixpanel-backed endpoints throw a
  // clear configuration error until all three identifiers are present.
  MIXPANEL_SERVICE_ACCOUNT_USERNAME: z.string().optional(),
  MIXPANEL_SERVICE_ACCOUNT_PASSWORD: z.string().optional(),
  MIXPANEL_PROJECT_ID: z.string().optional(),
  // Data residency. The Saleem project lives in the EU cluster.
  MIXPANEL_API_REGION: z.enum(['us', 'eu']).optional(),

  // Meta Marketing API: TellSaleem ad account only. The system user token is
  // pending another business admin's approval; until it is set, every
  // Meta-derived field serves null with the authored meta_token_pending reason.
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_BUSINESS_ID: z.string().optional(),

  // Google Drive (cockpit per-deal documents). A DEDICATED service account
  // (cockpit-drive), separate from the GA4 one below. Optional so the app boots
  // before Drive is set up; Drive-backed features degrade with a clear
  // not-configured reason until the email and key are set. The Shared Drive id
  // defaults to the cockpit drive the team created (overridable).
  GOOGLE_DRIVE_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_DRIVE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_DRIVE_SHARED_DRIVE_ID: z.string().default('0AA9q--q-_HUPUk9PVA'),

  // GA4 (Social view): service account JWT, read-only Analytics Data API.
  // Optional so the app boots before the account is copied over; the GA4
  // endpoint serves null with a clear not-configured error until all three
  // are set.
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_GA4_PROPERTY_ID: z.string().optional(),

  // LinkedIn (Social view): static 60-day bearer token, read paths only.
  // Client id/secret/refresh token are carried for the day a refresh flow
  // lands; reads use only the access token and the organization id.
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_ACCESS_TOKEN: z.string().optional(),
  LINKEDIN_REFRESH_TOKEN: z.string().optional(),
  LINKEDIN_ORGANIZATION_ID: z.string().optional(),

  // TikTok (Social view): the OAuth app identity. The read path uses the token
  // stored in the shared social_tokens table by the OLD dashboard's connect
  // flow; reconnecting happens there, never here.
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),

  // Instagram (Social view): Meta Graph token for the business account.
  // Distinct from META_SYSTEM_USER_TOKEN (ads spend); not copied from the
  // legacy env yet, so Instagram serves null with a not-configured reason.
  META_ACCESS_TOKEN: z.string().optional(),
  META_INSTAGRAM_ACCOUNT_ID: z.string().optional(),

  // Zoho Social (Social view): brand id appears in every API URL; portal id is
  // carried for completeness. Calls ride the shared Zoho OAuth client.
  ZOHO_SOCIAL_BRAND_ID: z.string().optional(),
  ZOHO_SOCIAL_PORTAL_ID: z.string().optional(),

  // Job side-effect gates. Strict string booleans: z.coerce.boolean() treats
  // the string "false" as true (any non-empty string is truthy), which would
  // silently enable every gate.
  JOBS_ENABLED: strictBool,
  LEGACY_DUPLICATED_JOBS_ENABLED: strictBool,
  EMAIL_SEND_ENABLED: strictBool,

  // Drive storage gate for generated cockpit documents. Default false: with the
  // flag off, the documents endpoint still generates and returns the .docx (the
  // case manager downloads it); it just does not upload to Google Drive.
  // Storing patient document content in the Shared Drive is held back pending
  // the data residency sign-off. Turning it on is a human decision after that
  // sign-off, never a deploy side effect. Strict string boolean.
  DRIVE_DOCS_ENABLED: strictBool,

  // Referral AI drafting gate. Default false: merging the drafting code does not
  // enable any SDK call. With the flag off, the referral draft route refuses
  // with a clear message and never reaches the model; rendering (build) is pure
  // and unaffected. Turning it on is a human decision, never a deploy side
  // effect. Strict string boolean.
  REFERRAL_AI_DRAFTING_ENABLED: strictBool,

  // Claude subscription OAuth token for the Claude Agent SDK (referral
  // drafting). Generated with `claude setup-token`. The adapter passes this
  // through to the SDK runtime.
  //
  // GOTCHA: if ANTHROPIC_API_KEY is present in the process environment, the SDK
  // SILENTLY uses it and IGNORES this OAuth token (billing then lands on the API
  // key's account, not the subscription). The app MUST run with NO
  // ANTHROPIC_API_KEY set for the subscription token to be used. The boot-time
  // strip in init.ts enforces this.
  CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),

  // Cockpit write gate. Default false: merging the gate code does not enable any
  // write to Zoho CRM. prepare may run for testing while this is false, but
  // commit refuses with a clear "writes disabled" response. Turning it on
  // against production is a human cutover after sign-off, never a deploy side
  // effect. Strict string boolean.
  WRITE_GATE_ENABLED: strictBool,

  // Reactive-inbox AI triage gate. Default false: the inbox always runs the
  // rule-based triage; with this on, matched inbound messages are additionally
  // refined by Amazon Nova (Bedrock). Turning it on is a human decision.
  TRIAGE_AI_ENABLED: strictBool,
  // Bedrock config. Nova is NOT served in me-south-1 (Bahrain), so the region is
  // a deliberate cross-region choice (e.g. eu-west-1) and the model id is a
  // cross-region inference profile. Keys are BEDROCK_-prefixed, NOT the bare
  // AWS_* names the SDK picks up ambiently (same isolation reason as the
  // ANTHROPIC_API_KEY strip in init.ts); they are passed explicitly to the
  // client. All optional so the app boots before Bedrock is set; when
  // TRIAGE_AI_ENABLED is on but these are missing, triage falls back to rules.
  BEDROCK_REGION: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().default('eu.amazon.nova-micro-v1:0'),
  BEDROCK_ACCESS_KEY_ID: z.string().optional(),
  BEDROCK_SECRET_ACCESS_KEY: z.string().optional(),

  // Git sha stamped by the deploy pipeline; surfaced on /healthz.
  GIT_SHA: z.string().default('dev'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  ${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`Environment validation failed:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

// Memoized accessor. Parse once per warm instance; cache the validated env so
// every route reads it without re-running the schema. Pinned on globalThis so a
// dev hot reload does not re-parse and re-warn.
const ENV_KEY = '__saleem_env__';

type GlobalWithEnv = typeof globalThis & { [ENV_KEY]?: Env };

export function getEnv(): Env {
  const g = globalThis as GlobalWithEnv;
  if (!g[ENV_KEY]) {
    g[ENV_KEY] = loadEnv();
  }
  return g[ENV_KEY];
}

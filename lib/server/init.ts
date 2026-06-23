// Cold-start guard. Ported from the NestJS backend src/main.ts bootstrap().
//
// The Claude Agent SDK is the committed integration path (subscription OAuth
// token, CLAUDE_CODE_OAUTH_TOKEN). If ANTHROPIC_API_KEY is present in the
// process environment, the SDK SILENTLY prefers it and bills the wrong account.
// Delete it before anything reads it, and warn once (never the value) so the
// subscription token is used. This enforces the GOTCHA documented in env.ts.
//
// SERVER ONLY. Runs once per warm instance on first import. db.ts imports this
// so any route that touches the pool (which is every authenticated route) runs
// the strip on cold start, regardless of whether the document/referral path is
// reached.
const INIT_KEY = '__saleem_init_done__';

type GlobalWithInit = typeof globalThis & { [INIT_KEY]?: true };

function runColdStartInit(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    delete process.env.ANTHROPIC_API_KEY;
    // Never log the value. One line, once per cold start.
    console.warn(
      'ANTHROPIC_API_KEY was set and has been removed at boot so the Claude subscription token (CLAUDE_CODE_OAUTH_TOKEN) is used.',
    );
  }
}

export function ensureColdStartInit(): void {
  const g = globalThis as GlobalWithInit;
  if (g[INIT_KEY]) return;
  g[INIT_KEY] = true;
  runColdStartInit();
}

// Run on module import so the strip happens before any SDK module is loaded.
ensureColdStartInit();

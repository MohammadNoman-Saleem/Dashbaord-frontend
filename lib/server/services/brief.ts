// The latest weekly brief, read from the legacy agent_runs table. The
// weekly-brief-compiler agent stores its whole brief as JSON in the summary
// column: { generated_at, week_of, alerts: [{ level, text, source }],
// sections: [{ title, content, ran_at }], ... }.
//
// Ported from the NestJS backend src/brief/brief.service.ts. The @Injectable
// BriefService with @Inject(PG_POOL) becomes a globalThis-pinned singleton
// (g.__briefRead) reading the shared pg pool via getPool(). The JSON parse,
// highlight derivation, and section mapping are kept VERBATIM. The NotFound
// path now throws the foundation NotFoundError (the handler turns it into the
// { data:null, meta:{ reliable:false, error } } envelope with a 404).
//
// No patient data: the brief is an aggregate ops summary. SERVER ONLY. Node
// runtime (it reaches pg through getPool()).
import type { Pool } from 'pg';
import { getPool } from '../db';
import { NotFoundError } from '../errors';

export interface BriefPayload {
  compiled_at: string;
  highlights: Array<{ title: string; text: string; good: boolean }>;
  sections: Array<{ title: string; content: string; ran_at: string }>;
}

interface BriefAlert {
  level?: string;
  text?: string;
  source?: string;
}

interface BriefSection {
  title?: string;
  content?: string;
  ran_at?: string;
}

interface CompiledBrief {
  generated_at?: string;
  alerts?: BriefAlert[];
  sections?: BriefSection[];
}

/** First sentence of a section, capped so a highlight stays one line. */
function firstSentence(content: string): string {
  const trimmed = content.trim();
  const idx = trimmed.indexOf('. ');
  const sentence = idx > 0 ? trimmed.slice(0, idx + 1) : trimmed;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
}

class BriefService {
  constructor(private readonly pool: Pool) {}

  async latest(): Promise<BriefPayload> {
    const { rows } = await this.pool.query<{
      summary: string | null;
      run_at: Date;
    }>(
      `select summary, run_at from agent_runs
       where agent_name = 'weekly-brief-compiler' and status = 'success'
       order by run_at desc
       limit 1`,
    );
    const row = rows[0];
    if (!row?.summary) {
      throw new NotFoundError('No weekly brief has been compiled yet.');
    }

    let brief: CompiledBrief;
    try {
      brief = JSON.parse(row.summary) as CompiledBrief;
    } catch {
      throw new NotFoundError(
        'The latest weekly brief could not be read. Ask for a recompile.',
      );
    }

    const sections = (brief.sections ?? []).map((s) => ({
      title: s.title ?? '',
      content: s.content ?? '',
      ran_at: s.ran_at ?? new Date(row.run_at).toISOString(),
    }));

    const alerts = (brief.alerts ?? []).filter((a) => a.text);
    const highlights =
      alerts.length > 0
        ? alerts.slice(0, 3).map((a) => ({
            title: a.text ?? '',
            text: `Raised by the ${a.source ?? 'weekly brief'} agent.`,
            good: a.level !== 'high',
          }))
        : sections.slice(0, 3).map((s) => ({
            title: s.title,
            text: firstSentence(s.content),
            good: true,
          }));

    return {
      compiled_at: brief.generated_at ?? new Date(row.run_at).toISOString(),
      highlights,
      sections,
    };
  }
}

// globalThis-pinned singleton: reuses the one shared pg pool across every
// warm serverless instance, mirroring the single DI provider in Nest.
const BRIEF_READ_KEY = '__briefRead';

type GlobalWithBriefRead = typeof globalThis & {
  [BRIEF_READ_KEY]?: BriefService;
};

export function getBriefRead(): BriefService {
  const g = globalThis as GlobalWithBriefRead;
  if (!g[BRIEF_READ_KEY]) {
    g[BRIEF_READ_KEY] = new BriefService(getPool());
  }
  return g[BRIEF_READ_KEY];
}

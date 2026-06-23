// The response envelope: every endpoint returns { data, meta }.
// Honesty travels in meta; the frontend and the MCP render staleness and
// reliability purely from it. Plain-language reasons are authored here,
// server-side, so the web app and the MCP say the same words.
//
// Ported verbatim from the NestJS backend src/common/envelope.ts, minus
// @nestjs/swagger: the ApiProperty-decorated classes (ReasonDto, MetaErrorDto,
// MetaDto) become plain interfaces. All functions and the ENVELOPE_BRAND symbol
// are unchanged. SERVER ONLY by convention (the brand symbol and meta helpers
// live with the handler), though this module imports nothing Node-specific.

export interface ReasonDto {
  key: string;
  title: string;
  text: string;
  owner?: string;
  due?: string;
}

export interface MetaErrorDto {
  message_plain: string;
}

export interface MetaDto {
  updated_at: string;
  cached: boolean;
  stale: boolean;
  reliable: boolean;
  reasons: ReasonDto[];
  error?: MetaErrorDto;
}

export interface Envelope<T> {
  data: T | null;
  meta: MetaDto;
}

// Source-level metadata produced by the cache layer for each upstream read.
export interface SourceMeta {
  fetched_at: Date;
  cached: boolean;
  stale: boolean;
  reliable?: boolean;
  reasons?: ReasonDto[];
}

export const ENVELOPE_BRAND = Symbol('saleem.envelope');

export interface BrandedEnvelope<T> extends Envelope<T> {
  [ENVELOPE_BRAND]: true;
}

export function freshMeta(): MetaDto {
  return {
    updated_at: new Date().toISOString(),
    cached: false,
    stale: false,
    reliable: true,
    reasons: [],
  };
}

/** Wrap handler data with explicit meta. The handler passes it through. */
export function withMeta<T>(
  data: T,
  meta: Partial<MetaDto> = {},
): BrandedEnvelope<T> {
  return {
    [ENVELOPE_BRAND]: true,
    data,
    meta: { ...freshMeta(), ...meta },
  };
}

export function isBrandedEnvelope(
  value: unknown,
): value is BrandedEnvelope<unknown> {
  return typeof value === 'object' && value !== null && ENVELOPE_BRAND in value;
}

/** Merge per-source metadata: oldest fetch wins updated_at, cached/stale OR,
 *  reliable AND, reasons concatenated. */
export function mergeMeta(parts: SourceMeta[]): MetaDto {
  if (parts.length === 0) return freshMeta();
  const oldest = parts.reduce(
    (min, p) => (p.fetched_at < min ? p.fetched_at : min),
    parts[0].fetched_at,
  );
  return {
    updated_at: oldest.toISOString(),
    cached: parts.some((p) => p.cached),
    stale: parts.some((p) => p.stale),
    reliable: parts.every((p) => p.reliable !== false),
    reasons: parts.flatMap((p) => p.reasons ?? []),
  };
}

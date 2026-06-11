/* Response envelope types mirroring saleem-api's contract (MetaDto, ReasonDto,
   MetaErrorDto in openapi/openapi.json). Hand-written for now; these will be
   superseded by generated types later. Keep every envelope type in this one
   file so the swap is a single import change. */

export type Reason = {
  key: string;
  title: string;
  text: string;
  owner?: string;
  /* ISO date, e.g. "2026-06-12". */
  due?: string;
};

export type MetaError = {
  message_plain: string;
};

export type Meta = {
  /* ISO timestamp, e.g. "2026-06-11T07:42:00+03:00". */
  updated_at: string;
  cached: boolean;
  stale: boolean;
  reliable: boolean;
  reasons: Reason[];
  error?: MetaError;
};

export type Envelope<T> = {
  data: T | null;
  meta: Meta;
};

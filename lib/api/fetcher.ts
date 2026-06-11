// The single seam between panels and data. Each endpoint resolves to either
// its fixture (loaded from lib/fixtures, wrapped in a realistic envelope) or
// the live saleem-api, per config/endpoints.ts. Panels call the typed hooks
// and never know which path served them.
import type { Envelope } from './envelope'
import { ENDPOINT_MODES, type EndpointKey } from '@/config/endpoints'
import { getFixture } from '@/lib/fixtures'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly messagePlain?: string,
  ) {
    super(message)
  }
}

/** Small artificial delay so fixture mode exercises loading states. */
function fixtureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150))
}

export async function fetchEnvelope<T>(
  key: EndpointKey,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<Envelope<T>> {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) search.set(k, String(v))
  }
  const qs = search.size > 0 ? `?${search.toString()}` : ''

  if (ENDPOINT_MODES[key] === 'fixture') {
    await fixtureDelay()
    return getFixture<T>(key, params)
  }

  const res = await fetch(`${API_BASE}/api${path}${qs}`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok) {
    throw new ApiError(
      `${path} responded ${res.status}`,
      res.status,
      body?.meta?.error?.message_plain,
    )
  }
  if (!body) {
    throw new ApiError(`${path} returned an empty body`, res.status)
  }
  return body
}

/** Write through the same seam. Fixture mode settles after the same short
 *  delay with no server effect, so optimistic cache updates remain the whole
 *  story until the endpoint flips to live. */
export async function mutateEnvelope<T>(
  key: EndpointKey,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Envelope<T> | null> {
  if (ENDPOINT_MODES[key] === 'fixture') {
    await fixtureDelay()
    return null
  }

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const payload = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!res.ok) {
    throw new ApiError(
      `${method} ${path} responded ${res.status}`,
      res.status,
      payload?.meta?.error?.message_plain,
    )
  }
  return payload
}

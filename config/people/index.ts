// Exhaustive person config map for the home engine. Adding a PersonKey in
// types.ts without a config here fails the typecheck.
import type { PersonHomeConfig, PersonKey } from './types'

import { afaf } from './afaf'
import { alsaeed } from './alsaeed'
import { aziz } from './aziz'
import { fatima } from './fatima'
import { isa } from './isa'
import { khalid } from './khalid'
import { noman } from './noman'
import { razan } from './razan'

export const PEOPLE: Record<PersonKey, PersonHomeConfig> = {
  khalid,
  fatima,
  afaf,
  razan,
  aziz,
  noman,
  alsaeed,
  isa,
}

/** Narrows an arbitrary string (the ?as= value, me.person) to a PersonKey. */
export function isPersonKey(value: string): value is PersonKey {
  return value in PEOPLE
}

export type { PanelId, PersonHomeConfig, PersonKey } from './types'

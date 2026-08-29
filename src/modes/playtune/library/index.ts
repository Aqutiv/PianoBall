import type { Tune } from '../chart';
import { ODE_TO_JOY, TWINKLE, AMAZING_GRACE, SCARBOROUGH_FAIR, GREENSLEEVES,
  FUR_ELISE, LONDONDERRY_AIR, MINUET_IN_G, GYMNOPEDIE, CANON_IN_D, JESU_JOY } from './classics';
import { FIRST_LIGHT, DRIFT, TWO_HANDS } from './originals';

/**
 * The library, in the order it is unlocked.
 *
 * Public-domain melodies are the spine; the three originals sit where a new
 * mechanic has to be introduced on something the player has no expectations
 * about — timing first, then sustains, then playing two notes at once.
 */
export const LIBRARY: Tune[] = [
  FIRST_LIGHT,
  ODE_TO_JOY,
  TWINKLE,
  AMAZING_GRACE,
  SCARBOROUGH_FAIR,
  DRIFT,
  GREENSLEEVES,
  FUR_ELISE,
  LONDONDERRY_AIR,
  MINUET_IN_G,
  GYMNOPEDIE,
  TWO_HANDS,
  CANON_IN_D,
  JESU_JOY,
];

export const TUNE_ORDER: string[] = LIBRARY.map((t) => t.id);

const BY_ID = new Map(LIBRARY.map((t) => [t.id, t]));

export function findTune(id: string): Tune | undefined { return BY_ID.get(id); }

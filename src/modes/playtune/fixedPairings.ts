import type { Tune } from './chart';
import type { ChordRole } from './chords';

/** One authored arrangement per role and piece; IDs also travel in the native v1 catalogue. */
export const FIXED_PAIRINGS = {
  melody: {
    'first-light': { keyVoicing: 'lead', keys: 'vibraphone', backing: 'warm' },
    'ode-to-joy': { keyVoicing: 'lead', keys: 'trumpet', backing: 'strings' },
    'twinkle': { keyVoicing: 'lead', keys: 'music-box', backing: 'bed-harp' },
    'frere-jacques': { keyVoicing: 'lead', keys: 'marimba', backing: 'nylon-guitar' },
    'amazing-grace': { keyVoicing: 'lead', keys: 'harmonica', backing: 'bed-organ' },
    'scarborough-fair': { keyVoicing: 'lead', keys: 'breath-flute', backing: 'nylon-guitar' },
    'hopscotch': { keyVoicing: 'lead', keys: 'wurlitzer', backing: 'clean-electric-guitar' },
    'yankee-doodle': { keyVoicing: 'lead', keys: 'trumpet', backing: 'grand' },
    'drunken-sailor': { keyVoicing: 'lead', keys: 'accordion', backing: 'steel-string-guitar' },
    'greensleeves': { keyVoicing: 'lead', keys: 'breath-flute', backing: 'bed-harp' },
    'fur-elise': { keyVoicing: 'lead', keys: 'grand', backing: 'grand' },
    'londonderry-air': { keyVoicing: 'lead', keys: 'solo-string', backing: 'grand' },
    'la-bamba': { keyVoicing: 'lead', keys: 'trumpet', backing: 'nylon-guitar' },
    'le-temps-des-cerises': { keyVoicing: 'lead', keys: 'accordion', backing: 'nylon-guitar' },
    'hava-nagila': { keyVoicing: 'lead', keys: 'accordion', backing: 'nylon-guitar' },
    'can-can': { keyVoicing: 'lead', keys: 'grand', backing: 'brass-ensemble' },
    'minuet-in-g': { keyVoicing: 'lead', keys: 'harp', backing: 'strings' },
    'gymnopedie': { keyVoicing: 'lead', keys: 'felt-piano', backing: 'bed-felt-piano' },
    'two-hands': { keyVoicing: 'lead', keys: 'wurlitzer', backing: 'clean-electric-guitar' },
    'irish-washerwoman': { keyVoicing: 'lead', keys: 'solo-string', backing: 'steel-string-guitar' },
    'blue-danube': { keyVoicing: 'lead', keys: 'solo-string', backing: 'strings' },
    'canon-in-d': { keyVoicing: 'lead', keys: 'solo-string', backing: 'bed-harp' },
    'jesu-joy': { keyVoicing: 'lead', keys: 'pipe-organ', backing: 'strings' },
    'the-entertainer': { keyVoicing: 'lead', keys: 'grand', backing: 'grand' },
  },
  chords: {
    'frere-jacques': { keyVoicing: 'bed', keys: 'nylon-guitar', backing: 'marimba' },
    'ode-to-joy': { keyVoicing: 'bed', keys: 'strings', backing: 'trumpet' },
    'chord-ground': { keyVoicing: 'lead', keys: 'electric-bass', backing: 'grand' },
    'twinkle': { keyVoicing: 'lead', keys: 'harp', backing: 'bed-music-box' },
    'chord-march': { keyVoicing: 'lead', keys: 'clavinet', backing: 'bed-electric-piano' },
    'yankee-doodle': { keyVoicing: 'lead', keys: 'grand', backing: 'trumpet' },
    'hopscotch': { keyVoicing: 'bed', keys: 'clean-electric-guitar', backing: 'wurlitzer' },
    'drunken-sailor': { keyVoicing: 'bed', keys: 'steel-string-guitar', backing: 'bed-accordion' },
    'canon-in-d': { keyVoicing: 'lead', keys: 'harp', backing: 'solo-string' },
    'amazing-grace': { keyVoicing: 'lead', keys: 'drawbar', backing: 'harmonica' },
    'scarborough-fair': { keyVoicing: 'bed', keys: 'nylon-guitar', backing: 'breath-flute' },
    'la-bamba': { keyVoicing: 'bed', keys: 'nylon-guitar', backing: 'trumpet' },
    'le-temps-des-cerises': { keyVoicing: 'bed', keys: 'nylon-guitar', backing: 'bed-accordion' },
    'hava-nagila': { keyVoicing: 'bed', keys: 'nylon-guitar', backing: 'bed-accordion' },
    'gymnopedie': { keyVoicing: 'lead', keys: 'felt-piano', backing: 'bed-felt-piano' },
    'londonderry-air': { keyVoicing: 'lead', keys: 'grand', backing: 'solo-string' },
    'greensleeves': { keyVoicing: 'lead', keys: 'harp', backing: 'breath-flute' },
    'irish-washerwoman': { keyVoicing: 'bed', keys: 'steel-string-guitar', backing: 'solo-string' },
    'can-can': { keyVoicing: 'bed', keys: 'brass-ensemble', backing: 'grand' },
    'blue-danube': { keyVoicing: 'bed', keys: 'strings', backing: 'solo-string' },
    'fur-elise': { keyVoicing: 'lead', keys: 'grand', backing: 'grand' },
    'minuet-in-g': { keyVoicing: 'bed', keys: 'strings', backing: 'bed-harp' },
    'jesu-joy': { keyVoicing: 'bed', keys: 'strings', backing: 'pipe-organ' },
    'the-entertainer': { keyVoicing: 'lead', keys: 'grand', backing: 'grand' },
  },
} as const;

/** Apply at source definition time so validation, captions, playback and export agree. */
export function melodyInstruments(id: keyof typeof FIXED_PAIRINGS.melody): Required<Pick<Tune, 'voiceId' | 'bedVoiceId'>> {
  const voices = FIXED_PAIRINGS.melody[id];
  return { voiceId: voices.keys, bedVoiceId: voices.backing };
}

/** Missing choices are authoring errors, never a request to choose a default or random voice. */
export function backingInstruments(id: string): Pick<ChordRole, 'keyVoicing' | 'keysVoiceId' | 'melodyVoiceId'> {
  if (!Object.hasOwn(FIXED_PAIRINGS.chords, id)) throw new Error(`No fixed Backing instruments for "${id}"`);
  const voices = FIXED_PAIRINGS.chords[id as keyof typeof FIXED_PAIRINGS.chords];
  return { keyVoicing: voices.keyVoicing, keysVoiceId: voices.keys, melodyVoiceId: voices.backing };
}

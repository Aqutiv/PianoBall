import type { CompPart, CompPattern } from '../../audio/comp';
import type { KeyVoicing } from '../../audio/engine';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../../audio/voices';
import type { ChartChord, ChartNote, Tune } from './chart';
import { chordChart } from './chords';
import { CHORD_CURVE, CHORD_ORDER, CHORD_TUNES, findChordEntry } from './library/chordcurve';
import { LIBRARY, TUNE_ORDER } from './library';
import { BACKING_STORE, MELODY_STORE } from './progress';

export type RoleId = 'melody' | 'chords';

/** What the game plays while the player plays their own part. */
export interface Backing {
  chords: readonly ChartChord[];
  pattern: CompPattern;
  /** Which parts of the accompaniment the bed sounds. The player owns the rest. */
  parts: readonly CompPart[];
  /** The tune itself, when the player is not the one playing it. */
  notes: readonly ChartNote[] | null;
}

/** What the song card says about a tune, which depends on which part you play. */
export interface RoleCard {
  difficulty: 1 | 2 | 3 | 4 | 5;
  teaches: string;
  pass: number;
}

/**
 * One half of PlayTune.
 *
 * The two roles are the same game seen from either side of the arrangement: in
 * one the player has the tune and the game has the harmony, in the other they
 * swap. Everything that makes the mode work — the transport, the judge, the
 * auras, the HUD, the scoring — is indifferent to which, so this interface is
 * the whole of the difference between them.
 */
export interface TuneRole {
  readonly id: RoleId;
  /** Namespaced under `pianoball.`. Each role earns its own unlocks. */
  readonly storageKey: string;
  /** The toggle button on the song list. */
  readonly label: string;
  readonly title: string;
  readonly lede: string;
  /** The curve, in unlock order. */
  readonly tunes: readonly Tune[];
  readonly order: readonly string[];
  /** What the player is asked to play, before `fitToRange` moves it. */
  chart(tune: Tune): ChartNote[];
  backing(tune: Tune): Backing;
  card(tune: Tune): RoleCard;
  /** Player voice bank and instrument, plus the automatic part's bed voice. */
  voices(tune: Tune): { keyVoicing: KeyVoicing; keys: string; backing: string };
}

/** Learning a melody. The game plays the harmony underneath. */
export const MELODY_ROLE: TuneRole = {
  id: 'melody',
  storageKey: MELODY_STORE,
  label: 'Melody',
  title: 'PlayTune',
  lede: 'The game plays the chords. You play the tune on top — press each key as its aura reaches it.',
  tunes: LIBRARY,
  order: TUNE_ORDER,
  chart: (tune) => tune.melody,
  backing: (tune) => tune.backingNotes ? {
    chords: [], pattern: 'sustain', parts: [], notes: tune.backingNotes,
  } : ({
    chords: tune.chords,
    pattern: tune.accompaniment,
    parts: ['chord', 'bass', 'wash'],
    notes: null,
  }),
  card: (tune) => ({ difficulty: tune.difficulty, teaches: tune.teaches, pass: tune.pass }),
  voices: (tune) => ({
    keyVoicing: 'lead',
    keys: tune.voiceId ?? DEFAULT_LEAD_VOICE,
    backing: tune.bedVoiceId ?? DEFAULT_BED_VOICE,
  }),
};

/** Play the authored accompaniment while the game supplies only the melody. */
export const CHORDS_ROLE: TuneRole = {
  id: 'chords',
  storageKey: BACKING_STORE,
  label: 'Backing',
  title: 'Play Backing',
  lede: 'The game plays the melody. You play the backing—follow the bass notes, chords, and patterns underneath.',
  tunes: CHORD_TUNES,
  order: CHORD_ORDER,
  chart: (tune) => {
    const entry = findChordEntry(tune.id);
    return entry ? chordChart(tune, entry.role) : [];
  },
  backing: (tune) => ({ chords: [], pattern: 'sustain', parts: [], notes: tune.melody }),
  card: (tune) => {
    const role = findChordEntry(tune.id)?.role;
    return role
      ? { difficulty: role.difficulty, teaches: role.teaches, pass: role.pass }
      : { difficulty: tune.difficulty, teaches: tune.teaches, pass: tune.pass };
  },
  voices: (tune) => {
    const role = findChordEntry(tune.id)?.role;
    return {
      keyVoicing: role?.keyVoicing ?? 'lead',
      keys: role?.keysVoiceId ?? 'felt-piano',
      backing: role?.melodyVoiceId ?? 'bed-felt-piano',
    };
  },
};

export const ROLES: Record<RoleId, TuneRole> = {
  melody: MELODY_ROLE,
  chords: CHORDS_ROLE,
};

/** Every chord-curve entry, for the tests and nothing else. */
export { CHORD_CURVE };
